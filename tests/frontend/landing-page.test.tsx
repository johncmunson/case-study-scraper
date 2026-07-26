import { render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import LandingPage, { metadata } from "@/app/page"
import { getCurrentSession } from "@/auth/session"

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

const signedInSession = {
  user: { id: "42" },
} as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>

describe("landing page", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)
  })

  it("renders the agreed positioning, workflow, output, and use cases", async () => {
    const { container } = render(await LandingPage())

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Turn case studies into structured datasets.",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Provide a few example pages and the fields you need\. Case Study Scraper finds pages with matching URL patterns/,
      ),
    ).toBeInTheDocument()

    const sectionLinks = screen
      .getAllByRole("link")
      .filter((link) =>
        ["#how-it-works", "#output", "#use-cases"].includes(
          link.getAttribute("href") ?? "",
        ),
      )
    expect(sectionLinks.length).toBeGreaterThanOrEqual(4)
    for (const link of sectionLinks) {
      expect(container.querySelector(link.getAttribute("href")!)).not.toBeNull()
    }

    expect(
      screen.getByRole("heading", { name: "Show what matches" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Choose what to collect" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Review and download" }),
    ).toBeInTheDocument()

    const output = container.querySelector<HTMLElement>("#output")
    expect(output).not.toBeNull()
    expect(within(output!).getByText("CSV")).toBeInTheDocument()
    expect(within(output!).getByText("JSON")).toBeInTheDocument()
    expect(
      within(output!).getAllByText(/Canonical Page URL/).length,
    ).toBeGreaterThan(0)
    expect(within(output!).getByText(/Field Labels/)).toBeInTheDocument()
    expect(within(output!).getByText(/Field Keys/)).toBeInTheDocument()

    for (const useCase of [
      "Customer stories",
      "Project portfolios",
      "Team profiles",
      "Location pages",
    ]) {
      expect(screen.getByRole("heading", { name: useCase })).toBeInTheDocument()
    }
  })

  it("shows signed-out calls to action and a non-interactive fictional preview", async () => {
    render(await LandingPage())

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    )
    for (const link of screen.getAllByRole("link", { name: "Get started" })) {
      expect(link).toHaveAttribute("href", "/sign-in")
    }

    const preview = screen.getByRole("figure", {
      name: /Example pages becoming a structured extraction dataset/i,
    })
    expect(
      within(preview).getByText("northstar-studio.example"),
    ).toBeInTheDocument()
    for (const field of ["Client", "Industry", "Services", "Outcome"]) {
      expect(within(preview).getAllByText(field).length).toBeGreaterThan(0)
    }
    expect(
      within(preview).getByText(
        "Canonical Page URL: https://northstar-studio.example/work/luma-coffee",
      ),
    ).toBeInTheDocument()
    expect(within(preview).queryByRole("button")).not.toBeInTheDocument()
    expect(within(preview).queryByRole("link")).not.toBeInTheDocument()
  })

  it("keeps signed-in visitors on the public page and points account actions to the app", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(signedInSession)

    render(await LandingPage())

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Turn case studies into structured datasets.",
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Sign in" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Get started" }),
    ).not.toBeInTheDocument()
    for (const link of screen.getAllByRole("link", { name: "Open app" })) {
      expect(link).toHaveAttribute("href", "/app/scrape-runs")
    }
  })

  it("exports the agreed landing metadata", () => {
    expect(metadata).toMatchObject({
      title: "Case Study Scraper — Turn Case Studies into Structured Data",
      description:
        "Find matching case studies, customer stories, and project pages, extract the fields you need, and download a sourced CSV or JSON dataset.",
    })
  })
})
