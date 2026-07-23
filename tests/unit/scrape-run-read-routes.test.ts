import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { GET as getScrapeRuns } from "@/app/api/scrape-runs/route"
import { GET as getScrapeRun } from "@/app/api/scrape-runs/[runId]/route"
import { GET as getScrapeJob } from "@/app/api/scrape-runs/[runId]/scrape-jobs/[jobId]/route"
import {
  findOwnedScrapeJobDetail,
  findOwnedScrapeRunDetail,
  listOwnedScrapeRunSummaries,
} from "@/lib/server/scrape-runs/read-repository"

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock("@/lib/server/scrape-runs/read-repository", () => ({
  findOwnedScrapeJobDetail: vi.fn(),
  findOwnedScrapeRunDetail: vi.fn(),
  listOwnedScrapeRunSummaries: vi.fn(),
}))

const runSummary = {
  id: 17,
  name: "Customer stories",
  targetUrl: "https://example.com/",
  status: "in_progress" as const,
  cancellationRequestedAt: new Date("2026-04-01T10:05:00.000Z"),
  jobCounts: {
    total: 3,
    pending: 1,
    inProgress: 0,
    complete: 1,
    failed: 1,
    cancelled: 0,
  },
  createdAt: new Date("2026-04-01T10:00:00.000Z"),
  startedAt: new Date("2026-04-01T10:01:00.000Z"),
  finishedAt: null,
}

const runDetail = {
  ...runSummary,
  failureCode: "unexpected_workflow_failure" as const,
  failureMessage: "The scrape run stopped unexpectedly.",
  exampleUrls: [
    "https://example.com/customers/acme",
    "https://example.com/customers/globex",
  ],
  filteringModel: "anthropic/claude-sonnet-4.5",
  fields: [
    {
      position: 0,
      label: "Client Name",
      key: "client_name",
      description: "The customer name",
      required: true,
      primaryIdentifier: true,
    },
    {
      position: 1,
      label: "Industry",
      key: "industry",
      description: "The customer industry",
      required: false,
      primaryIdentifier: false,
    },
  ],
  stages: [
    {
      stage: "mapping" as const,
      status: "complete" as const,
      attemptCount: 1,
      failureCode: null,
      failureMessage: null,
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T10:02:00.000Z"),
      startedAt: new Date("2026-04-01T10:01:00.000Z"),
      finishedAt: new Date("2026-04-01T10:02:00.000Z"),
    },
  ],
  jobs: [
    {
      id: 31,
      url: "https://example.com/customers/acme",
      status: "complete" as const,
      primaryIdentifier: "Acme",
      failureCode: null,
      attemptCount: 1,
      createdAt: new Date("2026-04-01T10:03:00.000Z"),
      updatedAt: new Date("2026-04-01T10:04:00.000Z"),
      startedAt: new Date("2026-04-01T10:03:00.000Z"),
      finishedAt: new Date("2026-04-01T10:04:00.000Z"),
    },
    {
      id: 32,
      url: "https://example.com/customers/globex",
      status: "failed" as const,
      primaryIdentifier: null,
      failureCode: "scrape_failed" as const,
      attemptCount: 3,
      createdAt: new Date("2026-04-01T10:03:00.000Z"),
      updatedAt: new Date("2026-04-01T10:05:00.000Z"),
      startedAt: new Date("2026-04-01T10:03:00.000Z"),
      finishedAt: new Date("2026-04-01T10:05:00.000Z"),
    },
  ],
}

const jobDetail = {
  id: 31,
  url: "https://example.com/customers/acme",
  status: "complete" as const,
  attemptCount: 1,
  result: { client_name: "Acme", industry: "Software" },
  missingRequiredFieldKeys: null,
  failureCode: null,
  failureMessage: null,
  createdAt: new Date("2026-04-01T10:03:00.000Z"),
  updatedAt: new Date("2026-04-01T10:04:00.000Z"),
  startedAt: new Date("2026-04-01T10:03:00.000Z"),
  finishedAt: new Date("2026-04-01T10:04:00.000Z"),
}

function runContext(runId = "17") {
  return { params: Promise.resolve({ runId }) }
}

function jobContext(runId = "17", jobId = "31") {
  return { params: Promise.resolve({ runId, jobId }) }
}

describe("scrape-run read routes", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "42" },
    } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)
    vi.mocked(listOwnedScrapeRunSummaries).mockResolvedValue([runSummary])
    vi.mocked(findOwnedScrapeRunDetail).mockResolvedValue(runDetail)
    vi.mocked(findOwnedScrapeJobDetail).mockResolvedValue(jobDetail)
  })

  it.each([
    {
      label: "run list",
      read: () =>
        getScrapeRuns(
          new Request("http://localhost/api/scrape-runs"),
        ),
    },
    {
      label: "run detail",
      read: () =>
        getScrapeRun(
          new Request("http://localhost/api/scrape-runs/17"),
          runContext(),
        ),
    },
    {
      label: "job detail",
      read: () =>
        getScrapeJob(
          new Request(
            "http://localhost/api/scrape-runs/17/scrape-jobs/31",
          ),
          jobContext(),
        ),
    },
  ])("returns 401 for the $label without reading state", async ({ read }) => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)

    const response = await read()

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." })
    expect(listOwnedScrapeRunSummaries).not.toHaveBeenCalled()
    expect(findOwnedScrapeRunDetail).not.toHaveBeenCalled()
    expect(findOwnedScrapeJobDetail).not.toHaveBeenCalled()
  })

  it("returns every owned run newest-first with aggregate progress and cancellation state", async () => {
    const response = await getScrapeRuns(
      new Request("http://localhost/api/scrape-runs?limit=1&page=2"),
    )

    expect(listOwnedScrapeRunSummaries).toHaveBeenCalledWith({ userId: 42 })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual([
      {
        ...runSummary,
        cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
        createdAt: "2026-04-01T10:00:00.000Z",
        startedAt: "2026-04-01T10:01:00.000Z",
      },
    ])
  })

  it("returns run configuration, stages, aggregate progress, and lightweight jobs", async () => {
    const response = await getScrapeRun(
      new Request("http://localhost/api/scrape-runs/17"),
      runContext(),
    )

    expect(findOwnedScrapeRunDetail).toHaveBeenCalledWith({
      userId: 42,
      scrapeRunId: 17,
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      id: 17,
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      failureCode: "unexpected_workflow_failure",
      failureMessage: "The scrape run stopped unexpectedly.",
      jobCounts: runSummary.jobCounts,
      fields: runDetail.fields,
      jobs: [
        { id: 31, primaryIdentifier: "Acme" },
        { id: 32, primaryIdentifier: null, failureCode: "scrape_failed" },
      ],
    })
    expect(body).not.toHaveProperty("workflowRunId")
    expect(body).not.toHaveProperty("providerConfiguration")
    expect(body.jobs[0]).not.toHaveProperty("result")
    expect(body.jobs[1]).not.toHaveProperty("failureMessage")
  })

  it("includes null Run-level failure fields for an ordinary Run", async () => {
    vi.mocked(findOwnedScrapeRunDetail).mockResolvedValue({
      ...runDetail,
      failureCode: null,
      failureMessage: null,
    })

    const response = await getScrapeRun(
      new Request("http://localhost/api/scrape-runs/17"),
      runContext(),
    )

    await expect(response.json()).resolves.toMatchObject({
      failureCode: null,
      failureMessage: null,
    })
  })

  it.each(["not-a-run", "0", "-1", "9007199254740992"])(
    "returns 404 for invalid run ID %s",
    async (runId) => {
      const response = await getScrapeRun(
        new Request("http://localhost"),
        runContext(runId),
      )

      expect(response.status).toBe(404)
      expect(findOwnedScrapeRunDetail).not.toHaveBeenCalled()
    },
  )

  it("returns 404 for a missing or cross-user run", async () => {
    vi.mocked(findOwnedScrapeRunDetail).mockResolvedValue(null)

    const response = await getScrapeRun(
      new Request("http://localhost"),
      runContext(),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Scrape run not found.",
    })
  })

  it("returns the full Extraction Result and sanitized failure diagnostics only for job detail", async () => {
    const response = await getScrapeJob(
      new Request("http://localhost"),
      jobContext(),
    )

    expect(findOwnedScrapeJobDetail).toHaveBeenCalledWith({
      userId: 42,
      scrapeRunId: 17,
      scrapeJobId: 31,
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ...jobDetail,
      createdAt: "2026-04-01T10:03:00.000Z",
      updatedAt: "2026-04-01T10:04:00.000Z",
      startedAt: "2026-04-01T10:03:00.000Z",
      finishedAt: "2026-04-01T10:04:00.000Z",
    })
  })

  it.each([
    ["bad-run", "31"],
    ["17", "bad-job"],
    ["17", "0"],
  ])("returns 404 for invalid nested IDs %s/%s", async (runId, jobId) => {
    const response = await getScrapeJob(
      new Request("http://localhost"),
      jobContext(runId, jobId),
    )

    expect(response.status).toBe(404)
    expect(findOwnedScrapeJobDetail).not.toHaveBeenCalled()
  })

  it("returns 404 when the job is cross-user or belongs to a different run", async () => {
    vi.mocked(findOwnedScrapeJobDetail).mockResolvedValue(null)

    const response = await getScrapeJob(
      new Request("http://localhost"),
      jobContext("18", "31"),
    )

    expect(findOwnedScrapeJobDetail).toHaveBeenCalledWith({
      userId: 42,
      scrapeRunId: 18,
      scrapeJobId: 31,
    })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Scrape job not found.",
    })
  })
})
