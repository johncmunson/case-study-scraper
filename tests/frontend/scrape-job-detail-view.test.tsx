import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import ScrapeJobDetailLoading from "@/app/app/scrape-runs/[runId]/scrape-jobs/[jobId]/loading"
import { ScrapeJobDetailView } from "@/components/scrape-runs/scrape-job-detail-view"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeJobDetail } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}))

const apiUrl = "http://localhost/api/scrape-runs/17/scrape-jobs/31"
const parentApiUrl = "http://localhost/api/scrape-runs/17"

function detail(
  replacement: Partial<ScrapeJobDetail> = {},
): ScrapeJobDetail {
  return {
    ...validScrapeJobDetail,
    ...replacement,
    scrapeRun: replacement.scrapeRun ?? validScrapeJobDetail.scrapeRun,
    fields: replacement.fields ?? validScrapeJobDetail.fields,
  }
}

function renderDetail(
  swrConfiguration?: Parameters<typeof renderWithSwr>[2],
) {
  return renderWithSwr(
    <ScrapeJobDetailView runId="17" jobId="31" />,
    undefined,
    swrConfiguration,
  )
}

describe("Scrape Job detail loading and errors", () => {
  it("renders the route-transition shell with back navigation", () => {
    const { container } = render(<ScrapeJobDetailLoading />)

    expect(
      screen.getByRole("heading", { level: 1, name: "Scrape Job" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Scrape Runs" })).toHaveAttribute(
      "href",
      "/app/scrape-runs",
    )
    expect(container.querySelectorAll('[data-slot="skeleton"]')).not.toHaveLength(0)
  })

  it("keeps parent navigation available in a structured initial skeleton", () => {
    server.use(
      http.get(apiUrl, async () => {
        await delay("infinite")
        return HttpResponse.json(validScrapeJobDetail)
      }),
    )

    const { container } = renderDetail()

    expect(screen.getByRole("link", { name: "Scrape Runs" })).toHaveAttribute(
      "href",
      "/app/scrape-runs",
    )
    expect(screen.getByRole("link", { name: "Scrape Run" })).toHaveAttribute(
      "href",
      "/app/scrape-runs/17",
    )
    expect(container.querySelectorAll('[data-slot="skeleton"]')).not.toHaveLength(0)
    expect(screen.getByLabelText("Loading scrape job detail")).toBeInTheDocument()
  })

  it("renders a dedicated not-found state and does not retry a 404", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          { error: "Scrape job not found." },
          { status: 404 },
        )
      }),
    )

    renderDetail({ errorRetryInterval: 1 })

    expect(
      await screen.findByRole("heading", { name: "Scrape Job not found" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to Scrape Run" })).toHaveAttribute(
      "href",
      "/app/scrape-runs/17",
    )
    expect(screen.getByRole("link", { name: "View Scrape Runs" })).toHaveAttribute(
      "href",
      "/app/scrape-runs",
    )
    await delay(25)
    expect(requestCount).toBe(1)
  })

  it("does not automatically retry other 4xx failures", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json({ error: "Unauthorized." }, { status: 401 })
      }),
    )

    renderDetail({ errorRetryInterval: 1 })

    expect(
      await screen.findByRole("heading", { name: "Unable to load scrape job" }),
    ).toBeInTheDocument()
    await delay(25)
    expect(requestCount).toBe(1)
  })

  it.each(["network", "server"] as const)(
    "retries an initial %s failure three times and allows keyboard Retry",
    async (failureKind) => {
      let requestCount = 0
      let shouldSucceed = false
      server.use(
        http.get(apiUrl, () => {
          requestCount += 1
          if (shouldSucceed) return HttpResponse.json(validScrapeJobDetail)
          return failureKind === "network"
            ? HttpResponse.error()
            : HttpResponse.json({ error: "Unavailable." }, { status: 503 })
        }),
      )

      renderDetail({ errorRetryInterval: 1 })

      expect(
        await screen.findByRole("heading", {
          name: "Unable to load scrape job",
        }),
      ).toBeInTheDocument()
      await waitFor(() => expect(requestCount).toBe(4))

      shouldSucceed = true
      const retryButton = screen.getByRole("button", { name: "Retry" })
      retryButton.focus()
      await userEvent.keyboard("{Enter}")

      expect(
        await screen.findByRole("heading", { name: "Scrape Job" }),
      ).toBeInTheDocument()
      expect(requestCount).toBe(5)
    },
  )

  it("retains cached detail after a refresh failure and lets Retry recover", async () => {
    let requestCount = 0
    let shouldFail = true
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        if (requestCount === 1 || !shouldFail) {
          return HttpResponse.json(validScrapeJobDetail)
        }
        return HttpResponse.json({ error: "Unavailable." }, { status: 503 })
      }),
    )

    const { container } = renderDetail({ errorRetryCount: 0 })

    expect(
      await screen.findByText("Extracting data from this page"),
    ).toBeInTheDocument()
    window.dispatchEvent(new Event("online"))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t refresh scrape job",
    )
    expect(screen.getByText("Extracting data from this page")).toBeInTheDocument()
    expect(container.querySelector('[aria-label="Loading scrape job detail"]')).toBeNull()

    shouldFail = false
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(requestCount).toBe(3))
    expect(screen.queryByText("Couldn’t refresh scrape job")).not.toBeInTheDocument()
  })

  it("discards cached detail when a background refresh returns 404", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return requestCount === 1
          ? HttpResponse.json(validScrapeJobDetail)
          : HttpResponse.json(
              { error: "Scrape job not found." },
              { status: 404 },
            )
      }),
    )

    renderDetail()

    expect(
      await screen.findByText("Extracting data from this page"),
    ).toBeInTheDocument()
    window.dispatchEvent(new Event("online"))

    expect(
      await screen.findByRole("heading", { name: "Scrape Job not found" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("Extracting data from this page")).not.toBeInTheDocument()
    await delay(25)
    expect(requestCount).toBe(2)
  })
})

describe("Scrape Job lifecycle shell", () => {
  it("presents nested navigation, source, status, attempts, and semantic timestamps", async () => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({
            attemptCount: 0,
            finishedAt: "2026-04-01T10:04:00.000Z",
          }),
        ),
      ),
    )

    renderDetail()

    const heading = await screen.findByRole("heading", { name: "Scrape Job" })
    const header = heading.closest("section")
    expect(header).not.toBeNull()
    const scoped = within(header as HTMLElement)
    expect(scoped.getByRole("link", { name: "Scrape Runs" })).toHaveAttribute(
      "href",
      "/app/scrape-runs",
    )
    expect(scoped.getByRole("link", { name: "Customer stories" })).toHaveAttribute(
      "href",
      "/app/scrape-runs/17",
    )
    expect(scoped.getByText(validScrapeJobDetail.url)).toBeInTheDocument()
    expect(scoped.getByRole("link", { name: /Open page/ })).toHaveAttribute(
      "href",
      validScrapeJobDetail.url,
    )
    expect(scoped.getByRole("link", { name: /Open page/ })).toHaveAttribute(
      "target",
      "_blank",
    )
    expect(scoped.getByLabelText("Status: In progress")).toHaveTextContent(
      "In progress",
    )
    expect(scoped.getByText("Attempts").nextElementSibling).toHaveTextContent("0")
    for (const [label, timestamp] of [
      ["Created", validScrapeJobDetail.createdAt],
      ["Started", validScrapeJobDetail.startedAt],
      ["Finished", "2026-04-01T10:04:00.000Z"],
    ] as const) {
      const term = scoped.getByText(label)
      expect(term.nextElementSibling?.querySelector("time")).toHaveAttribute(
        "datetime",
        timestamp,
      )
    }
    expect(scoped.queryByText("Updated")).not.toBeInTheDocument()
    expect(screen.getByText("Extracting data from this page")).toBeInTheDocument()
  })

  it.each([
    ["pending", "Waiting to start extraction"],
    ["in_progress", "Extracting data from this page"],
    [
      "cancelled",
      "Extraction was cancelled before this job finished",
    ],
  ] as const)("shows the explicit %s lifecycle state", async (status, message) => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({
            status,
            startedAt: status === "pending" ? null : validScrapeJobDetail.startedAt,
            finishedAt:
              status === "cancelled" ? "2026-04-01T10:04:00.000Z" : null,
          }),
        ),
      ),
    )

    renderDetail()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(
      screen.getByRole("status", {
        name: `Scrape Job status: ${
          status === "in_progress"
            ? "In progress"
            : status[0].toUpperCase() + status.slice(1)
        }`,
      }),
    ).toBeInTheDocument()
  })

  it("derives a complete Job heading from the Primary Identifier value", async () => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({
            status: "complete",
            result: { client_name: "Acme", industry: "Manufacturing" },
            finishedAt: "2026-04-01T10:04:00.000Z",
          }),
        ),
      ),
    )

    renderDetail()

    expect(
      await screen.findByRole("heading", { name: "Acme" }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Status: Complete")).toBeInTheDocument()
  })
})

describe("Scrape Job detail polling", () => {
  it.each(["pending", "in_progress"] as const)("polls while %s", async (status) => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          detail({ status, startedAt: status === "pending" ? null : validScrapeJobDetail.startedAt }),
        )
      }),
    )

    renderDetail()

    await vi.waitFor(() => expect(requestCount).toBe(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
  })

  it("stops polling after a terminal response", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          requestCount === 1
            ? validScrapeJobDetail
            : detail({
                status: "cancelled",
                finishedAt: "2026-04-01T10:04:00.000Z",
              }),
        )
      }),
    )

    renderDetail()

    await vi.waitFor(() => expect(requestCount).toBe(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
    expect(
      screen.getByText("Extraction was cancelled before this job finished"),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Loading scrape job detail")).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(requestCount).toBe(2)
  })

  it("suspends polling during an error retry and resumes after success", async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return requestCount === 2
          ? HttpResponse.json({ error: "Unavailable." }, { status: 503 })
          : HttpResponse.json(validScrapeJobDetail)
      }),
    )

    renderDetail({ errorRetryInterval: 10_000 })

    await vi.waitFor(() => expect(requestCount).toBe(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_001)
    })
    expect(requestCount).toBe(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_999)
    })
    await vi.waitFor(() => expect(requestCount).toBe(3))
  })

  it("cleans polling and retry timers up on unmount", async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return requestCount === 1
          ? HttpResponse.json(validScrapeJobDetail)
          : HttpResponse.json({ error: "Unavailable." }, { status: 503 })
      }),
    )

    const { unmount } = renderDetail({ errorRetryInterval: 10_000 })

    await vi.waitFor(() => expect(requestCount).toBe(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(requestCount).toBe(2)
  })

  it("revalidates on focus without requesting or mutating parent read models", async () => {
    vi.useFakeTimers()
    let jobRequests = 0
    let parentRequests = 0
    server.use(
      http.get(apiUrl, () => {
        jobRequests += 1
        return HttpResponse.json(
          detail({
            status: "cancelled",
            finishedAt: "2026-04-01T10:04:00.000Z",
          }),
        )
      }),
      http.get(parentApiUrl, () => {
        parentRequests += 1
        return HttpResponse.json({})
      }),
    )

    renderDetail({ focusThrottleInterval: 1 })

    await vi.waitFor(() => expect(jobRequests).toBe(1))
    const focusEvent = new Event("focus")
    Object.defineProperty(focusEvent, Symbol.toPrimitive, { value: () => 0 })
    window.dispatchEvent(focusEvent)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await vi.waitFor(() => expect(jobRequests).toBe(2))
    expect(parentRequests).toBe(0)
  })
})
