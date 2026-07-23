import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { start } from "workflow/api"

import { db } from "@/db"
import { scrapeJobs, users } from "@/db/schema"
import {
  completeMappingAndStartFiltering,
  createScrapeJobsAndStartScraping,
  requestScrapeRunCancellation,
} from "@/lib/server/scrape-runs/lifecycle-repository"
import {
  claimScrapeRun,
  createScrapeRun,
  findOwnedScrapeRun,
} from "@/lib/server/scrape-runs/repository"
import { newScrapeRunSchema } from "@/lib/scrape-runs/new-scrape-run"
import { server } from "@/tests/mocks/server"
import { processScrapeJobTwiceWorkflow } from "@/tests/workflow/process-scrape-job-twice-workflow"
import { scrapeRunWorkflow } from "@/workflows/scrape-runs"
import type { ClaimedScrapeRun } from "@/workflows/scrape-runs/steps"

let userSequence = 0

type CreatedScrapeRun = Awaited<ReturnType<typeof createScrapeRun>>

async function seedPendingRun() {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: `Job Workflow User ${userSequence}`,
      email: `job-workflow-${userSequence}@example.com`,
    })
    .returning()
  const configuration = {
    ...newScrapeRunSchema.parse({
      name: "Customer stories",
      url: "https://example.com/",
      exampleUrls: [
        "https://example.com/customers/acme",
        "https://example.com/customers/globex",
      ],
      fields: [
        {
          label: "Client Name",
          description: "The customer name",
          required: true,
          primaryIdentifier: true,
        },
      ],
    }),
    filteringModel: "anthropic/claude-sonnet-4.5",
  }
  const run = await createScrapeRun({ userId: user.id, configuration })

  return { user, run }
}

function workflowRunInput(run: CreatedScrapeRun): ClaimedScrapeRun {
  return {
    scrapeRunId: run.id,
    targetUrl: run.targetUrl,
    exampleUrls: [...run.exampleUrls],
    filteringModel: run.filteringModel,
    fields: run.fields.map((field) => ({
      label: field.label,
      key: field.key,
      description: field.description,
      required: field.required,
      primaryIdentifier: field.primaryIdentifier,
    })),
  }
}

function gatewayGeneration(urls: string[]) {
  return {
    content: [{ type: "text", text: JSON.stringify({ urls }) }],
    finishReason: { unified: "stop" },
    usage: {
      inputTokens: { total: 10, noCache: 10 },
      outputTokens: { total: 10, text: 10 },
    },
    warnings: [],
  }
}

function successfulScrape(json: unknown) {
  return HttpResponse.json({ success: true, data: { json } })
}

function usePreparationHandlers(canonicalPageUrls: string[]) {
  server.use(
    http.post("https://api.firecrawl.dev/v2/map", () =>
      HttpResponse.json({
        success: true,
        links: canonicalPageUrls.map((url) => ({ url })),
      }),
    ),
    http.post("https://ai-gateway.vercel.sh/v4/ai/language-model", () =>
      HttpResponse.json(gatewayGeneration(canonicalPageUrls)),
    ),
  )
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

beforeEach(async () => {
  await db.delete(users)
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-workflow-test")
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-workflow-test")
})

describe("scrape-run Scraping Workflow", () => {
  it("completes a mixed-outcome run while retaining each successful Extraction Result", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    const urls = [
      "https://example.com/customers/acme",
      "https://example.com/customers/globex",
      "https://example.com/customers/initech",
    ]
    const calls = new Map<string, number>()
    usePreparationHandlers(urls)
    server.use(
      http.post("https://api.firecrawl.dev/v2/scrape", async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        calls.set(url, (calls.get(url) ?? 0) + 1)

        if (url.endsWith("/globex")) {
          return successfulScrape({ client_name: null })
        }

        if (url.endsWith("/initech")) {
          return HttpResponse.json(
            { success: false, error: "invalid authentication" },
            { status: 401 },
          )
        }

        return successfulScrape({ client_name: "Acme" })
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])

    await expect(workflowRun.returnValue).resolves.toEqual({
      outcome: "complete",
      scrapeRunId: pendingRun.id,
      jobCount: 3,
    })
    const persistedRun = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })
    const jobs = await db.query.scrapeJobs.findMany({
      where: (job, { eq }) => eq(job.scrapeRunId, pendingRun.id),
      orderBy: scrapeJobs.id,
    })

    expect([...calls.values()]).toEqual([1, 1, 1])
    expect(persistedRun).toMatchObject({
      status: "complete",
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "complete" },
        { stage: "scraping", status: "complete" },
      ],
    })
    expect(jobs).toEqual([
      expect.objectContaining({
        url: urls[0],
        status: "complete",
        attemptCount: 1,
        result: { client_name: "Acme" },
      }),
      expect.objectContaining({
        url: urls[1],
        status: "failed",
        attemptCount: 1,
        result: null,
        failureCode: "missing_required_fields",
        missingRequiredFieldKeys: ["client_name"],
      }),
      expect.objectContaining({
        url: urls[2],
        status: "failed",
        attemptCount: 1,
        result: null,
        failureCode: "scrape_failed",
      }),
    ])
  })

  it("fails Scraping and the run when every scrape job fails", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    const urls = [
      "https://example.com/customers/acme",
      "https://example.com/customers/globex",
    ]
    usePreparationHandlers(urls)
    server.use(
      http.post("https://api.firecrawl.dev/v2/scrape", () =>
        successfulScrape({ client_name: null }),
      ),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])

    await expect(workflowRun.returnValue).resolves.toEqual({
      outcome: "failed",
      scrapeRunId: pendingRun.id,
      jobCount: 2,
    })
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: pendingRun.id }),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "scrape_failed",
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "complete" },
        {
          stage: "scraping",
          status: "failed",
          failureCode: "scrape_failed",
        },
      ],
    })
  })

  it("retries one transient scrape failure three total attempts without repeating successful jobs", async () => {
    const { run: pendingRun } = await seedPendingRun()
    const urls = [
      "https://example.com/customers/acme",
      "https://example.com/customers/globex",
    ]
    const calls = new Map<string, number>()
    usePreparationHandlers(urls)
    server.use(
      http.post("https://api.firecrawl.dev/v2/scrape", async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        const attempt = (calls.get(url) ?? 0) + 1
        calls.set(url, attempt)

        if (url.endsWith("/acme") && attempt < 3) {
          return HttpResponse.json(
            { success: false, error: "transient upstream failure" },
            { status: 503 },
          )
        }

        return successfulScrape({ client_name: url.split("/").at(-1) })
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])

    await expect(workflowRun.returnValue).resolves.toMatchObject({
      outcome: "complete",
      jobCount: 2,
    })
    expect(calls).toEqual(
      new Map([
        [urls[0], 3],
        [urls[1], 1],
      ]),
    )
    const jobs = await db.query.scrapeJobs.findMany({
      where: (job, { eq }) => eq(job.scrapeRunId, pendingRun.id),
      orderBy: scrapeJobs.id,
    })
    expect(
      jobs.map(({ status, attemptCount }) => ({ status, attemptCount })),
    ).toEqual([
      { status: "complete", attemptCount: 3 },
      { status: "complete", attemptCount: 1 },
    ])
  })

  it("does not call Firecrawl when an already-completed job is replayed", async () => {
    const { run: pendingRun } = await seedPendingRun()
    const urls = [
      "https://example.com/customers/acme",
      "https://example.com/customers/globex",
    ]
    let scrapeCalls = 0
    usePreparationHandlers(urls)
    server.use(
      http.post("https://api.firecrawl.dev/v2/scrape", async ({ request }) => {
        scrapeCalls += 1
        const { url } = (await request.json()) as { url: string }
        return successfulScrape({ client_name: url.split("/").at(-1) })
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])
    await expect(workflowRun.returnValue).resolves.toMatchObject({
      outcome: "complete",
    })
    const [completedJob] = await db.query.scrapeJobs.findMany({
      where: (job, { eq }) => eq(job.scrapeRunId, pendingRun.id),
      orderBy: scrapeJobs.id,
    })
    const replayRun = await start(processScrapeJobTwiceWorkflow, [
      workflowRunInput(pendingRun),
      { id: completedJob.id },
    ])

    await expect(replayRun.returnValue).resolves.toEqual([
      { outcome: "complete", scrapeJobId: completedJob.id },
      { outcome: "complete", scrapeJobId: completedJob.id },
    ])
    expect(scrapeCalls).toBe(2)
    await expect(
      db.query.scrapeJobs.findFirst({
        where: (job, { eq }) => eq(job.id, completedJob.id),
      }),
    ).resolves.toMatchObject({ status: "complete", attemptCount: 1 })
  })

  it("does not call Firecrawl when cancellation is requested before a job claim", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    await claimScrapeRun({
      scrapeRunId: pendingRun.id,
      workflowRunId: `pre-call-guard-${pendingRun.id}`,
    })
    await completeMappingAndStartFiltering({ scrapeRunId: pendingRun.id })
    const jobs = await createScrapeJobsAndStartScraping({
      scrapeRunId: pendingRun.id,
      canonicalPageUrls: [
        "https://example.com/customers/acme",
        "https://example.com/customers/globex",
      ],
    })
    if (!jobs) {
      throw new Error("Expected Scraping to start")
    }

    await requestScrapeRunCancellation({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })
    const [guardedJob] = jobs
    let scrapeCalls = 0
    server.use(
      http.post("https://api.firecrawl.dev/v2/scrape", () => {
        scrapeCalls += 1
        return successfulScrape({ client_name: "Should not be called" })
      }),
    )

    const guardedRun = await start(processScrapeJobTwiceWorkflow, [
      workflowRunInput(pendingRun),
      { id: guardedJob.id },
    ])

    await expect(guardedRun.returnValue).resolves.toEqual([
      { outcome: "stopped", scrapeJobId: guardedJob.id },
      { outcome: "stopped", scrapeJobId: guardedJob.id },
    ])
    expect(scrapeCalls).toBe(0)
    await expect(
      db.query.scrapeJobs.findFirst({
        where: (job, { eq }) => eq(job.id, guardedJob.id),
      }),
    ).resolves.toMatchObject({ status: "pending", attemptCount: 0 })
  })

  it("runs deterministic non-overlapping batches of at most five scrape calls", async () => {
    const { run: pendingRun } = await seedPendingRun()
    const urls = Array.from(
      { length: 7 },
      (_, index) => `https://example.com/customers/client-${index + 1}`,
    )
    urls[0] = "https://example.com/customers/acme"
    urls[1] = "https://example.com/customers/globex"
    const firstBatchGates = Array.from({ length: 5 }, () => deferred())
    let scrapeCalls = 0
    let activeCalls = 0
    let maximumActiveCalls = 0
    let firstBatchOutstanding = 5
    let secondBatchOverlapped = false
    usePreparationHandlers(urls)
    server.use(
      http.post("https://api.firecrawl.dev/v2/scrape", async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        const callIndex = scrapeCalls
        scrapeCalls += 1
        activeCalls += 1
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls)

        if (callIndex < 5) {
          await firstBatchGates[callIndex].promise
          firstBatchOutstanding -= 1
        } else if (firstBatchOutstanding > 0) {
          secondBatchOverlapped = true
        }

        activeCalls -= 1
        return successfulScrape({ client_name: url.split("/").at(-1) })
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])
    await vi.waitFor(() => expect(scrapeCalls).toBe(5), { timeout: 10_000 })

    firstBatchGates[0].resolve()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(scrapeCalls).toBe(5)

    for (const gate of firstBatchGates.slice(1)) {
      gate.resolve()
    }

    await expect(workflowRun.returnValue).resolves.toMatchObject({
      outcome: "complete",
      jobCount: 7,
    })
    expect(scrapeCalls).toBe(7)
    expect(maximumActiveCalls).toBe(5)
    expect(secondBatchOverlapped).toBe(false)
  })

  it("does not persist late scrape responses after a Cancellation Request wins", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    const urls = Array.from(
      { length: 7 },
      (_, index) => `https://example.com/customers/cancel-${index + 1}`,
    )
    urls[0] = "https://example.com/customers/acme"
    urls[1] = "https://example.com/customers/globex"
    const responseGate = deferred()
    let scrapeCalls = 0
    usePreparationHandlers(urls)
    server.use(
      http.post("https://api.firecrawl.dev/v2/scrape", async () => {
        scrapeCalls += 1
        await responseGate.promise
        return successfulScrape({ client_name: "Too late" })
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])
    await vi.waitFor(() => expect(scrapeCalls).toBe(5), { timeout: 10_000 })
    await expect(
      requestScrapeRunCancellation({
        userId: user.id,
        scrapeRunId: pendingRun.id,
      }),
    ).resolves.toMatchObject({ outcome: "requested" })
    responseGate.resolve()

    await expect(workflowRun.returnValue).resolves.toEqual({
      outcome: "cancelled",
      scrapeRunId: pendingRun.id,
      jobCount: 7,
    })
    const jobs = await db.query.scrapeJobs.findMany({
      where: (job, { eq }) => eq(job.scrapeRunId, pendingRun.id),
      orderBy: scrapeJobs.id,
    })
    expect(scrapeCalls).toBe(5)
    expect(jobs).toHaveLength(7)
    expect(
      jobs.every((job) => job.status === "cancelled" && job.result === null),
    ).toBe(true)
  })
})
