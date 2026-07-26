import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import useSWR from "swr"
import { describe, expect, it, vi } from "vitest"

import { ScrapeJobSummaryTable } from "@/components/scrape-runs/scrape-job-summary-table"
import {
  getScrapeRunDetailApiPath,
  SCRAPE_RUNS_API_PATH,
  type ScrapeJobSummary,
  type ScrapeRunDetail,
  type ScrapeRunSummaryList,
} from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunDetail } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock("next/link", () => ({
  default: ({ prefetch: _prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

function job(id: number, status: ScrapeJobSummary["status"] = "complete") {
  return {
    id,
    url: `https://www.example.com/customers/customer-${id}`,
    status,
    primaryIdentifier: status === "complete" ? `Customer ${id}` : null,
    failureCode: status === "failed" ? "scrape_failed" as const : null,
    attemptCount: 1,
    createdAt: "2026-04-01T10:02:00.000Z",
    updatedAt: "2026-04-01T10:03:00.000Z",
    startedAt: "2026-04-01T10:02:10.000Z",
    finishedAt: "2026-04-01T10:03:00.000Z",
  } satisfies ScrapeJobSummary
}

function run(jobs: ScrapeJobSummary[]): ScrapeRunDetail {
  return {
    ...validScrapeRunDetail,
    status: "complete",
    finishedAt: "2026-04-01T10:10:00.000Z",
    jobs,
    jobCounts: {
      total: jobs.length,
      pending: jobs.filter(({ status }) => status === "pending").length,
      inProgress: jobs.filter(({ status }) => status === "in_progress").length,
      complete: jobs.filter(({ status }) => status === "complete").length,
      failed: jobs.filter(({ status }) => status === "failed").length,
      cancelled: jobs.filter(({ status }) => status === "cancelled").length,
    },
  }
}

function CachedTable({ initialRun }: { initialRun: ScrapeRunDetail }) {
  const { data } = useSWR<ScrapeRunDetail>(
    getScrapeRunDetailApiPath(initialRun.id),
    null,
    { fallbackData: initialRun },
  )
  const { data: summaries } = useSWR<ScrapeRunSummaryList>(
    SCRAPE_RUNS_API_PATH,
    null,
  )
  const summary = summaries?.find(({ id }) => id === initialRun.id)

  return data ? (
    <>
      {summary && (
        <output aria-label="Cached Run summary">
          {summary.status}:{summary.jobCounts.total}:
          {summary.jobCounts.complete}:{summary.jobCounts.failed}
        </output>
      )}
      <ScrapeJobSummaryTable run={data} />
    </>
  ) : null
}

function renderTable(initialRun: ScrapeRunDetail) {
  const cache = new Map([
    [SCRAPE_RUNS_API_PATH, { data: [initialRun] }],
  ])
  return renderWithSwr(<CachedTable initialRun={initialRun} />, undefined, {
    provider: () => cache,
  })
}

async function openDeletion(url: string) {
  await userEvent.click(screen.getByRole("button", { name: `Actions for ${url}` }))
  await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }))
  return screen.findByRole("alertdialog")
}

describe("Scrape Job deletion dialog", () => {
  it("prevents dismissal and duplicate submission while pending, then reaches the zero-job state", async () => {
    const initialRun = run([job(41, "failed")])
    const updatedRun = run([])
    let finishDelete: (() => void) | undefined
    let deletionCount = 0
    server.use(
      http.delete("http://localhost/api/scrape-runs/17/scrape-jobs/41", async () => {
        deletionCount += 1
        await new Promise<void>((resolve) => {
          finishDelete = resolve
        })
        return new HttpResponse(null, { status: 204 })
      }),
      http.get("http://localhost/api/scrape-runs/17", () => HttpResponse.json(updatedRun)),
      http.get("http://localhost/api/scrape-runs", () => HttpResponse.json([updatedRun])),
    )
    renderTable(initialRun)

    const dialog = await openDeletion(initialRun.jobs[0].url)
    expect(dialog).toHaveTextContent(
      "The Scrape Job for “https://www.example.com/customers/customer-41”, including its lifecycle record, diagnostics, and Extraction Result, will be permanently removed. This action cannot be undone.",
    )
    const confirm = within(dialog).getByRole("button", { name: "Delete Scrape Job" })
    await userEvent.click(confirm)
    await waitFor(() => expect(deletionCount).toBe(1))
    expect(confirm).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Keep Scrape Job" })).toBeDisabled()
    await userEvent.keyboard("{Escape}")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()

    finishDelete?.()
    expect(await screen.findByText("No scrape jobs created")).toBeInTheDocument()
    expect(screen.queryByRole("table", { name: "Scrape Jobs" })).not.toBeInTheDocument()
    expect(deletionCount).toBe(1)
    await waitFor(() =>
      expect(screen.getByLabelText("Cached Run summary")).toHaveTextContent(
        "complete:0:0:0",
      ),
    )
    expect(toastSuccessMock).toHaveBeenCalled()
  })

  it("removes the last page row, updates counts, and clamps pagination", async () => {
    const jobs = Array.from({ length: 26 }, (_, index) => job(index + 1))
    const initialRun = run(jobs)
    const updatedRun = run(jobs.slice(0, 25))
    server.use(
      http.delete("http://localhost/api/scrape-runs/17/scrape-jobs/26", () => new HttpResponse(null, { status: 204 })),
      http.get("http://localhost/api/scrape-runs/17", () => HttpResponse.json(updatedRun)),
      http.get("http://localhost/api/scrape-runs", () => HttpResponse.json([updatedRun])),
    )
    renderTable(initialRun)

    await userEvent.click(screen.getByRole("button", { name: "Next page" }))
    const dialog = await openDeletion(jobs[25].url)
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete Scrape Job" }))

    expect(await screen.findByText("1–25 of 25 jobs")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Customer 26" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText("Cached Run summary")).toHaveTextContent(
        "complete:25:25:0",
      ),
    )
    await userEvent.click(screen.getByRole("combobox", { name: "Filter by status" }))
    expect(screen.getByRole("option", { name: "All (25)" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Complete (25)" })).toBeInTheDocument()
  })

  it("retains the row and revalidates after deletion fails", async () => {
    const initialRun = run([job(41)])
    let parentReads = 0
    server.use(
      http.delete("http://localhost/api/scrape-runs/17/scrape-jobs/41", () => HttpResponse.json({ error: "Unable to delete this Job." }, { status: 503 })),
      http.get("http://localhost/api/scrape-runs/17", () => {
        parentReads += 1
        return HttpResponse.json(initialRun)
      }),
      http.get("http://localhost/api/scrape-runs", () => HttpResponse.json([initialRun])),
    )
    renderTable(initialRun)

    const dialog = await openDeletion(initialRun.jobs[0].url)
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete Scrape Job" }))

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(
      "Error: Unable to delete this Job.",
      { position: "bottom-center" },
    ))
    expect(screen.getByRole("link", { name: "Customer 41" })).toBeInTheDocument()
    await waitFor(() => expect(parentReads).toBeGreaterThan(0))
  })
})
