import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { POST } from "@/app/api/scrape-runs/route"
import { failPendingWorkflowDispatch } from "@/lib/server/scrape-runs/lifecycle-repository"
import {
  ActiveScrapeRunConflictError,
  attachWorkflowRunId,
  createScrapeRun,
} from "@/lib/server/scrape-runs/repository"
import { scrapeRunWorkflow } from "@/workflows/scrape-runs"
import { start } from "workflow/api"

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock("@/lib/server/scrape-runs/repository", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/server/scrape-runs/repository")
    >()

  return {
    ...original,
    attachWorkflowRunId: vi.fn(),
    createScrapeRun: vi.fn(),
  }
})

vi.mock("@/lib/server/scrape-runs/lifecycle-repository", () => ({
  failPendingWorkflowDispatch: vi.fn(),
}))

vi.mock("@/workflows/scrape-runs", () => ({
  scrapeRunWorkflow: vi.fn(),
}))

vi.mock("workflow/api", () => ({
  start: vi.fn(),
}))

const validPayload = {
  name: "Case studies",
  url: "https://example.com/case-studies",
  exampleUrls: [
    "https://example.com/case-studies/one",
    "https://example.com/case-studies/two",
  ],
  fields: [
    {
      label: "Company",
      description: "The company name",
      required: true,
      primaryIdentifier: true,
    },
  ],
}

const createdAt = new Date("2026-04-01T10:00:00.000Z")
const createdRun = {
  id: 17,
  userId: 42,
  name: "Case studies",
  targetUrl: "https://example.com/",
  exampleUrls: [
    "https://example.com/case-studies/one",
    "https://example.com/case-studies/two",
  ],
  filteringModel: "anthropic/claude-sonnet-4.5",
  status: "pending" as const,
  workflowRunId: null,
  cancellationRequestedAt: null,
  failureCode: null,
  failureMessage: null,
  createdAt,
  updatedAt: createdAt,
  startedAt: null,
  finishedAt: null,
  fields: [],
  stages: [],
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/scrape-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createMalformedRequest() {
  return new Request("http://localhost/api/scrape-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not json",
  })
}

describe("POST /api/scrape-runs", () => {
  beforeEach(() => {
    vi.stubEnv("TEST_DATABASE_URL", "postgresql://test.example/scrape-runs")
    vi.stubEnv("FIRECRAWL_API_KEY", "firecrawl-key")
    vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-key")
    vi.stubEnv("URL_FILTER_MODEL", "anthropic/claude-sonnet-4.5")

    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "42" },
    } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)
    vi.mocked(createScrapeRun).mockResolvedValue(createdRun)
    vi.mocked(start).mockResolvedValue({ runId: "wfr_123" } as never)
    vi.mocked(attachWorkflowRunId).mockResolvedValue(true)
    vi.mocked(failPendingWorkflowDispatch).mockResolvedValue(true)
  })

  it("returns 401 without creating or dispatching a run", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)

    const response = await POST(createRequest(validPayload))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." })
    expect(createScrapeRun).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(createMalformedRequest())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON payload.",
    })
    expect(createScrapeRun).not.toHaveBeenCalled()
  })

  it("returns 400 for an invalid run configuration", async () => {
    const response = await POST(
      createRequest({ ...validPayload, exampleUrls: [] }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "At least 2 example URLs are required.",
    })
    expect(createScrapeRun).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: "database URL",
      configure: () => vi.stubEnv("TEST_DATABASE_URL", ""),
      error: "Database configuration is unavailable.",
    },
    {
      label: "Firecrawl API key",
      configure: () => vi.stubEnv("FIRECRAWL_API_KEY", ""),
      error: "FIRECRAWL_API_KEY must be configured for Firecrawl.",
    },
    {
      label: "AI Gateway authentication",
      configure: () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "")
        vi.stubEnv("VERCEL_OIDC_TOKEN", "")
      },
      error:
        "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN must be configured for AI Gateway.",
    },
    {
      label: "URL-filtering model",
      configure: () => vi.stubEnv("URL_FILTER_MODEL", ""),
      error: "URL_FILTER_MODEL must be configured for URL filtering.",
    },
  ])(
    "returns 503 without persistence when the $label is missing",
    async ({ configure, error }) => {
      configure()

      const response = await POST(createRequest(validPayload))

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({ error })
      expect(createScrapeRun).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()
    },
  )

  it("returns 409 when the user already has an Active Scrape Run", async () => {
    vi.mocked(createScrapeRun).mockRejectedValue(
      new ActiveScrapeRunConflictError(),
    )

    const response = await POST(createRequest(validPayload))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "You already have an active scrape run.",
    })
    expect(start).not.toHaveBeenCalled()
  })

  it("persists normalized values, dispatches the Workflow, and returns the created summary", async () => {
    vi.stubEnv(
      "URL_FILTER_MODEL",
      "  anthropic/claude-sonnet-4.5  ",
    )
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const response = await POST(
      createRequest({
        ...validPayload,
        name: "  Case studies  ",
        url: "https://example.com/case-studies?source=nav",
        exampleUrls: [
          "https://example.com/case-studies/one/?source=home",
          "https://example.com/case-studies/two#details",
        ],
      }),
    )

    expect(createScrapeRun).toHaveBeenCalledWith({
      userId: 42,
      configuration: {
        name: "Case studies",
        url: "https://example.com/",
        exampleUrls: [
          "https://example.com/case-studies/one",
          "https://example.com/case-studies/two",
        ],
        fields: [
          {
            ...validPayload.fields[0],
            key: "company",
          },
        ],
        filteringModel: "anthropic/claude-sonnet-4.5",
      },
    })
    expect(start).toHaveBeenCalledWith(scrapeRunWorkflow, [17])
    expect(attachWorkflowRunId).toHaveBeenCalledWith({
      scrapeRunId: 17,
      workflowRunId: "wfr_123",
    })
    expect(log).not.toHaveBeenCalled()
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({
      id: 17,
      name: "Case studies",
      targetUrl: "https://example.com/",
      status: "pending",
      cancellationRequestedAt: null,
      jobCounts: {
        total: 0,
        pending: 0,
        inProgress: 0,
        complete: 0,
        failed: 0,
        cancelled: 0,
      },
      createdAt: "2026-04-01T10:00:00.000Z",
      startedAt: null,
      finishedAt: null,
    })
  })

  it.each([
    {
      label: "is interrupted",
      configure: () =>
        vi
          .mocked(attachWorkflowRunId)
          .mockRejectedValue(new Error("database details")),
    },
    {
      label: "cannot attach the ID",
      configure: () =>
        vi.mocked(attachWorkflowRunId).mockResolvedValue(false),
    },
  ])(
    "returns 503 when post-dispatch ID attachment $label",
    async ({ configure }) => {
      configure()

      const response = await POST(createRequest(validPayload))

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        error: "The Workflow run ID could not be saved.",
        scrapeRunId: 17,
      })
      expect(failPendingWorkflowDispatch).not.toHaveBeenCalled()
    },
  )

  it("compensates a rejected dispatch and returns 503 with the persisted run ID", async () => {
    vi.mocked(start).mockRejectedValue(new Error("provider details"))

    const response = await POST(createRequest(validPayload))

    expect(failPendingWorkflowDispatch).toHaveBeenCalledWith({
      scrapeRunId: 17,
      failure: {
        code: "workflow_dispatch_failed",
        message: "The scrape run could not be started.",
      },
    })
    expect(attachWorkflowRunId).not.toHaveBeenCalled()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: "The scrape run could not be started.",
      scrapeRunId: 17,
    })
  })
})
