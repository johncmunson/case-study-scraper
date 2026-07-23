import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse, delay } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ScrapeRunList } from "@/components/scrape-runs/scrape-run-list"
import { ScrapeRunsView } from "@/components/scrape-runs/scrape-runs-view"
import type { ScrapeRunSummary } from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunSummary } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

const apiUrl = "http://localhost/api/scrape-runs"

function summary(
  replacement: Partial<ScrapeRunSummary> = {},
): ScrapeRunSummary {
  return {
    ...validScrapeRunSummary,
    ...replacement,
    jobCounts: {
      ...validScrapeRunSummary.jobCounts,
      ...replacement.jobCounts,
    },
  }
}

function getRunItem(name: string) {
  return screen.getByRole("heading", { name }).closest('[role="listitem"]')
}

afterEach(() => {
  vi.useRealTimers()
})

describe("Scrape Run list states", () => {
  it("keeps creation available while the initial list renders three skeletons", () => {
    server.use(
      http.get(apiUrl, async () => {
        await delay("infinite")
        return HttpResponse.json([])
      }),
    )

    const { container } = renderWithSwr(<ScrapeRunsView />)

    expect(
      screen.getByRole("button", { name: "Create New Scrape Run" }),
    ).toBeEnabled()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
  })

  it("renders the agreed empty state without duplicating the create action", async () => {
    server.use(http.get(apiUrl, () => HttpResponse.json([])))

    renderWithSwr(<ScrapeRunsView />)

    expect(await screen.findByText("No scrape runs yet")).toBeInTheDocument()
    expect(
      screen.getByText(/use the create new scrape run action/i),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: "Create New Scrape Run" }),
    ).toHaveLength(1)
  })

  it("renders every status and state-aware Scrape Job summary", () => {
    const runs = [
      summary({
        id: 1,
        name: "Pending preparation",
        status: "pending",
        startedAt: null,
        jobCounts: {
          total: 0,
          pending: 0,
          inProgress: 0,
          complete: 0,
          failed: 0,
          cancelled: 0,
        },
      }),
      summary({
        id: 2,
        name: "Partial active",
        status: "in_progress",
        jobCounts: {
          total: 4,
          pending: 1,
          inProgress: 1,
          complete: 1,
          failed: 1,
          cancelled: 0,
        },
      }),
      summary({
        id: 3,
        name: "Cancellation cleanup",
        status: "in_progress",
        cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
        jobCounts: {
          total: 5,
          pending: 0,
          inProgress: 1,
          complete: 2,
          failed: 1,
          cancelled: 1,
        },
      }),
      summary({
        id: 4,
        name: "Mixed completion",
        status: "complete",
        finishedAt: "2026-04-01T10:10:00.000Z",
        jobCounts: {
          total: 4,
          pending: 0,
          inProgress: 0,
          complete: 3,
          failed: 1,
          cancelled: 0,
        },
      }),
      summary({
        id: 5,
        name: "Preparation failure",
        status: "failed",
        finishedAt: "2026-04-01T10:10:00.000Z",
        jobCounts: {
          total: 0,
          pending: 0,
          inProgress: 0,
          complete: 0,
          failed: 0,
          cancelled: 0,
        },
      }),
      summary({
        id: 6,
        name: "Cancelled extraction",
        status: "cancelled",
        cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
        finishedAt: "2026-04-01T10:10:00.000Z",
        jobCounts: {
          total: 5,
          pending: 0,
          inProgress: 0,
          complete: 2,
          failed: 1,
          cancelled: 2,
        },
      }),
    ]

    const { container } = renderWithSwr(
      <ScrapeRunList summaries={runs} error={undefined} onRetry={vi.fn()} />,
    )

    const expectedItems = [
      ["Pending preparation", "Pending", "Preparing matching pages…", "secondary"],
      ["Partial active", "In progress", "2 of 4 jobs finished", "default"],
      ["Cancellation cleanup", "Cancelling", "4 of 5 jobs finished", "outline"],
      ["Mixed completion", "Complete", "3 succeeded · 1 failed", "secondary"],
      ["Preparation failure", "Failed", "No scrape jobs created", "destructive"],
      ["Cancelled extraction", "Cancelled", "2 succeeded · 1 failed · 2 cancelled", "outline"],
    ] as const

    for (const [name, status, jobSummary, badgeVariant] of expectedItems) {
      const item = getRunItem(name)
      expect(item).not.toBeNull()
      const itemQueries = within(item as HTMLElement)
      const badge = itemQueries.getByText(status)
      expect(badge).toHaveAttribute("data-variant", badgeVariant)
      expect(itemQueries.getByText(jobSummary)).toBeInTheDocument()
      expect(itemQueries.getByText("www.example.com")).toBeInTheDocument()
      const createdAt = item?.querySelector("time")
      expect(createdAt).toHaveAttribute("datetime", validScrapeRunSummary.createdAt)
      expect(createdAt).not.toHaveTextContent(/^\s*$/)
    }

    expect(container.querySelectorAll('[data-slot="spinner"][aria-hidden="true"]')).toHaveLength(2)
    expect(screen.queryByText(validScrapeRunSummary.targetUrl)).not.toBeInTheDocument()

    const progress = screen.getByRole("progressbar", {
      name: "Scrape Job progress for Partial active",
    })
    expect(progress).toHaveAttribute("aria-valuenow", "50")
    expect(
      within(getRunItem("Pending preparation") as HTMLElement).queryByRole(
        "progressbar",
      ),
    ).not.toBeInTheDocument()
    expect(
      within(getRunItem("Mixed completion") as HTMLElement).queryByRole(
        "progressbar",
      ),
    ).not.toBeInTheDocument()
  })

  it("renders an initial error and lets the user retry without automatically retrying a 4xx", async () => {
    let requestCount = 0
    let shouldSucceed = false
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return shouldSucceed
          ? HttpResponse.json([])
          : HttpResponse.json({ error: "Not allowed." }, { status: 403 })
      }),
    )

    renderWithSwr(<ScrapeRunsView />)

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load scrape runs",
    )
    await delay(25)
    expect(requestCount).toBe(1)

    shouldSucceed = true
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findByText("No scrape runs yet")).toBeInTheDocument()
    expect(requestCount).toBe(2)
  })

  it("keeps cached items visible during background revalidation and shows a refresh warning on failure", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, async () => {
        requestCount += 1
        if (requestCount === 1) {
          return HttpResponse.json([
            summary({
              status: "complete",
              finishedAt: "2026-04-01T10:10:00.000Z",
            }),
          ])
        }

        await delay(25)
        return HttpResponse.json({ error: "Unavailable." }, { status: 503 })
      }),
    )

    const { container } = renderWithSwr(<ScrapeRunsView />, undefined, {
      errorRetryCount: 0,
    })

    expect(
      await screen.findByRole("heading", { name: "Customer stories" }),
    ).toBeInTheDocument()

    window.dispatchEvent(new Event("online"))

    expect(
      screen.getByRole("heading", { name: "Customer stories" }),
    ).toBeInTheDocument()
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t refresh scrape runs",
    )
    expect(
      screen.getByRole("heading", { name: "Customer stories" }),
    ).toBeInTheDocument()
  })
})

describe("Scrape Run list request scheduling", () => {
  it.each(["network", "server"] as const)(
    "retries a %s failure three times and then stops",
    async (failureKind) => {
      let requestCount = 0
      server.use(
        http.get(apiUrl, () => {
          requestCount += 1
          return failureKind === "network"
            ? HttpResponse.error()
            : HttpResponse.json({ error: "Unavailable." }, { status: 500 })
        }),
      )

      renderWithSwr(<ScrapeRunsView />, undefined, {
        errorRetryInterval: 1,
      })

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Unable to load scrape runs",
      )
      await waitFor(() => expect(requestCount).toBe(4))
      await delay(25)
      expect(requestCount).toBe(4)
    },
  )

  it("polls while a run is active and stops after a terminal response", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json([
          requestCount === 1
            ? summary({ status: "in_progress" })
            : summary({
                status: "complete",
                finishedAt: "2026-04-01T10:10:00.000Z",
              }),
        ])
      }),
    )

    renderWithSwr(<ScrapeRunsView />)

    await vi.waitFor(() => {
      expect(screen.getByText("In progress")).toBeInTheDocument()
    })
    expect(requestCount).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => {
      expect(screen.getByText("Complete")).toBeInTheDocument()
    })
    expect(requestCount).toBe(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(requestCount).toBe(2)
  })
})
