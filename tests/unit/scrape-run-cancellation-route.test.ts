import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { POST } from "@/app/api/scrape-runs/[runId]/cancel/route"
import {
  completeScrapeRunCancellation,
  requestScrapeRunCancellation,
} from "@/lib/server/scrape-runs/lifecycle-repository"
import { getRun } from "workflow/api"

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock("@/lib/server/scrape-runs/lifecycle-repository", () => ({
  completeScrapeRunCancellation: vi.fn(),
  requestScrapeRunCancellation: vi.fn(),
}))

vi.mock("workflow/api", () => ({
  getRun: vi.fn(),
}))

const cancelWorkflow = vi.fn()

function context(runId = "17") {
  return { params: Promise.resolve({ runId }) }
}

describe("POST /api/scrape-runs/:runId/cancel", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "42" },
    } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)
    vi.mocked(requestScrapeRunCancellation).mockResolvedValue({
      outcome: "requested",
      workflowRunId: "wfr_123",
      cancellationRequestedAt: new Date("2026-04-01T10:00:00.000Z"),
    })
    vi.mocked(getRun).mockReturnValue({ cancel: cancelWorkflow } as never)
    cancelWorkflow.mockResolvedValue(undefined)
    vi.mocked(completeScrapeRunCancellation).mockResolvedValue(true)
  })

  it("returns 401 without recording a Cancellation Request", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)

    const response = await POST(new Request("http://localhost"), context())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." })
    expect(requestScrapeRunCancellation).not.toHaveBeenCalled()
    expect(getRun).not.toHaveBeenCalled()
  })

  it.each(["not-a-run", "0", "-1", "9007199254740992"])(
    "returns 404 for invalid run ID %s",
    async (runId) => {
      const response = await POST(
        new Request("http://localhost"),
        context(runId),
      )

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        error: "Scrape run not found.",
      })
      expect(requestScrapeRunCancellation).not.toHaveBeenCalled()
    },
  )

  it("returns 404 for a missing or non-owned Scrape Run", async () => {
    vi.mocked(requestScrapeRunCancellation).mockResolvedValue({
      outcome: "not_found",
    })

    const response = await POST(new Request("http://localhost"), context())

    expect(requestScrapeRunCancellation).toHaveBeenCalledWith({
      userId: 42,
      scrapeRunId: 17,
    })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Scrape run not found.",
    })
    expect(getRun).not.toHaveBeenCalled()
  })

  it.each(["complete", "failed"] as const)(
    "returns 409 when the Scrape Run is already %s",
    async (status) => {
      vi.mocked(requestScrapeRunCancellation).mockResolvedValue({
        outcome: "terminal_conflict",
        status,
      })

      const response = await POST(new Request("http://localhost"), context())

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error: `A ${status} scrape run cannot be cancelled.`,
      })
      expect(getRun).not.toHaveBeenCalled()
    },
  )

  it("records the Cancellation Request, cancels the Workflow, completes cleanup, and returns 202", async () => {
    const response = await POST(new Request("http://localhost"), context())

    expect(getRun).toHaveBeenCalledWith("wfr_123")
    expect(cancelWorkflow).toHaveBeenCalledOnce()
    expect(completeScrapeRunCancellation).toHaveBeenCalledWith({
      scrapeRunId: 17,
    })
    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      id: 17,
      status: "cancelled",
    })
  })

  it("completes cleanup without a Workflow call when no Workflow ID was attached", async () => {
    vi.mocked(requestScrapeRunCancellation).mockResolvedValue({
      outcome: "requested",
      workflowRunId: null,
      cancellationRequestedAt: new Date("2026-04-01T10:00:00.000Z"),
    })

    const response = await POST(new Request("http://localhost"), context())

    expect(getRun).not.toHaveBeenCalled()
    expect(completeScrapeRunCancellation).toHaveBeenCalledWith({
      scrapeRunId: 17,
    })
    expect(response.status).toBe(202)
  })

  it("retries Workflow cancellation for an existing Cancellation Request", async () => {
    vi.mocked(requestScrapeRunCancellation).mockResolvedValue({
      outcome: "already_requested",
      workflowRunId: "wfr_123",
      cancellationRequestedAt: new Date("2026-04-01T10:00:00.000Z"),
    })

    const response = await POST(new Request("http://localhost"), context())

    expect(cancelWorkflow).toHaveBeenCalledOnce()
    expect(completeScrapeRunCancellation).toHaveBeenCalledWith({
      scrapeRunId: 17,
    })
    expect(response.status).toBe(202)
  })

  it("returns 202 idempotently for an already-cancelled Scrape Run", async () => {
    vi.mocked(requestScrapeRunCancellation).mockResolvedValue({
      outcome: "cancelled",
    })

    const response = await POST(new Request("http://localhost"), context())

    expect(getRun).not.toHaveBeenCalled()
    expect(completeScrapeRunCancellation).not.toHaveBeenCalled()
    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      id: 17,
      status: "cancelled",
    })
  })

  it("retains the Cancellation Request and returns 503 when Workflow cancellation fails", async () => {
    cancelWorkflow.mockRejectedValue(new Error("workflow provider details"))

    const response = await POST(new Request("http://localhost"), context())

    expect(completeScrapeRunCancellation).not.toHaveBeenCalled()
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: "The scrape run could not be cancelled.",
    })
  })
})
