import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

import ScrapeJobDetailPage from "@/app/app/scrape-runs/[runId]/scrape-jobs/[jobId]/page"

vi.mock("@/components/app/app-page", () => ({
  AppPage: ({ children, title }: { children: ReactNode; title: string }) => (
    <>
      <h1>{title}</h1>
      {children}
    </>
  ),
}))

vi.mock("@/components/scrape-runs/scrape-job-detail-view", () => ({
  ScrapeJobDetailView: ({ jobId, runId }: { jobId: string; runId: string }) => (
    <div data-job-id={jobId} data-run-id={runId}>
      Job detail
    </div>
  ),
}))

describe("Scrape Job detail page", () => {
  it("resolves direct-entry route params into the focused Job view", async () => {
    const props: Parameters<typeof ScrapeJobDetailPage>[0] = {
      params: Promise.resolve({ runId: "17", jobId: "31" }),
      searchParams: Promise.resolve({}),
    }

    render(await ScrapeJobDetailPage(props))

    expect(
      screen.getByRole("heading", { level: 1, name: "Scrape Job" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Job detail")).toHaveAttribute("data-run-id", "17")
    expect(screen.getByText("Job detail")).toHaveAttribute("data-job-id", "31")
  })
})
