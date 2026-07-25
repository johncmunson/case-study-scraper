import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { AppHeader } from "@/components/app/app-header"

vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}))

vi.mock("@/components/mode-toggle", () => ({
  ModeToggle: () => <button type="button">Toggle theme</button>,
}))

describe("App header", () => {
  it("only displays the linked product name", () => {
    render(<AppHeader />)

    expect(
      screen.getByRole("heading", { level: 1, name: "Case Study Scraper" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Case Study Scraper" }),
    ).toHaveAttribute("href", "/app/scrape-runs")
    expect(screen.queryByText("•")).not.toBeInTheDocument()
  })
})
