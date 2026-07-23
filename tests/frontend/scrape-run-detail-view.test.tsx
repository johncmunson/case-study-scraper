import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { ScrapeRunDetailView } from "@/components/scrape-runs/scrape-run-detail-view"
import type { ScrapeRunDetail } from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunDetail } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

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

function renderDetail(swrConfiguration?: Parameters<typeof renderWithSwr>[2]) {
  return renderWithSwr(
    <ScrapeRunDetailView runId="17" />,
    undefined,
    swrConfiguration,
  )
}

describe("Scrape Run detail loading and errors", () => {
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
      await userEvent.click(screen.getByRole("button", { name: "Retry" }))

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

      expect(
        await screen.findByLabelText(`Status: ${expectedLabel}`),
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
    expect(screen.getByText("No scrape jobs created")).toBeInTheDocument()
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

    await userEvent.click(disclosure)

    expect(disclosure).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("link", { name: /^https:\/\/www\.example\.com\/\(opens/ })).toHaveAttribute(
      "href",
      "https://www.example.com/",
    )
    expect(screen.getByRole("heading", { name: "Example Pages" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Extraction Fields" })).toBeInTheDocument()
    expect(screen.getByText("Client Name")).toBeInTheDocument()
    expect(screen.getByText("The customer industry")).toBeInTheDocument()
    expect(screen.getByText("Required")).toBeInTheDocument()
    expect(screen.getByText("Primary Identifier")).toBeInTheDocument()
    expect(screen.queryByText("client_name")).not.toBeInTheDocument()
    expect(screen.queryByText(validScrapeRunDetail.filteringModel)).not.toBeInTheDocument()
    expect(requestCount).toBe(1)
  })
})

describe("Scrape Run detail polling", () => {
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
