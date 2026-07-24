import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import SignInPage, { metadata } from "@/app/sign-in/page"
import { getCurrentSession } from "@/auth/session"

const redirectMock = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}))

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

describe("sign-in page", () => {
  beforeEach(() => {
    redirectMock.mockReset()
    vi.mocked(getCurrentSession).mockResolvedValue(null)
  })

  it("presents a focused sign-in experience that echoes the landing page", async () => {
    render(await SignInPage())

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Sign in to Case Study Scraper.",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("Research-ready extraction")).toBeInTheDocument()
    expect(
      screen.getByText(/Turn matching case studies and project pages into sourced/),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Case Study Scraper" })).toHaveAttribute(
      "href",
      "/",
    )
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    )
    const workflow = screen.getByRole("list", { name: "Three-step workflow" })
    expect(within(workflow).getAllByRole("listitem")).toHaveLength(3)
    expect(within(workflow).getByText("Find matching pages")).toBeInTheDocument()
    expect(within(workflow).getByText("Extract chosen fields")).toBeInTheDocument()
    expect(within(workflow).getByText("Download CSV or JSON")).toBeInTheDocument()
  })

  it("redirects an existing session to the authenticated app", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "42" },
    } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)
    redirectMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT")
    })

    await expect(SignInPage()).rejects.toThrow("NEXT_REDIRECT")
    expect(redirectMock).toHaveBeenCalledWith("/app/scrape-runs")
  })

  it("exports descriptive metadata", () => {
    expect(metadata).toMatchObject({
      title: "Sign in — Case Study Scraper",
      description: "Sign in to Case Study Scraper with your Google account.",
    })
  })
})
