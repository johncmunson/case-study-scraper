import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import ScrapeRunDetailLoading from "@/app/app/scrape-runs/[runId]/loading"
import { ScrapeRunDetailView } from "@/components/scrape-runs/scrape-run-detail-view"
import type {
  ScrapeJobSummary,
  ScrapeRunDetail,
} from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunDetail } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}))

const apiUrl = "http://localhost/api/scrape-runs/17"

function detail(
  replacement: Partial<ScrapeRunDetail> = {},
): ScrapeRunDetail {
  return {
    ...validScrapeRunDetail,
    ...replacement,
    jobCounts: {
      ...validScrapeRunDetail.jobCounts,
      ...replacement.jobCounts,
    },
    fields: replacement.fields ?? validScrapeRunDetail.fields,
    stages: replacement.stages ?? validScrapeRunDetail.stages,
    jobs: replacement.jobs ?? validScrapeRunDetail.jobs,
  }
}

function zeroJobCounts() {
  return {
    total: 0,
    pending: 0,
    inProgress: 0,
    complete: 0,
    failed: 0,
    cancelled: 0,
  } as const
}

function failedJob(id: number): ScrapeJobSummary {
  return {
    id,
    url: `https://www.example.com/customers/customer-${id}`,
    status: "failed",
    primaryIdentifier: null,
    failureCode: "scrape_failed",
    attemptCount: 1,
    createdAt: "2026-04-01T10:02:00.000Z",
    updatedAt: "2026-04-01T10:03:00.000Z",
    startedAt: "2026-04-01T10:02:10.000Z",
    finishedAt: "2026-04-01T10:03:00.000Z",
  }
}

function withFailedJobs(jobs: ScrapeJobSummary[]): ScrapeRunDetail {
  return detail({
    status: "in_progress",
    jobs,
    jobCounts: {
      total: jobs.length,
      pending: 0,
      inProgress: 0,
      complete: 0,
      failed: jobs.length,
      cancelled: 0,
    },
  })
}

function renderDetail(swrConfiguration?: Parameters<typeof renderWithSwr>[2]) {
  return renderWithSwr(
    <ScrapeRunDetailView runId="17" />,
    undefined,
    swrConfiguration,
  )
}

describe("Scrape Run detail loading and errors", () => {
  it("renders the route-transition shell with back navigation", () => {
    const { container } = render(<ScrapeRunDetailLoading />)

    expect(
      screen.getByRole("link", { name: "Case Study Scraper" }),
    ).toHaveAttribute("href", "/app/scrape-runs")
    expect(screen.getByRole("link", { name: "Scrape Runs" })).toHaveAttribute(
      "href",
      "/app/scrape-runs",
    )
    expect(container.querySelectorAll('[data-slot="skeleton"]')).not.toHaveLength(0)
  })

  it("keeps back navigation available in a structured initial skeleton", () => {
    server.use(
      http.get(apiUrl, async () => {
        await delay("infinite")
        return HttpResponse.json(validScrapeRunDetail)
      }),
    )

    const { container } = renderDetail()

    expect(screen.getByRole("link", { name: "Scrape Runs" })).toHaveAttribute(
      "href",
      "/app/scrape-runs",
    )
    expect(container.querySelectorAll('[data-slot="skeleton"]')).not.toHaveLength(0)
    expect(screen.getByLabelText("Loading scrape run detail")).toBeInTheDocument()
  })

  it("renders a dedicated not-found state and does not retry a 404", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json({ error: "Not found." }, { status: 404 })
      }),
    )

    renderDetail({ errorRetryInterval: 1 })

    expect(
      await screen.findByRole("heading", { name: "Scrape Run not found" }),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to Scrape Runs" })).toHaveAttribute(
      "href",
      "/app/scrape-runs",
    )
    await delay(25)
    expect(requestCount).toBe(1)
  })

  it.each(["network", "server"] as const)(
    "retries an initial %s failure three times and allows a manual retry",
    async (failureKind) => {
      let requestCount = 0
      let shouldSucceed = false
      server.use(
        http.get(apiUrl, () => {
          requestCount += 1
          if (shouldSucceed) return HttpResponse.json(validScrapeRunDetail)
          return failureKind === "network"
            ? HttpResponse.error()
            : HttpResponse.json({ error: "Unavailable." }, { status: 503 })
        }),
      )

      renderDetail({ errorRetryInterval: 1 })

      expect(
        await screen.findByRole("heading", {
          name: "Unable to load scrape run",
        }),
      ).toBeInTheDocument()
      await waitFor(() => expect(requestCount).toBe(4))

      shouldSucceed = true
      const retryButton = screen.getByRole("button", { name: "Retry" })
      retryButton.focus()
      await userEvent.keyboard("{Enter}")

      expect(
        await screen.findByRole("heading", { name: "Customer stories" }),
      ).toBeInTheDocument()
      expect(requestCount).toBe(5)
    },
  )

  it("keeps cached detail visible and shows a compact warning after refresh failure", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return requestCount === 1
          ? HttpResponse.json(
              detail({ status: "complete", finishedAt: "2026-04-01T10:10:00.000Z" }),
            )
          : HttpResponse.json({ error: "Unavailable." }, { status: 503 })
      }),
    )

    const { container } = renderDetail({ errorRetryCount: 0 })

    expect(
      await screen.findByRole("heading", { name: "Customer stories" }),
    ).toBeInTheDocument()
    window.dispatchEvent(new Event("online"))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn’t refresh scrape run",
    )
    expect(
      screen.getByRole("heading", { name: "Customer stories" }),
    ).toBeInTheDocument()
    expect(container.querySelector('[aria-label="Loading scrape run detail"]')).toBeNull()
  })
})

describe("Scrape Run lifecycle overview", () => {
  it.each([
    ["pending", null, "Pending"],
    ["in_progress", null, "In progress"],
    ["in_progress", "2026-04-01T10:05:00.000Z", "Cancelling"],
    ["complete", null, "Complete"],
    ["failed", null, "Failed"],
    ["cancelled", "2026-04-01T10:05:00.000Z", "Cancelled"],
  ] as const)(
    "presents %s with cancellation %s as %s",
    async (status, cancellationRequestedAt, expectedLabel) => {
      server.use(
        http.get(apiUrl, () =>
          HttpResponse.json(
            detail({
              status,
              cancellationRequestedAt,
              finishedAt:
                status === "pending" || status === "in_progress"
                  ? null
                  : "2026-04-01T10:10:00.000Z",
            }),
          ),
        ),
      )

      renderDetail()

      const runHeader = (
        await screen.findByRole("heading", { name: "Customer stories" })
      ).closest("section")
      expect(runHeader).not.toBeNull()
      expect(
        within(runHeader as HTMLElement).getByLabelText(
          `Status: ${expectedLabel}`,
        ),
      ).toHaveTextContent(expectedLabel)
    },
  )

  it("shows Run Preparation without a zero-total progress bar", async () => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({ status: "pending", startedAt: null, jobCounts: zeroJobCounts(), jobs: [] }),
        ),
      ),
    )

    renderDetail()

    expect(await screen.findByText("Preparing matching pages…")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    expect(screen.queryByText(/0 of 0/)).not.toBeInTheDocument()
  })

  it("shows accessible active progress and terminal mixed outcomes", async () => {
    let response = detail({
      status: "in_progress",
      jobCounts: {
        total: 5,
        pending: 1,
        inProgress: 1,
        complete: 2,
        failed: 1,
        cancelled: 0,
      },
    })
    server.use(http.get(apiUrl, () => HttpResponse.json(response)))

    renderDetail()

    expect(await screen.findByText("3 of 5 jobs finished")).toBeInTheDocument()
    expect(
      screen.getByRole("progressbar", { name: "Scrape Job progress" }),
    ).toHaveAttribute("aria-valuenow", "60")

    response = detail({
      status: "complete",
      finishedAt: "2026-04-01T10:10:00.000Z",
      jobCounts: {
        total: 5,
        pending: 0,
        inProgress: 0,
        complete: 3,
        failed: 2,
        cancelled: 0,
      },
    })
    window.dispatchEvent(new Event("online"))

    expect(await screen.findByText("3 succeeded · 2 failed")).toBeInTheDocument()
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
  })

  it("presents lifecycle timestamps and a sanitized Run-level failure", async () => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({
            status: "failed",
            cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
            finishedAt: "2026-04-01T10:10:00.000Z",
            failureCode: "workflow_dispatch_failed",
            failureMessage: "The Scrape Run could not be started.",
            jobCounts: zeroJobCounts(),
            jobs: [],
          }),
        ),
      ),
    )

    renderDetail()

    expect(await screen.findByText("The Scrape Run could not be started.")).toBeInTheDocument()
    expect(screen.getByText("workflow_dispatch_failed")).toBeInTheDocument()
    const runHeader = screen.getByRole("heading", { name: "Customer stories" }).closest("section")
    expect(runHeader).not.toBeNull()
    for (const label of ["Created", "Started", "Finished", "Cancellation requested"]) {
      const term = within(runHeader as HTMLElement).getByText(label)
      const value = term.nextElementSibling
      expect(value?.querySelector("time")).toHaveAttribute("datetime")
    }
    expect(screen.getAllByText("No scrape jobs created")).toHaveLength(2)
  })

  it("announces lifecycle changes through one restrained status region", async () => {
    let response = detail({ status: "in_progress" })
    server.use(http.get(apiUrl, () => HttpResponse.json(response)))

    renderDetail()

    const statusRegion = await screen.findByRole("status", {
      name: "Scrape Run status: In progress",
    })
    expect(within(statusRegion).getByLabelText("Status: In progress")).toBeInTheDocument()

    response = detail({
      status: "complete",
      finishedAt: "2026-04-01T10:10:00.000Z",
    })
    window.dispatchEvent(new Event("online"))

    expect(
      await screen.findByRole("status", {
        name: "Scrape Run status: Complete",
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole("status")).toHaveLength(1)
  })

  it("keeps long identity and sanitized failure content available without narrow-layout overflow", async () => {
    const longName = "QuarterlyInternationalCustomerSuccessStories".repeat(2)
    const longHostname = `${"customer-stories-".repeat(3)}archive.example.com`
    const longFailure = "TheScrapeRunCouldNotFinishSafely".repeat(12)
    const longFieldDescription = "LongUnbrokenFieldDescription".repeat(16)
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({
            name: longName,
            targetUrl: `https://${longHostname}/`,
            status: "failed",
            finishedAt: "2026-04-01T10:10:00.000Z",
            failureCode: "unexpected_workflow_failure",
            failureMessage: longFailure,
            stages: validScrapeRunDetail.stages.map((stage, index) => ({
              ...stage,
              status: index === 2 ? "failed" : "complete",
              failureCode: index === 2 ? "scrape_failed" : null,
              failureMessage: index === 2 ? longFailure : null,
            })),
            fields: validScrapeRunDetail.fields.map((field, index) =>
              index === 0
                ? { ...field, description: longFieldDescription }
                : field,
            ),
          }),
        ),
      ),
    )

    renderWithSwr(
      <div style={{ width: 280 }}>
        <ScrapeRunDetailView runId="17" />
      </div>,
    )

    expect(await screen.findByRole("heading", { name: longName })).toHaveClass(
      "wrap-break-word",
    )
    expect(
      screen.getByRole("link", {
        name: /^customer-stories-.*opens in a new tab/,
      }),
    ).toBeInTheDocument()
    const failureAlert = screen.getByRole("alert")
    expect(within(failureAlert).getByText(longFailure)).toHaveClass(
      "wrap-anywhere",
    )
    expect(
      within(failureAlert).getByText("unexpected_workflow_failure").closest("p"),
    ).toHaveClass("wrap-anywhere")
    const stages = screen.getByRole("list", { name: "Run Stages" })
    expect(within(stages).getByText(longFailure)).toHaveClass("wrap-anywhere")
    expect(within(stages).getByText("scrape_failed").closest("p")).toHaveClass(
      "wrap-anywhere",
    )
    const configuration = screen.getByRole("button", {
      name: "Run Configuration",
    })
    configuration.focus()
    await userEvent.keyboard("{Enter}")
    expect(screen.getByText(longFieldDescription)).toHaveClass("wrap-break-word")
  })

  it("shows every Stage state distinctly with attempts, timestamps, and failure details", async () => {
    const stageStates: ScrapeRunDetail["stages"] = validScrapeRunDetail.stages.map(
      (stage, index) => ({
        ...stage,
        status: (["pending", "in_progress", "failed"] as const)[index],
        attemptCount: index,
        failureCode: index === 2 ? "scrape_failed" : null,
        failureMessage: index === 2 ? "Extraction could not finish." : null,
        startedAt: index === 0 ? null : stage.startedAt,
        finishedAt: index === 2 ? stage.finishedAt : null,
      }),
    )
    server.use(
      http.get(apiUrl, () => HttpResponse.json(detail({ stages: stageStates }))),
    )

    const { unmount } = renderDetail()

    const stages = await screen.findByRole("list", { name: "Run Stages" })
    expect(within(stages).getAllByRole("listitem")).toHaveLength(3)
    for (const label of ["Mapping", "Filtering", "Scraping", "Pending", "In progress", "Failed"]) {
      expect(within(stages).getByText(label)).toBeInTheDocument()
    }
    expect(within(stages).getByText("1 attempt")).toBeInTheDocument()
    expect(within(stages).getByText("2 attempts")).toBeInTheDocument()
    expect(within(stages).getByText("Extraction could not finish.")).toBeInTheDocument()
    expect(within(stages).getByText("scrape_failed")).toBeInTheDocument()

    unmount()
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          detail({
            stages: validScrapeRunDetail.stages.map((stage, index) => ({
              ...stage,
              status: (["complete", "skipped", "cancelled"] as const)[index],
            })),
          }),
        ),
      ),
    )
    renderDetail()

    const secondStages = await screen.findByRole("list", { name: "Run Stages" })
    for (const label of ["Complete", "Skipped", "Cancelled"]) {
      expect(within(secondStages).getByText(label)).toBeInTheDocument()
    }
  })
})

describe("Scrape Job summaries integration", () => {
  it("uses the Run-detail summaries without requesting individual job detail", async () => {
    let runDetailRequests = 0
    let jobDetailRequests = 0
    server.use(
      http.get(apiUrl, () => {
        runDetailRequests += 1
        return HttpResponse.json(
          detail({
            status: "complete",
            finishedAt: "2026-04-01T10:10:00.000Z",
          }),
        )
      }),
      http.get(
        "http://localhost/api/scrape-runs/17/scrape-jobs/:jobId",
        () => {
          jobDetailRequests += 1
          return HttpResponse.json({})
        },
      ),
    )

    renderDetail()

    const table = await screen.findByRole("table", { name: "Scrape Jobs" })
    expect(within(table).getByRole("link", { name: "Acme" })).toHaveAttribute(
      "href",
      "/app/scrape-runs/17/scrape-jobs/31",
    )
    await delay(25)
    expect(runDetailRequests).toBe(1)
    expect(jobDetailRequests).toBe(0)
  })
})

describe("Scrape Run Configuration", () => {
  it("starts collapsed, expands locally, and omits implementation-facing values", async () => {
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          detail({ status: "complete", finishedAt: "2026-04-01T10:10:00.000Z" }),
        )
      }),
    )

    renderDetail()

    const disclosure = await screen.findByRole("button", { name: /Run Configuration/ })
    expect(disclosure).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("The customer industry")).not.toBeInTheDocument()

    disclosure.focus()
    await userEvent.keyboard("{Enter}")

    expect(disclosure).toHaveFocus()
    expect(disclosure).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: /^https:\/\/www\.example\.com\/\(opens/ })).toHaveAttribute(
      "href",
      "https://www.example.com/",
    )
    expect(screen.getByRole("heading", { name: "Example Pages" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Extraction Fields" })).toBeInTheDocument()
    const extractionFields = screen.getByRole("region", {
      name: "Extraction Fields",
    })
    expect(within(extractionFields).getByText("Client Name")).toBeInTheDocument()
    expect(within(extractionFields).getByText("The customer industry")).toBeInTheDocument()
    expect(within(extractionFields).getByText("Required")).toBeInTheDocument()
    expect(within(extractionFields).getByText("Primary Identifier")).toBeInTheDocument()
    expect(screen.queryByText("client_name")).not.toBeInTheDocument()
    expect(screen.queryByText(validScrapeRunDetail.filteringModel)).not.toBeInTheDocument()
    expect(requestCount).toBe(1)
  })
})

describe("Scrape Run detail polling", () => {
  it("revalidates terminal cached data when the window regains focus", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          detail({ status: "complete", finishedAt: "2026-04-01T10:10:00.000Z" }),
        )
      }),
    )

    renderDetail({ focusThrottleInterval: 1 })

    await vi.waitFor(() => expect(requestCount).toBe(1))
    const focusEvent = new Event("focus")
    // Browsers coerce SWR's event-derived timer delay to zero; avoid a Node warning.
    Object.defineProperty(focusEvent, Symbol.toPrimitive, { value: () => 0 })
    window.dispatchEvent(focusEvent)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
  })

  it.each([
    ["pending", null],
    ["in_progress", "2026-04-01T10:05:00.000Z"],
  ] as const)("polls while %s with cancellation %s", async (status, cancellationRequestedAt) => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(detail({ status, cancellationRequestedAt }))
      }),
    )

    renderDetail()

    await vi.waitFor(() => expect(requestCount).toBe(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))
  })

  it("keeps active cached sections visible with a warning after a polling failure", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return requestCount === 1
          ? HttpResponse.json(detail({ status: "in_progress" }))
          : HttpResponse.json({ error: "Unavailable." }, { status: 503 })
      }),
    )

    renderDetail()

    await vi.waitFor(() => {
      expect(screen.getByRole("heading", { name: "Customer stories" })).toBeInTheDocument()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    await vi.waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn’t refresh scrape run",
      )
    })
    expect(screen.getByRole("heading", { name: "Customer stories" })).toBeInTheDocument()
    expect(screen.getByRole("list", { name: "Run Stages" })).toBeInTheDocument()
  })

  it("keeps filtering usable and clamps pagination when polling shrinks the selected status", async () => {
    const initialJobs = Array.from({ length: 31 }, (_, index) =>
      failedJob(index + 1),
    )
    const polledJobs = initialJobs.slice(0, 5)
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          requestCount === 1
            ? withFailedJobs(initialJobs)
            : withFailedJobs(polledJobs),
        )
      }),
    )

    renderDetail()

    await waitFor(() => expect(requestCount).toBe(1))
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Filter by status" }))
    await user.click(screen.getByRole("option", { name: "Failed (31)" }))
    const nextPage = screen.getByRole("button", { name: "Next page" })
    nextPage.focus()
    await user.keyboard("{Enter}")
    expect(screen.getByText("26–31 of 31 jobs")).toBeInTheDocument()

    await waitFor(() => expect(requestCount).toBe(2), { timeout: 4_000 })
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toHaveTextContent(
      "Failed (5)",
    )
    expect(screen.getByText("1–5 of 5 jobs")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument()
    expect(screen.getAllByText(/customer-1$/)).toHaveLength(2)
    expect(screen.queryByText(/customer-26$/)).not.toBeInTheDocument()
  })

  it("suspends polling during an error retry and resumes after a successful active response", async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        if (requestCount === 2) {
          return HttpResponse.json({ error: "Unavailable." }, { status: 503 })
        }
        return HttpResponse.json(detail({ status: "in_progress" }))
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

  it("cancels a scheduled error retry when the view unmounts", async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, "random").mockReturnValue(0)
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return requestCount === 1
          ? HttpResponse.json(detail({ status: "in_progress" }))
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

  it("cleans up active polling when the view unmounts", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(detail({ status: "in_progress" }))
      }),
    )

    const { unmount } = renderDetail()

    await vi.waitFor(() => expect(requestCount).toBe(1))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(requestCount).toBe(1)
  })

  it("stops polling after a terminal response and cleans timers on unmount", async () => {
    vi.useFakeTimers()
    let requestCount = 0
    server.use(
      http.get(apiUrl, () => {
        requestCount += 1
        return HttpResponse.json(
          requestCount === 1
            ? detail({ status: "in_progress" })
            : detail({ status: "complete", finishedAt: "2026-04-01T10:10:00.000Z" }),
        )
      }),
    )

    const { unmount } = renderDetail()

    await vi.waitFor(() => expect(requestCount).toBe(1))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    await vi.waitFor(() => expect(requestCount).toBe(2))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(requestCount).toBe(2)

    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000)
    })
    expect(requestCount).toBe(2)
  })
})
