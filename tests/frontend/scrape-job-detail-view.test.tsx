import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import ScrapeJobDetailLoading from "@/app/app/scrape-runs/[runId]/scrape-jobs/[jobId]/loading"
import { ScrapeJobDetailView } from "@/components/scrape-runs/scrape-job-detail-view"
import {
  SCRAPE_RUNS_API_PATH,
  type ScrapeJobDetail,
} from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import {
  validScrapeJobDetail,
  validScrapeRunDetail,
  validScrapeRunSummary,
} from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

const { routerReplaceMock, toastErrorMock, toastSuccessMock, toastWarningMock } =
  vi.hoisted(() => ({
    routerReplaceMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastWarningMock: vi.fn(),
  }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: routerReplaceMock,
  }),
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: toastWarningMock,
  },
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
  it("deletes a Job only for a terminal parent, warms the parent cache, and replaces navigation", async () => {
    const terminalJob = detail({
      scrapeRun: { ...validScrapeJobDetail.scrapeRun, status: "complete" },
    })
    let deleted = false
    server.use(
      http.get(apiUrl, () => HttpResponse.json(terminalJob)),
      http.delete(apiUrl, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.get("http://localhost/api/scrape-runs", () =>
        HttpResponse.json([
          {
            ...validScrapeRunSummary,
            status: "complete",
            finishedAt: "2026-04-01T10:10:00.000Z",
          },
        ]),
      ),
      http.get(parentApiUrl, () =>
        HttpResponse.json({
          ...validScrapeRunDetail,
          status: "complete",
          jobs: validScrapeRunDetail.jobs.filter(({ id }) => id !== 31),
          jobCounts: {
            ...validScrapeRunDetail.jobCounts,
            total: validScrapeRunDetail.jobCounts.total - 1,
            complete: validScrapeRunDetail.jobCounts.complete - 1,
          },
        }),
      ),
    )

    renderDetail()

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Scrape Job" }),
    )
    expect(screen.getByText("Delete Scrape Job?")).toBeInTheDocument()
    expect(screen.getByText(/including its lifecycle record/)).toHaveTextContent(
      "This action cannot be undone.",
    )
    await userEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete Scrape Job",
      }),
    )

    await waitFor(() => expect(deleted).toBe(true))
    await waitFor(() =>
      expect(routerReplaceMock).toHaveBeenCalledWith("/app/scrape-runs/17"),
    )
    expect(toastSuccessMock).toHaveBeenCalledWith("Scrape Job deleted", {
      position: "bottom-center",
    })
  })

  it("hides deletion while the parent Run is active", async () => {
    server.use(http.get(apiUrl, () => HttpResponse.json(validScrapeJobDetail)))

    renderDetail()

    expect(await screen.findByText("Extracting data from this page")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Delete Scrape Job" }),
    ).not.toBeInTheDocument()
  })

  it("renders the route-transition shell with back navigation", () => {
    const { container } = render(<ScrapeJobDetailLoading />)

    expect(
      screen.getByRole("link", { name: "Case Study Scraper" }),
    ).toHaveAttribute("href", "/app/scrape-runs")
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

  it("discards only the unavailable Job cache entry after a background 404", async () => {
    let requestCount = 0
    const parentListCacheEntry = { data: [validScrapeRunSummary] }
    const parentDetailCacheEntry = { data: { id: 17, sentinel: "parent detail" } }
    const otherJobCacheEntry = { data: { id: 32, sentinel: "other job" } }
    const cache = new Map<string, object>([
      [SCRAPE_RUNS_API_PATH, parentListCacheEntry],
      ["/api/scrape-runs/17", parentDetailCacheEntry],
      ["/api/scrape-runs/17/scrape-jobs/32", otherJobCacheEntry],
    ])
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

    renderDetail({ provider: () => cache })

    expect(
      await screen.findByText("Extracting data from this page"),
    ).toBeInTheDocument()
    window.dispatchEvent(new Event("online"))

    expect(
      await screen.findByRole("heading", { name: "Scrape Job not found" }),
    ).toBeInTheDocument()
    expect(screen.queryByText("Extracting data from this page")).not.toBeInTheDocument()
    expect(cache.get(SCRAPE_RUNS_API_PATH)).toBe(parentListCacheEntry)
    expect(cache.get("/api/scrape-runs/17")).toBe(parentDetailCacheEntry)
    expect(cache.get("/api/scrape-runs/17/scrape-jobs/32")).toBe(
      otherJobCacheEntry,
    )
    await delay(25)
    expect(requestCount).toBe(2)
  })

  it("does not replace cached detail with a malformed successful response", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        if (requestCount === 1) return HttpResponse.json(validScrapeJobDetail)
        if (requestCount === 2) {
          return HttpResponse.json(
            detail({
              id: 32,
              status: "complete",
              result: { client_name: "Injected", industry: null },
              finishedAt: "2026-04-01T10:04:00.000Z",
            }),
          )
        }
        return HttpResponse.json(
          detail({
            status: "complete",
            result: { client_name: "Acme", industry: "Manufacturing" },
            finishedAt: "2026-04-01T10:04:00.000Z",
          }),
        )
      }),
    )

    renderDetail({ errorRetryCount: 0 })

    expect(
      await screen.findByText("Extracting data from this page"),
    ).toBeInTheDocument()
    window.dispatchEvent(new Event("online"))
    await waitFor(() => expect(requestCount).toBe(2))

    expect(screen.getByText("Extracting data from this page")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Injected" })).not.toBeInTheDocument()
    expect(
      screen.queryByRole("region", { name: "Extraction Result" }),
    ).not.toBeInTheDocument()

    window.dispatchEvent(new Event("online"))
    await waitFor(() => expect(requestCount).toBe(3))
    expect(screen.getByRole("heading", { name: "Acme" })).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Extraction Result" }),
    ).toBeInTheDocument()
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
    const sourceLink = scoped.getByRole("link", {
      name: /opens in a new tab/,
    })
    expect(sourceLink).toHaveTextContent(validScrapeJobDetail.url)
    expect(sourceLink).toHaveAttribute("href", validScrapeJobDetail.url)
    expect(sourceLink).toHaveAttribute("target", "_blank")
    expect(sourceLink).toHaveClass("text-muted-foreground", "hover:text-primary")
    expect(scoped.queryByText("Open page")).not.toBeInTheDocument()
    expect(
      scoped.queryByText("The normalized source page for this Scrape Job."),
    ).not.toBeInTheDocument()

    const titleRow = heading.parentElement
    expect(titleRow).not.toBeNull()
    expect(
      within(titleRow as HTMLElement).getByLabelText("Status: In progress"),
    ).toHaveTextContent("In progress")

    const sourceCard = scoped
      .getByRole("heading", { name: "Page URL" })
      .closest('[data-slot="card"]')
    expect(sourceCard).not.toBeNull()
    const card = within(sourceCard as HTMLElement)
    expect(card.queryByRole("separator")).not.toBeInTheDocument()
    expect(sourceCard?.querySelector("hr")).toBeNull()
    expect(card.getByText("Attempts").nextElementSibling).toHaveTextContent("0")
    for (const [label, timestamp] of [
      ["Created", validScrapeJobDetail.createdAt],
      ["Started", validScrapeJobDetail.startedAt],
      ["Finished", "2026-04-01T10:04:00.000Z"],
    ] as const) {
      const term = card.getByText(label)
      expect(term.nextElementSibling?.querySelector("time")).toHaveAttribute(
        "datetime",
        timestamp,
      )
    }
    expect(card.queryByText("Updated")).not.toBeInTheDocument()
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
    expect(
      screen.getByRole("region", { name: "Extraction Result" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Manufacturing")).toBeInTheDocument()
  })

  it("supports keyboard navigation through breadcrumbs and the source link", async () => {
    server.use(
      http.get(apiUrl, () => HttpResponse.json(validScrapeJobDetail)),
    )
    const user = userEvent.setup()

    renderDetail()

    await screen.findByRole("heading", { name: "Scrape Job" })
    await user.tab()
    expect(screen.getByRole("link", { name: "Scrape Runs" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("link", { name: "Customer stories" })).toHaveFocus()
    await user.tab()
    expect(
      screen.getByRole("link", { name: /opens in a new tab/ }),
    ).toHaveFocus()
  })

  it("renders a failed outcome without exposing a partial result", async () => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({
            status: "failed",
            failureCode: "missing_required_fields",
            failureMessage: "A required value was not found.",
            missingRequiredFieldKeys: ["client_name"],
            finishedAt: "2026-04-01T10:04:00.000Z",
          }),
        ),
      ),
    )

    renderDetail()

    expect(
      await screen.findByRole("heading", { name: "Scrape Job failed" }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Status: Failed")).toBeInTheDocument()
    expect(screen.getByText("Client Name")).toBeInTheDocument()
    expect(
      screen.queryByRole("region", { name: "Extraction Result" }),
    ).not.toBeInTheDocument()
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
                scrapeRun: {
                  ...validScrapeJobDetail.scrapeRun,
                  status: "cancelled",
                },
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

  it("replaces the active shell and identity with one complete snapshot", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          requestCount === 1
            ? validScrapeJobDetail
            : detail({
                status: "complete",
                result: {
                  client_name: "Acme",
                  industry: "Manufacturing",
                },
                finishedAt: "2026-04-01T10:04:00.000Z",
                scrapeRun: {
                  ...validScrapeJobDetail.scrapeRun,
                  status: "complete",
                },
              }),
        )
      }),
    )

    renderDetail()

    await vi.waitFor(() => expect(requestCount).toBe(1))
    expect(screen.getByText("Extracting data from this page")).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
    expect(screen.getByRole("heading", { name: "Acme" })).toBeInTheDocument()
    expect(
      screen.getByRole("region", { name: "Extraction Result" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Extracting data from this page"),
    ).not.toBeInTheDocument()
  })

  it("replaces an active snapshot with one failed snapshot and stops polling", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          requestCount === 1
            ? validScrapeJobDetail
            : detail({
                status: "failed",
                failureCode: "missing_required_fields",
                failureMessage: "A required value was not found.",
                missingRequiredFieldKeys: ["client_name"],
                finishedAt: "2026-04-01T10:04:00.000Z",
                scrapeRun: {
                  ...validScrapeJobDetail.scrapeRun,
                  status: "failed",
                },
              }),
        )
      }),
    )

    renderDetail()

    await vi.waitFor(() => expect(requestCount).toBe(1))
    expect(screen.getByText("Extracting data from this page")).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))

    expect(
      screen.getByRole("heading", { name: "Scrape Job failed" }),
    ).toBeInTheDocument()
    expect(screen.getByText("Client Name")).toBeInTheDocument()
    expect(screen.queryByText("client_name")).not.toBeInTheDocument()
    expect(
      screen.queryByText("Extracting data from this page"),
    ).not.toBeInTheDocument()
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
    expect(toastErrorMock).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_001)
    })
    expect(requestCount).toBe(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_999)
    })
    await vi.waitFor(() => expect(requestCount).toBe(3))
  })

  it("deduplicates a scheduled retry racing an in-flight manual Retry", async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    let requestCount = 0
    let releaseTerminalResponse: () => void = () => undefined
    const terminalResponse = new Promise<void>((resolve) => {
      releaseTerminalResponse = () => resolve()
    })
    server.use(
      http.get(apiUrl, async () => {
        requestCount += 1
        if (requestCount === 1) return HttpResponse.json(validScrapeJobDetail)
        if (requestCount === 2) {
          return HttpResponse.json({ error: "Unavailable." }, { status: 503 })
        }
        await terminalResponse
        return HttpResponse.json(
          detail({
            status: "complete",
            result: { client_name: "Acme", industry: "Manufacturing" },
            finishedAt: "2026-04-01T10:04:00.000Z",
            scrapeRun: {
              ...validScrapeJobDetail.scrapeRun,
              status: "complete",
            },
          }),
        )
      }),
    )

    renderDetail({ errorRetryInterval: 10_000 })

    await vi.waitFor(() => expect(requestCount).toBe(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
    await act(async () => {
      screen.getByRole("button", { name: "Retry" }).click()
    })
    await vi.waitFor(() => expect(requestCount).toBe(3))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(requestCount).toBe(3)

    releaseTerminalResponse()
    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "Acme" })).toBeInTheDocument()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(requestCount).toBe(3)
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
    const parentListCacheEntry = { data: [validScrapeRunSummary] }
    const parentDetailCacheEntry = { data: { id: 17, sentinel: "parent detail" } }
    const cache = new Map<string, object>([
      [SCRAPE_RUNS_API_PATH, parentListCacheEntry],
      ["/api/scrape-runs/17", parentDetailCacheEntry],
    ])
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

    renderDetail({
      focusThrottleInterval: 1,
      provider: () => cache,
    })

    await vi.waitFor(() => expect(jobRequests).toBe(1))
    const focusEvent = new Event("focus")
    Object.defineProperty(focusEvent, Symbol.toPrimitive, { value: () => 0 })
    window.dispatchEvent(focusEvent)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await vi.waitFor(() => expect(jobRequests).toBe(2))
    expect(parentRequests).toBe(0)
    expect(cache.get(SCRAPE_RUNS_API_PATH)).toBe(parentListCacheEntry)
    expect(cache.get("/api/scrape-runs/17")).toBe(parentDetailCacheEntry)
  })
})
