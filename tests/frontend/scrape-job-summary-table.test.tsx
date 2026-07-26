import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"

import type {
  ScrapeJobSummary,
  ScrapeRunDetail,
} from "@/lib/scrape-runs/api-contracts"
import { validScrapeRunDetail } from "@/tests/frontend/scrape-run-fixtures"

vi.mock("next/link", () => ({
  default: ({
    prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a data-prefetch={String(prefetch)} {...props} />
  ),
}))

import { ScrapeJobSummaryTable } from "@/components/scrape-runs/scrape-job-summary-table"

function job(
  id: number,
  replacement: Partial<ScrapeJobSummary> = {},
): ScrapeJobSummary {
  return {
    id,
    url: `https://www.example.com/customers/customer-${id}`,
    status: "complete",
    primaryIdentifier: `Customer ${id}`,
    failureCode: null,
    attemptCount: 1,
    createdAt: "2026-04-01T10:02:00.000Z",
    updatedAt: "2026-04-01T10:03:00.000Z",
    startedAt: "2026-04-01T10:02:10.000Z",
    finishedAt: "2026-04-01T10:03:00.000Z",
    ...replacement,
  }
}

function run(
  jobs: ScrapeJobSummary[],
  replacement: Partial<ScrapeRunDetail> = {},
): ScrapeRunDetail {
  return {
    ...validScrapeRunDetail,
    ...replacement,
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

async function selectStatus(name: RegExp) {
  await userEvent.click(
    screen.getByRole("combobox", { name: "Filter by status" }),
  )
  await userEvent.click(await screen.findByRole("option", { name }))
}

describe("Scrape Job summary table", () => {
  it("shows per-row deletion actions only for terminal Runs", () => {
    const terminalRun = run([job(41)], {
      status: "complete",
      finishedAt: "2026-04-01T10:10:00.000Z",
    })
    const { rerender } = render(<ScrapeJobSummaryTable run={terminalRun} />)

    const actionsHeader = screen.getByRole("columnheader", { name: "Actions" })
    expect(actionsHeader).toBeInTheDocument()
    expect(within(actionsHeader).getByText("Actions")).toHaveClass("sr-only")
    expect(
      screen.getByRole("button", {
        name: "Actions for https://www.example.com/customers/customer-41",
      }),
    ).toBeInTheDocument()

    rerender(<ScrapeJobSummaryTable run={run([job(41)])} />)
    expect(
      screen.queryByRole("columnheader", { name: "Actions" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Actions for/ }),
    ).not.toBeInTheDocument()
  })

  it("uses the Primary Identifier Field Label and presents lightweight job details", () => {
    const jobs = [
      job(41),
      job(42, {
        status: "failed",
        primaryIdentifier: "Must not be shown",
        failureCode: "missing_required_fields",
        attemptCount: 2,
      }),
      job(43, {
        status: "in_progress",
        primaryIdentifier: "Must not be shown",
        finishedAt: null,
      }),
    ]

    render(<ScrapeJobSummaryTable run={run(jobs)} />)

    const table = screen.getByRole("table", { name: "Scrape Jobs" })
    expect(
      within(table).getByRole("columnheader", { name: "Client Name" }),
    ).toBeInTheDocument()
    expect(within(table).queryByText("Result")).not.toBeInTheDocument()
    expect(
      within(table).getByRole("link", { name: "Customer 41" }),
    ).toHaveAttribute("href", "/app/scrape-runs/17/scrape-jobs/41")
    expect(
      within(table).getByRole("link", { name: "Customer 41" }),
    ).toHaveAttribute("data-prefetch", "false")
    expect(
      within(table).queryByText("Must not be shown"),
    ).not.toBeInTheDocument()
    expect(
      within(table).queryByText("missing_required_fields"),
    ).not.toBeInTheDocument()
    expect(
      within(table).queryByRole("columnheader", { name: "Attempts" }),
    ).not.toBeInTheDocument()
    expect(
      within(table).queryByRole("columnheader", { name: "Finished" }),
    ).not.toBeInTheDocument()

    const failedRow = within(table).getAllByRole("row")[2]
    expect(
      within(failedRow).getByRole("link", {
        name: "Client Name: Not available",
      }),
    ).toHaveAttribute("href", "/app/scrape-runs/17/scrape-jobs/42")
    expect(
      within(failedRow).getByRole("link", {
        name: "Client Name: Not available",
      }),
    ).toHaveTextContent("—")

    const urlLinks = within(table).getAllByRole("link", {
      name: "https://www.example.com/customers/customer-41",
    })
    expect(urlLinks[0]).toHaveAttribute(
      "href",
      "/app/scrape-runs/17/scrape-jobs/41",
    )
    expect(urlLinks[0]).toHaveTextContent(/^\/customers\/customer-41$/)
    expect(urlLinks[0]).toHaveAttribute("data-prefetch", "false")
    expect(urlLinks[0]).toHaveClass("md:hidden")
    expect(
      within(table).getByRole("columnheader", { name: "Page URL" }),
    ).toHaveClass("hidden", "md:table-cell")
    expect(
      within(table).getByRole("columnheader", { name: "Status" }),
    ).not.toHaveClass("hidden")
  })

  it("keeps long labels, identifiers, and URLs accessible on narrow layouts", async () => {
    const longLabel = "Customer organization and international division "
      .repeat(4)
      .trim()
    const longIdentifier = "AcmeInternationalCustomerIdentifier".repeat(8)
    const longUrl = `https://www.example.com/customers/${"long-path-segment".repeat(12)}`
    const jobs = [
      job(41, { primaryIdentifier: longIdentifier, url: longUrl }),
      job(42, {
        status: "failed",
        primaryIdentifier: null,
        failureCode: "missing_required_fields",
      }),
    ]

    render(
      <div style={{ width: 280 }}>
        <ScrapeJobSummaryTable
          run={run(jobs, {
            fields: validScrapeRunDetail.fields.map((field) =>
              field.primaryIdentifier ? { ...field, label: longLabel } : field,
            ),
          })}
        />
      </div>,
    )

    expect(screen.getByRole("columnheader", { name: longLabel })).toHaveClass(
      "wrap-anywhere",
    )
    const identifierLink = screen.getByRole("link", { name: longIdentifier })
    identifierLink.focus()
    expect(identifierLink).toHaveFocus()
    expect(identifierLink).toHaveClass("truncate", "focus-visible:ring-2")

    const urlLink = screen.getAllByRole("link", { name: longUrl })[0]
    urlLink.focus()
    expect(urlLink).toHaveFocus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(longUrl)
    expect(
      screen.queryByText("missing_required_fields"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: `${longLabel}: Not available` }),
    ).toHaveAttribute("href", "/app/scrape-runs/17/scrape-jobs/42")
  })

  it("shows exact status counts and filters without changing API order", async () => {
    const jobs = [
      job(1, { status: "pending", primaryIdentifier: null, finishedAt: null }),
      job(2, { status: "failed", primaryIdentifier: null }),
      job(3),
      job(4, { status: "failed", primaryIdentifier: null }),
    ]
    render(<ScrapeJobSummaryTable run={run(jobs)} />)

    await userEvent.click(
      screen.getByRole("combobox", { name: "Filter by status" }),
    )
    expect(screen.getByRole("option", { name: "All (4)" })).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Pending (1)" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "In progress (0)" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Complete (1)" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Failed (2)" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: "Cancelled (0)" }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("option", { name: "Failed (2)" }))

    const rows = within(
      screen.getByRole("table", { name: "Scrape Jobs" }),
    ).getAllByRole("row")
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getAllByText(/customer-2/)).toHaveLength(2)
    expect(within(rows[2]).getAllByText(/customer-4/)).toHaveLength(2)
    expect(screen.getByText("1–2 of 2 jobs")).toBeInTheDocument()
  })

  it("paginates 25 rows, resets on filter changes, and clamps after polling shrinks the list", async () => {
    const completeJobs = Array.from({ length: 31 }, (_, index) =>
      job(index + 1),
    )
    const { rerender } = render(
      <ScrapeJobSummaryTable run={run(completeJobs)} />,
    )

    expect(screen.getByRole("link", { name: "Customer 1" })).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: "Customer 25" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: "Customer 26" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("1–25 of 31 jobs")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: "Next page" }))
    expect(
      screen.getByRole("link", { name: "Customer 26" }),
    ).toBeInTheDocument()
    expect(screen.getByText("26–31 of 31 jobs")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled()

    const previousPage = screen.getByRole("button", { name: "Previous page" })
    previousPage.focus()
    await userEvent.keyboard("{Enter}")
    expect(screen.getByText("1–25 of 31 jobs")).toBeInTheDocument()

    await selectStatus(/^Complete \(31\)$/)
    expect(screen.getByRole("link", { name: "Customer 1" })).toBeInTheDocument()
    expect(screen.getByText("1–25 of 31 jobs")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Next page" }))
    rerender(<ScrapeJobSummaryTable run={run(completeJobs.slice(0, 5))} />)

    expect(screen.getByRole("link", { name: "Customer 1" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Customer 5" })).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Next page" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("1–5 of 5 jobs")).toBeInTheDocument()
  })

  it("operates status filtering and the Show all action from the keyboard", async () => {
    render(<ScrapeJobSummaryTable run={run([job(1), job(2)])} />)

    const statusFilter = screen.getByRole("combobox", {
      name: "Filter by status",
    })
    statusFilter.focus()
    await userEvent.keyboard("{Enter}f{Enter}")

    expect(
      screen.getByText("No jobs have the Failed status."),
    ).toBeInTheDocument()
    const showAll = screen.getByRole("button", { name: "Show all jobs" })
    showAll.focus()
    await userEvent.keyboard("{Enter}")

    expect(screen.getByRole("link", { name: "Customer 1" })).toBeInTheDocument()
    expect(statusFilter).toHaveTextContent("All (2)")
  })

  it("offers Show all jobs when the selected status has no matches", async () => {
    render(<ScrapeJobSummaryTable run={run([job(1), job(2)])} />)

    await selectStatus(/^Failed \(0\)$/)

    expect(
      screen.getByText("No jobs have the Failed status."),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Show all jobs" }))
    expect(screen.getByRole("link", { name: "Customer 1" })).toBeInTheDocument()
  })

  it.each([
    ["pending", "Run Preparation is establishing matching pages."],
    ["complete", "No scrape jobs created"],
  ] as const)(
    "shows the zero-job empty state for a %s Run",
    (status, message) => {
      render(
        <ScrapeJobSummaryTable
          run={run([], {
            status,
            finishedAt:
              status === "complete" ? "2026-04-01T10:10:00.000Z" : null,
          })}
        />,
      )

      expect(screen.getByText(message)).toBeInTheDocument()
      expect(screen.queryByRole("table")).not.toBeInTheDocument()
    },
  )
})
