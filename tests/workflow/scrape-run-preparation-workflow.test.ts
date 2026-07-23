import { and, eq } from "drizzle-orm"
import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { start } from "workflow/api"
import { WorkflowRunCancelledError } from "workflow/errors"

import { db } from "@/db"
import { scrapeJobs, scrapeRunStages, users } from "@/db/schema"
import { newScrapeRunSchema } from "@/lib/scrape-runs/new-scrape-run"
import {
  claimScrapeRun,
  createScrapeRun,
  findOwnedScrapeRun,
} from "@/lib/server/scrape-runs/repository"
import {
  completeScrapeRunCancellation,
  requestScrapeRunCancellation,
} from "@/lib/server/scrape-runs/lifecycle-repository"
import { server } from "@/tests/mocks/server"
import { scrapeRunWorkflow } from "@/workflows/scrape-runs"

let userSequence = 0

async function seedPendingRun() {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: `Workflow User ${userSequence}`,
      email: `workflow-${userSequence}@example.com`,
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

function successfulScrape(json: unknown) {
  return HttpResponse.json({ success: true, data: { json } })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
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

beforeEach(async () => {
  await db.delete(users)
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-workflow-test")
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-workflow-test")
})

describe("scrape-run Run Preparation Workflow", () => {
  it("claims the run, maps once, filters once, unions Example Pages, and completes every scrape job", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    let mapCalls = 0
    let filteringCalls = 0
    let scrapeCalls = 0

    server.use(
      http.post("https://api.firecrawl.dev/v2/map", () => {
        mapCalls += 1
        return HttpResponse.json({
          success: true,
          links: [
            { url: "https://example.com/customers/initech" },
            { url: "https://example.com/customers/acme?source=map" },
            { url: "https://example.com/about" },
          ],
        })
      }),
      http.post("https://ai-gateway.vercel.sh/v4/ai/language-model", () => {
        filteringCalls += 1
        return HttpResponse.json(
          gatewayGeneration([
            "https://example.com/customers/initech",
            "https://example.com/not-in-map",
          ]),
        )
      }),
      http.post("https://api.firecrawl.dev/v2/scrape", async ({ request }) => {
        scrapeCalls += 1
        const { url } = (await request.json()) as { url: string }
        const clientName = url.split("/").at(-1) ?? "Unknown"
        return successfulScrape({ client_name: clientName })
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

    expect(mapCalls).toBe(1)
    expect(filteringCalls).toBe(1)
    expect(scrapeCalls).toBe(3)
    expect(persistedRun).toMatchObject({
      status: "complete",
      workflowRunId: workflowRun.runId,
      stages: [
        { stage: "mapping", status: "complete", attemptCount: 1 },
        { stage: "filtering", status: "complete", attemptCount: 1 },
        { stage: "scraping", status: "complete", attemptCount: 0 },
      ],
    })
    expect(jobs.map(({ url, status }) => ({ url, status }))).toEqual([
      {
        url: "https://example.com/customers/initech",
        status: "complete",
      },
      { url: "https://example.com/customers/acme", status: "complete" },
      { url: "https://example.com/customers/globex", status: "complete" },
    ])
  })

  it("allows only one duplicate Workflow claim to begin Run Preparation", async () => {
    const { run: pendingRun } = await seedPendingRun()
    let mapCalls = 0
    let filteringCalls = 0

    server.use(
      http.post("https://api.firecrawl.dev/v2/map", () => {
        mapCalls += 1
        return HttpResponse.json({
          success: true,
          links: [
            { url: "https://example.com/customers/acme" },
            { url: "https://example.com/customers/globex" },
          ],
        })
      }),
      http.post("https://ai-gateway.vercel.sh/v4/ai/language-model", () => {
        filteringCalls += 1
        return HttpResponse.json(gatewayGeneration([]))
      }),
      http.post("https://api.firecrawl.dev/v2/scrape", async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        return successfulScrape({ client_name: url.split("/").at(-1) })
      }),
    )

    const [firstWorkflow, duplicateWorkflow] = await Promise.all([
      start(scrapeRunWorkflow, [pendingRun.id]),
      start(scrapeRunWorkflow, [pendingRun.id]),
    ])
    const outcomes = await Promise.all([
      firstWorkflow.returnValue,
      duplicateWorkflow.returnValue,
    ])

    expect(outcomes.map(({ outcome }) => outcome).sort()).toEqual([
      "complete",
      "unclaimable",
    ])
    expect(mapCalls).toBe(1)
    expect(filteringCalls).toBe(1)
  })

  it("does not begin preparation for cancelled, deleted, or otherwise unclaimable runs", async () => {
    let providerCalls = 0
    server.use(
      http.post("https://api.firecrawl.dev/v2/map", () => {
        providerCalls += 1
        return HttpResponse.error()
      }),
      http.post("https://ai-gateway.vercel.sh/v4/ai/language-model", () => {
        providerCalls += 1
        return HttpResponse.error()
      }),
    )

    const cancelled = await seedPendingRun()
    await requestScrapeRunCancellation({
      userId: cancelled.user.id,
      scrapeRunId: cancelled.run.id,
    })
    await completeScrapeRunCancellation({ scrapeRunId: cancelled.run.id })

    const deleted = await seedPendingRun()
    await db.delete(users).where(eq(users.id, deleted.user.id))

    const unclaimable = await seedPendingRun()
    await claimScrapeRun({
      scrapeRunId: unclaimable.run.id,
      workflowRunId: "already-claimed-workflow",
    })

    const runs = await Promise.all([
      start(scrapeRunWorkflow, [cancelled.run.id]),
      start(scrapeRunWorkflow, [deleted.run.id]),
      start(scrapeRunWorkflow, [unclaimable.run.id]),
    ])
    const outcomes = await Promise.all(runs.map((run) => run.returnValue))

    expect(outcomes).toEqual([
      { outcome: "unclaimable", scrapeRunId: cancelled.run.id },
      { outcome: "unclaimable", scrapeRunId: deleted.run.id },
      { outcome: "unclaimable", scrapeRunId: unclaimable.run.id },
    ])
    expect(providerCalls).toBe(0)
  })

  it("stops the Workflow and cancels every stage during Mapping", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    const mapGate = deferred()
    let mapCalls = 0
    let filteringCalls = 0
    server.use(
      http.post("https://api.firecrawl.dev/v2/map", async () => {
        mapCalls += 1
        await mapGate.promise
        return HttpResponse.json({ success: true, links: [] })
      }),
      http.post("https://ai-gateway.vercel.sh/v4/ai/language-model", () => {
        filteringCalls += 1
        return HttpResponse.error()
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])
    await vi.waitFor(() => expect(mapCalls).toBe(1), { timeout: 10_000 })
    await requestScrapeRunCancellation({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })
    await workflowRun.cancel()
    await completeScrapeRunCancellation({ scrapeRunId: pendingRun.id })
    mapGate.resolve()

    await expect(workflowRun.returnValue).rejects.toSatisfy(
      WorkflowRunCancelledError.is,
    )
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: pendingRun.id }),
    ).resolves.toMatchObject({
      status: "cancelled",
      stages: [
        { stage: "mapping", status: "cancelled" },
        { stage: "filtering", status: "cancelled" },
        { stage: "scraping", status: "cancelled" },
      ],
    })
    expect(filteringCalls).toBe(0)
  })

  it("stops the Workflow and preserves completed Mapping during Filtering cancellation", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    const filteringGate = deferred()
    let filteringCalls = 0
    let scrapeCalls = 0
    server.use(
      http.post("https://api.firecrawl.dev/v2/map", () =>
        HttpResponse.json({
          success: true,
          links: [
            { url: "https://example.com/customers/acme" },
            { url: "https://example.com/customers/globex" },
          ],
        }),
      ),
      http.post(
        "https://ai-gateway.vercel.sh/v4/ai/language-model",
        async () => {
          filteringCalls += 1
          await filteringGate.promise
          return HttpResponse.json(gatewayGeneration([]))
        },
      ),
      http.post("https://api.firecrawl.dev/v2/scrape", () => {
        scrapeCalls += 1
        return HttpResponse.error()
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])
    await vi.waitFor(() => expect(filteringCalls).toBe(1), { timeout: 10_000 })
    await requestScrapeRunCancellation({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })
    await workflowRun.cancel()
    await completeScrapeRunCancellation({ scrapeRunId: pendingRun.id })
    filteringGate.resolve()

    await expect(workflowRun.returnValue).rejects.toSatisfy(
      WorkflowRunCancelledError.is,
    )
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: pendingRun.id }),
    ).resolves.toMatchObject({
      status: "cancelled",
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "cancelled" },
        { stage: "scraping", status: "cancelled" },
      ],
    })
    expect(scrapeCalls).toBe(0)
  })

  it("cleans up an uncategorized orchestration failure through the top-level boundary", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    await db
      .delete(scrapeRunStages)
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, pendingRun.id),
          eq(scrapeRunStages.stage, "mapping"),
        ),
      )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])

    await expect(workflowRun.returnValue).rejects.toThrow(
      "The claimed scrape run has no pending Mapping stage.",
    )

    const persistedRun = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })
    expect(persistedRun).toMatchObject({
      status: "failed",
      failureCode: "unexpected_workflow_failure",
      failureMessage: "The workflow stopped unexpectedly.",
      stages: [
        { stage: "filtering", status: "skipped" },
        { stage: "scraping", status: "skipped" },
      ],
    })
  })

  it("retries transient Filtering failures three total times, then fails Filtering and skips Scraping", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    let mapCalls = 0
    let filteringCalls = 0

    server.use(
      http.post("https://api.firecrawl.dev/v2/map", () => {
        mapCalls += 1
        return HttpResponse.json({
          success: true,
          links: [
            { url: "https://example.com/customers/acme" },
            { url: "https://example.com/customers/globex" },
          ],
        })
      }),
      http.post("https://ai-gateway.vercel.sh/v4/ai/language-model", () => {
        filteringCalls += 1
        return HttpResponse.json(
          { error: "transient upstream failure" },
          { status: 503 },
        )
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])

    await expect(workflowRun.returnValue).resolves.toEqual({
      outcome: "filtering_failed",
      scrapeRunId: pendingRun.id,
    })

    const persistedRun = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })

    expect(mapCalls).toBe(1)
    expect(filteringCalls).toBe(3)
    expect(persistedRun).toMatchObject({
      status: "failed",
      failureCode: "filtering_failed",
      failureMessage: "Filtering could not be completed.",
      stages: [
        { stage: "mapping", status: "complete", attemptCount: 1 },
        { stage: "filtering", status: "failed", attemptCount: 3 },
        { stage: "scraping", status: "skipped", attemptCount: 0 },
      ],
    })
  })

  it("does not retry a fatal Mapping failure", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    let mapCalls = 0

    server.use(
      http.post("https://api.firecrawl.dev/v2/map", () => {
        mapCalls += 1
        return HttpResponse.json(
          { success: false, error: "invalid authentication" },
          { status: 401 },
        )
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])

    await expect(workflowRun.returnValue).resolves.toEqual({
      outcome: "mapping_failed",
      scrapeRunId: pendingRun.id,
    })
    const persistedRun = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })

    expect(mapCalls).toBe(1)
    expect(persistedRun?.stages).toMatchObject([
      { stage: "mapping", status: "failed", attemptCount: 1 },
      { stage: "filtering", status: "skipped", attemptCount: 0 },
      { stage: "scraping", status: "skipped", attemptCount: 0 },
    ])
  })

  it("retries transient Mapping failures three total times, then fails Mapping and skips later stages", async () => {
    const { user, run: pendingRun } = await seedPendingRun()
    let mapCalls = 0

    server.use(
      http.post("https://api.firecrawl.dev/v2/map", () => {
        mapCalls += 1
        return HttpResponse.json(
          { success: false, error: "transient upstream failure" },
          { status: 503 },
        )
      }),
    )

    const workflowRun = await start(scrapeRunWorkflow, [pendingRun.id])

    await expect(workflowRun.returnValue).resolves.toEqual({
      outcome: "mapping_failed",
      scrapeRunId: pendingRun.id,
    })

    const persistedRun = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: pendingRun.id,
    })

    expect(mapCalls).toBe(3)
    expect(persistedRun).toMatchObject({
      status: "failed",
      failureCode: "mapping_failed",
      failureMessage: "Mapping could not be completed.",
      stages: [
        { stage: "mapping", status: "failed", attemptCount: 3 },
        { stage: "filtering", status: "skipped", attemptCount: 0 },
        { stage: "scraping", status: "skipped", attemptCount: 0 },
      ],
    })
  })
})
