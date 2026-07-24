import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { DELETE } from "@/app/api/scrape-runs/[runId]/route"
import { deleteOwnedTerminalScrapeRun } from "@/lib/server/scrape-runs/repository"

vi.mock("@/auth/session", () => ({ getCurrentSession: vi.fn() }))
vi.mock("@/lib/server/scrape-runs/repository", () => ({
  deleteOwnedTerminalScrapeRun: vi.fn(),
}))

function context(runId = "17") {
  return { params: Promise.resolve({ runId }) }
}

describe("DELETE /api/scrape-runs/:runId", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "42" },
    } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)
    vi.mocked(deleteOwnedTerminalScrapeRun).mockResolvedValue({
      outcome: "deleted",
    })
  })

  it("authenticates before parsing or deleting", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
    const response = await DELETE(
      new Request("http://localhost"),
      context("not-a-run"),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." })
    expect(deleteOwnedTerminalScrapeRun).not.toHaveBeenCalled()
  })

  it.each(["not-a-run", "0", "-1", "9007199254740992"])(
    "privately rejects invalid ID %s",
    async (runId) => {
      const response = await DELETE(
        new Request("http://localhost"),
        context(runId),
      )

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        error: "Scrape run not found.",
      })
      expect(deleteOwnedTerminalScrapeRun).not.toHaveBeenCalled()
    },
  )

  it("passes the numeric owner and Run IDs to the repository", async () => {
    const response = await DELETE(new Request("http://localhost"), context())

    expect(deleteOwnedTerminalScrapeRun).toHaveBeenCalledWith({
      userId: 42,
      scrapeRunId: 17,
    })
    expect(response.status).toBe(204)
  })

  it("uses the private not-found response for an absent or non-owned Run", async () => {
    vi.mocked(deleteOwnedTerminalScrapeRun).mockResolvedValue({
      outcome: "not_found",
    })

    const response = await DELETE(new Request("http://localhost"), context())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Scrape run not found.",
    })
  })

  it("rejects deletion of an active Run with a safe conflict", async () => {
    vi.mocked(deleteOwnedTerminalScrapeRun).mockResolvedValue({
      outcome: "active_conflict",
    })

    const response = await DELETE(new Request("http://localhost"), context())

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: "An active scrape run cannot be deleted.",
    })
  })

  it("returns an exact bodyless 204 after deletion", async () => {
    const response = await DELETE(new Request("http://localhost"), context())

    expect(response.status).toBe(204)
    expect(response.headers.get("content-type")).toBeNull()
    await expect(response.text()).resolves.toBe("")
  })

  it("allows unexpected repository errors to propagate", async () => {
    vi.mocked(deleteOwnedTerminalScrapeRun).mockRejectedValue(
      new Error("private database details"),
    )

    await expect(
      DELETE(new Request("http://localhost"), context()),
    ).rejects.toThrow("private database details")
  })
})
