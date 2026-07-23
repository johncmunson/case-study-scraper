import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import useSWR from "swr"
import { describe, expect, it } from "vitest"

import { ScrapeRunDetailView } from "@/components/scrape-runs/scrape-run-detail-view"
import {
  fetchScrapeRunSummaries,
  SCRAPE_RUNS_API_PATH,
  type ScrapeRunDetail,
  type ScrapeRunSummary,
} from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import {
  validScrapeRunDetail,
  validScrapeRunSummary,
} from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

const listApiUrl = "http://localhost/api/scrape-runs"
const detailApiUrl = `${listApiUrl}/17`

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

function ListCacheProbe() {
  const { data } = useSWR(SCRAPE_RUNS_API_PATH, fetchScrapeRunSummaries)
  const run = data?.find(({ id }) => id === 17)

  return <output aria-label="Run-list cached status">{run?.status}</output>
}

function renderDetail(
  withListCacheProbe = false,
  swrConfiguration?: Parameters<typeof renderWithSwr>[2],
) {
  return renderWithSwr(
    <>
      <ScrapeRunDetailView runId="17" />
      {withListCacheProbe && <ListCacheProbe />}
    </>,
    undefined,
    swrConfiguration,
  )
}

function getRunHeader() {
  const header = screen
    .getByRole("heading", { name: "Customer stories" })
    .closest("section")
  expect(header).not.toBeNull()
  return within(header as HTMLElement)
}

describe("Scrape Run cancellation", () => {
  it("requires an accessible confirmation before cancelling an active Run", async () => {
    let postCount = 0
    server.use(
      http.get(detailApiUrl, () => HttpResponse.json(detail())),
      http.post(`${detailApiUrl}/cancel`, () => {
        postCount += 1
        return HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        )
      }),
    )

    renderDetail()

    const trigger = await screen.findByRole("button", {
      name: "Cancel Scrape Run",
    })
    expect(postCount).toBe(0)
    expect(getRunHeader().getByLabelText("Status: Pending")).toBeInTheDocument()

    await userEvent.click(trigger)

    const dialog = screen.getByRole("alertdialog", {
      name: "Cancel Scrape Run?",
    })
    expect(dialog).toHaveAccessibleDescription(
      "Unfinished work will stop. Scrape Jobs that already finished will keep their outcomes.",
    )
    const keepRunning = within(dialog).getByRole("button", {
      name: "Keep running",
    })
    expect(keepRunning).toBeInTheDocument()
    expect(keepRunning).toHaveFocus()
    expect(
      within(dialog).getByRole("button", { name: "Cancel Scrape Run" }),
    ).toBeInTheDocument()
    expect(postCount).toBe(0)

    await userEvent.click(keepRunning)

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("offers and completes retry cancellation with recovery-specific copy", async () => {
    let detailGetCount = 0
    let postCount = 0
    const cancellingDetail = detail({
      status: "in_progress",
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
    })
    const cancelledDetail = detail({
      status: "cancelled",
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      finishedAt: "2026-04-01T10:10:00.000Z",
    })
    server.use(
      http.get(detailApiUrl, () => {
        detailGetCount += 1
        return HttpResponse.json(
          detailGetCount === 1 ? cancellingDetail : cancelledDetail,
        )
      }),
      http.get(listApiUrl, () =>
        HttpResponse.json([
          summary({
            status: "cancelled",
            cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
            finishedAt: "2026-04-01T10:10:00.000Z",
          }),
        ]),
      ),
      http.post(`${detailApiUrl}/cancel`, () => {
        postCount += 1
        return HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        )
      }),
    )

    renderDetail()

    expect(
      await screen.findByText(
        "The earlier cancellation request has not finished cleanup.",
      ),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: "Retry cancellation" }),
    )

    const dialog = screen.getByRole("alertdialog", {
      name: "Retry cancellation?",
    })
    expect(dialog).toHaveAccessibleDescription(
      "Retry incomplete cancellation cleanup. Finished Scrape Job outcomes will remain unchanged.",
    )
    const retryAction = within(dialog).getByRole("button", {
      name: "Retry cancellation",
    })
    expect(retryAction).toBeInTheDocument()

    await userEvent.click(retryAction)

    await waitFor(() => {
      expect(getRunHeader().getByLabelText("Status: Cancelled")).toBeInTheDocument()
    })
    expect(postCount).toBe(1)
    expect(detailGetCount).toBe(2)
  })

  it("does not offer cancellation for a terminal Run", async () => {
    server.use(
      http.get(detailApiUrl, () =>
        HttpResponse.json(
          detail({
            status: "complete",
            finishedAt: "2026-04-01T10:10:00.000Z",
          }),
        ),
      ),
    )

    renderDetail()

    expect(
      await screen.findByRole("heading", { name: "Customer stories" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /cancel/i }),
    ).not.toBeInTheDocument()
  })

  it("projects a validated 202 into detail and list caches before revalidating both read models", async () => {
    let detailGetCount = 0
    let listGetCount = 0
    let releaseRevalidation!: () => void
    const revalidationCanFinish = new Promise<void>((resolve) => {
      releaseRevalidation = resolve
    })
    const cancelledDetail = detail({
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
      stages: validScrapeRunDetail.stages.map((stage, index) => ({
        ...stage,
        status: index === 2 ? "cancelled" : "complete",
        finishedAt:
          stage.finishedAt ?? "2026-04-01T10:10:00.000Z",
      })),
    })
    const cancelledSummary = summary({
      status: "cancelled",
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      finishedAt: "2026-04-01T10:10:00.000Z",
      jobCounts: cancelledDetail.jobCounts,
    })
    server.use(
      http.get(detailApiUrl, async () => {
        detailGetCount += 1
        if (detailGetCount > 1) await revalidationCanFinish
        return HttpResponse.json(
          detailGetCount === 1 ? detail() : cancelledDetail,
        )
      }),
      http.get(listApiUrl, async () => {
        listGetCount += 1
        if (listGetCount > 1) await revalidationCanFinish
        return HttpResponse.json([
          listGetCount === 1 ? summary() : cancelledSummary,
        ])
      }),
      http.post(`${detailApiUrl}/cancel`, () =>
        HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        ),
      ),
    )

    renderDetail(true)
    await screen.findByRole("heading", { name: "Customer stories" })
    expect(screen.getByLabelText("Run-list cached status")).toHaveTextContent(
      "pending",
    )

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Cancel Scrape Run" }),
    )
    await user.click(
      screen
        .getByRole("alertdialog")
        .querySelector('[data-slot="alert-dialog-action"]') as HTMLElement,
    )

    await waitFor(() => {
      expect(getRunHeader().getByLabelText("Status: Cancelled")).toBeInTheDocument()
      expect(screen.getByLabelText("Run-list cached status")).toHaveTextContent(
        "cancelled",
      )
    })
    expect(screen.getByText("2 succeeded · 1 failed")).toBeInTheDocument()
    expect(detailGetCount).toBe(2)
    expect(listGetCount).toBe(2)

    releaseRevalidation()

    expect(
      await screen.findByText("2 succeeded · 1 failed · 2 cancelled"),
    ).toBeInTheDocument()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("keeps confirmed Cancelled cache state when both post-202 GETs fail", async () => {
    let detailGetCount = 0
    let listGetCount = 0
    let failRevalidation = true
    const cancelledDetail = detail({
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
    })
    const cancelledSummary = summary({
      status: "cancelled",
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      finishedAt: "2026-04-01T10:10:00.000Z",
      jobCounts: cancelledDetail.jobCounts,
    })
    server.use(
      http.get(detailApiUrl, () => {
        detailGetCount += 1
        if (detailGetCount > 1 && failRevalidation) {
          return HttpResponse.json({ error: "Unavailable." }, { status: 503 })
        }
        return HttpResponse.json(
          detailGetCount === 1 ? detail() : cancelledDetail,
        )
      }),
      http.get(listApiUrl, () => {
        listGetCount += 1
        if (listGetCount > 1 && failRevalidation) {
          return HttpResponse.json({ error: "Unavailable." }, { status: 503 })
        }
        return HttpResponse.json([
          listGetCount === 1 ? summary() : cancelledSummary,
        ])
      }),
      http.post(`${detailApiUrl}/cancel`, () =>
        HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        ),
      ),
    )

    renderDetail(true, { errorRetryCount: 0 })
    await screen.findByRole("heading", { name: "Customer stories" })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Cancel Scrape Run" }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel Scrape Run",
      }),
    )

    expect(
      await screen.findByText("Couldn’t refresh scrape run"),
    ).toBeInTheDocument()
    expect(getRunHeader().getByLabelText("Status: Cancelled")).toBeInTheDocument()
    expect(screen.getByLabelText("Run-list cached status")).toHaveTextContent(
      "cancelled",
    )
    expect(screen.getByText("2 succeeded · 1 failed")).toBeInTheDocument()
    expect(detailGetCount).toBe(2)
    expect(listGetCount).toBe(2)

    failRevalidation = false
    await user.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => {
      expect(screen.queryByText("Couldn’t refresh scrape run")).not.toBeInTheDocument()
      expect(detailGetCount).toBe(3)
      expect(listGetCount).toBe(3)
    })
    expect(
      screen.getByText("2 succeeded · 1 failed · 2 cancelled"),
    ).toBeInTheDocument()
  })

  it("shows the stale-data warning when only detail revalidation fails", async () => {
    let detailGetCount = 0
    let listGetCount = 0
    server.use(
      http.get(detailApiUrl, () => {
        detailGetCount += 1
        return detailGetCount === 1
          ? HttpResponse.json(detail())
          : HttpResponse.json({ error: "Unavailable." }, { status: 503 })
      }),
      http.get(listApiUrl, () => {
        listGetCount += 1
        return HttpResponse.json([
          listGetCount === 1
            ? summary()
            : summary({
                status: "cancelled",
                cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
                finishedAt: "2026-04-01T10:10:00.000Z",
              }),
        ])
      }),
      http.post(`${detailApiUrl}/cancel`, () =>
        HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        ),
      ),
    )

    renderDetail(true)
    await screen.findByRole("heading", { name: "Customer stories" })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Cancel Scrape Run" }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel Scrape Run",
      }),
    )

    expect(
      await screen.findByText("Couldn’t refresh scrape run"),
    ).toBeInTheDocument()
    expect(getRunHeader().getByLabelText("Status: Cancelled")).toBeInTheDocument()
    expect(screen.getByLabelText("Run-list cached status")).toHaveTextContent(
      "cancelled",
    )
    expect(screen.getByText("2 succeeded · 1 failed")).toBeInTheDocument()
    expect(detailGetCount).toBe(2)
    expect(listGetCount).toBe(2)
  })

  it("shows the stale-data warning when only Run-list revalidation fails", async () => {
    let detailGetCount = 0
    let listGetCount = 0
    const cancelledDetail = detail({
      status: "cancelled",
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      finishedAt: "2026-04-01T10:10:00.000Z",
    })
    server.use(
      http.get(detailApiUrl, () => {
        detailGetCount += 1
        return HttpResponse.json(
          detailGetCount === 1 ? detail() : cancelledDetail,
        )
      }),
      http.get(listApiUrl, () => {
        listGetCount += 1
        return listGetCount === 1
          ? HttpResponse.json([summary()])
          : HttpResponse.json({ error: "Unavailable." }, { status: 503 })
      }),
      http.post(`${detailApiUrl}/cancel`, () =>
        HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        ),
      ),
    )

    renderDetail(true)
    await screen.findByRole("heading", { name: "Customer stories" })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Cancel Scrape Run" }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel Scrape Run",
      }),
    )

    expect(
      await screen.findByText("Couldn’t refresh scrape run"),
    ).toBeInTheDocument()
    expect(getRunHeader().getByLabelText("Status: Cancelled")).toBeInTheDocument()
    expect(screen.getByLabelText("Run-list cached status")).toHaveTextContent(
      "cancelled",
    )
    expect(detailGetCount).toBe(2)
    expect(listGetCount).toBe(2)
  })

  it("reconciles a 503 into an observed Cancellation Request and offers retry", async () => {
    let detailGetCount = 0
    let listGetCount = 0
    let postCount = 0
    const cancellingDetail = detail({
      status: "in_progress",
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
    })
    const cancellingSummary = summary({
      status: "in_progress",
      cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
    })
    server.use(
      http.get(detailApiUrl, () => {
        detailGetCount += 1
        return HttpResponse.json(
          detailGetCount === 1 ? detail() : cancellingDetail,
        )
      }),
      http.get(listApiUrl, () => {
        listGetCount += 1
        return HttpResponse.json([
          listGetCount === 1 ? summary() : cancellingSummary,
        ])
      }),
      http.post(`${detailApiUrl}/cancel`, () => {
        postCount += 1
        return HttpResponse.json(
          { error: "Workflow cancellation did not finish." },
          { status: 503 },
        )
      }),
    )

    renderDetail(true)
    await screen.findByRole("heading", { name: "Customer stories" })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Cancel Scrape Run" }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel Scrape Run",
      }),
    )

    expect(
      await screen.findByText("Cancellation hasn’t finished"),
    ).toBeInTheDocument()
    expect(getRunHeader().getByLabelText("Status: Cancelling")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Retry cancellation" }),
    ).toBeInTheDocument()
    expect(screen.getByText(/earlier cancellation request/)).toBeInTheDocument()
    expect(screen.getByLabelText("Run-list cached status")).toHaveTextContent(
      "in_progress",
    )
    expect(detailGetCount).toBe(2)
    expect(listGetCount).toBe(2)
    expect(postCount).toBe(1)
  })

  it("reconciles a 409 completion race from detail and list GET state", async () => {
    let detailGetCount = 0
    let listGetCount = 0
    const completedDetail = detail({
      status: "complete",
      finishedAt: "2026-04-01T10:10:00.000Z",
      jobCounts: {
        total: 5,
        pending: 0,
        inProgress: 0,
        complete: 4,
        failed: 1,
        cancelled: 0,
      },
    })
    const completedSummary = summary({
      status: "complete",
      finishedAt: "2026-04-01T10:10:00.000Z",
      jobCounts: completedDetail.jobCounts,
    })
    server.use(
      http.get(detailApiUrl, () => {
        detailGetCount += 1
        return HttpResponse.json(
          detailGetCount === 1 ? detail() : completedDetail,
        )
      }),
      http.get(listApiUrl, () => {
        listGetCount += 1
        return HttpResponse.json([
          listGetCount === 1 ? summary() : completedSummary,
        ])
      }),
      http.post(`${detailApiUrl}/cancel`, () =>
        HttpResponse.json(
          { error: "The Run already finished." },
          { status: 409 },
        ),
      ),
    )

    renderDetail(true)
    await screen.findByRole("heading", { name: "Customer stories" })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Cancel Scrape Run" }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel Scrape Run",
      }),
    )

    expect(
      await screen.findByText("Scrape Run finished before cancellation"),
    ).toBeInTheDocument()
    expect(getRunHeader().getByLabelText("Status: Complete")).toBeInTheDocument()
    expect(screen.getByLabelText("Run-list cached status")).toHaveTextContent(
      "complete",
    )
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(detailGetCount).toBe(2)
    expect(listGetCount).toBe(2)
  })

  it("transitions to not found when a POST 404 is confirmed by detail revalidation", async () => {
    let detailGetCount = 0
    server.use(
      http.get(detailApiUrl, () => {
        detailGetCount += 1
        return detailGetCount === 1
          ? HttpResponse.json(detail())
          : HttpResponse.json({ error: "Not found." }, { status: 404 })
      }),
      http.post(`${detailApiUrl}/cancel`, () =>
        HttpResponse.json({ error: "Not found." }, { status: 404 }),
      ),
    )

    renderDetail()
    await screen.findByRole("heading", { name: "Customer stories" })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole("button", { name: "Cancel Scrape Run" }),
    )
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel Scrape Run",
      }),
    )

    expect(
      await screen.findByRole("heading", { name: "Scrape Run not found" }),
    ).toBeInTheDocument()
    expect(detailGetCount).toBe(2)
  })

  it.each([
    ["network failure", () => HttpResponse.error()],
    [
      "malformed 202",
      () => HttpResponse.json({ id: 17, status: "pending" }, { status: 202 }),
    ],
  ])(
    "preserves cached detail, reconciles, and never retries after a %s",
    async (_label, cancellationResponse) => {
      let detailGetCount = 0
      let listGetCount = 0
      let postCount = 0
      server.use(
        http.get(detailApiUrl, () => {
          detailGetCount += 1
          return HttpResponse.json(detail())
        }),
        http.get(listApiUrl, () => {
          listGetCount += 1
          return HttpResponse.json([summary()])
        }),
        http.post(`${detailApiUrl}/cancel`, () => {
          postCount += 1
          return cancellationResponse()
        }),
      )

      renderDetail(true)
      await screen.findByRole("heading", { name: "Customer stories" })

      const user = userEvent.setup()
      await user.click(
        screen.getByRole("button", { name: "Cancel Scrape Run" }),
      )
      await user.click(
        within(screen.getByRole("alertdialog")).getByRole("button", {
          name: "Cancel Scrape Run",
        }),
      )

      expect(
        await screen.findByText("Couldn’t confirm cancellation"),
      ).toBeInTheDocument()
      expect(getRunHeader().getByLabelText("Status: Pending")).toBeInTheDocument()
      expect(
        screen.getByRole("button", { name: "Cancel Scrape Run" }),
      ).toBeInTheDocument()
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
      expect(postCount).toBe(1)
      expect(detailGetCount).toBe(2)
      expect(listGetCount).toBe(2)
    },
  )

  it("prevents duplicate submission and every dismissal path while the POST is in flight", async () => {
    let postCount = 0
    server.use(
      http.get(detailApiUrl, () => HttpResponse.json(detail())),
      http.post(`${detailApiUrl}/cancel`, async () => {
        postCount += 1
        await new Promise(() => undefined)
        return HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        )
      }),
    )

    renderDetail()

    const user = userEvent.setup()
    await user.click(
      await screen.findByRole("button", { name: "Cancel Scrape Run" }),
    )
    const dialog = screen.getByRole("alertdialog")
    await user.click(
      within(dialog).getByRole("button", { name: "Cancel Scrape Run" }),
    )

    await waitFor(() => {
      expect(
        within(dialog).getByRole("button", { name: "Cancelling…" }),
      ).toBeDisabled()
    })
    expect(
      within(dialog).getByRole("button", { name: "Keep running" }),
    ).toBeDisabled()
    expect(postCount).toBe(1)

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Cancelling…" }),
    )
    await user.keyboard("{Escape}")
    fireEvent.click(
      screen.getByRole("button", { name: "Cancel Scrape Run", hidden: true }),
    )

    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(postCount).toBe(1)
  })
})
