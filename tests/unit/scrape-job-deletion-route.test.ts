import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { DELETE } from "@/app/api/scrape-runs/[runId]/scrape-jobs/[jobId]/route"
import { deleteOwnedTerminalScrapeJob } from "@/lib/server/scrape-runs/repository"

vi.mock("@/auth/session", () => ({ getCurrentSession: vi.fn() }))
vi.mock("@/lib/server/scrape-runs/repository", () => ({
  deleteOwnedTerminalScrapeJob: vi.fn(),
}))

function context(runId = "17", jobId = "31") {
  return { params: Promise.resolve({ runId, jobId }) }
}

describe("DELETE /api/scrape-runs/:runId/scrape-jobs/:jobId", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "42" },
    } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)
    vi.mocked(deleteOwnedTerminalScrapeJob).mockResolvedValue({
      outcome: "deleted",
    })
  })

  it("authenticates before parsing parameters", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)

    const response = await DELETE(
      new Request("http://localhost"),
      context("invalid", "invalid"),
    )

    expect(response.status).toBe(401)
    expect(deleteOwnedTerminalScrapeJob).not.toHaveBeenCalled()
  })

  it.each([
    ["invalid", "31"],
    ["17", "0"],
    ["-1", "31"],
    ["17", "9007199254740992"],
  ])("privately rejects invalid IDs %s and %s", async (runId, jobId) => {
    const response = await DELETE(
      new Request("http://localhost"),
      context(runId, jobId),
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Scrape job not found.",
    })
    expect(deleteOwnedTerminalScrapeJob).not.toHaveBeenCalled()
  })

  it("passes ownership and both IDs to the repository", async () => {
    const response = await DELETE(new Request("http://localhost"), context())

    expect(deleteOwnedTerminalScrapeJob).toHaveBeenCalledWith({
      userId: 42,
      scrapeRunId: 17,
      scrapeJobId: 31,
    })
    expect(response.status).toBe(204)
  })

  it("uses a private not-found response", async () => {
    vi.mocked(deleteOwnedTerminalScrapeJob).mockResolvedValue({
      outcome: "not_found",
    })

    const response = await DELETE(new Request("http://localhost"), context())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Scrape job not found.",
    })
  })

  it("returns a safe conflict for an active parent Run", async () => {
    vi.mocked(deleteOwnedTerminalScrapeJob).mockResolvedValue({
      outcome: "active_conflict",
    })

    const response = await DELETE(new Request("http://localhost"), context())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "A Scrape Job in an active scrape run cannot be deleted.",
    })
  })

  it("returns an exact bodyless 204", async () => {
    const response = await DELETE(new Request("http://localhost"), context())

    expect(response.status).toBe(204)
    expect(response.headers.get("content-type")).toBeNull()
    await expect(response.text()).resolves.toBe("")
  })

  it("lets unexpected errors propagate", async () => {
    vi.mocked(deleteOwnedTerminalScrapeJob).mockRejectedValue(
      new Error("private database details"),
    )

    await expect(
      DELETE(new Request("http://localhost"), context()),
    ).rejects.toThrow("private database details")
  })
})
