import { describe, expect, it } from "vitest"

import {
  clampScrapeJobPage,
  filterScrapeJobsByStatus,
  formatScrapeRunCreatedAt,
  formatScrapeRunTimestamp,
  getFinishedJobCount,
  getJobProgressPercentage,
  getPrimaryIdentifierField,
  getScrapeJobStatusCounts,
  getScrapeJobStatusLabel,
  getScrapeRunJobSummary,
  getScrapeRunStageLabel,
  getScrapeRunStageStatusLabel,
  getScrapeRunStatusLabel,
  getTargetSiteHostname,
  getVisibleScrapeJobRange,
  isActiveScrapeRun,
  isCancellingScrapeRun,
  paginateScrapeJobs,
  SCRAPE_JOB_PAGE_SIZE,
} from "@/lib/scrape-runs/presentation"
import type {
  ScrapeRunJobCounts,
  ScrapeRunSummary,
} from "@/lib/scrape-runs/api-contracts"
import { validScrapeRunDetail } from "@/tests/frontend/scrape-run-fixtures"

const zeroCounts: ScrapeRunJobCounts = {
  total: 0,
  pending: 0,
  inProgress: 0,
  complete: 0,
  failed: 0,
  cancelled: 0,
}

function summary(
  replacement: Partial<ScrapeRunSummary> = {},
): ScrapeRunSummary {
  return {
    id: 17,
    name: "Customer stories",
    targetUrl: "https://customers.example.com/",
    status: "pending",
    cancellationRequestedAt: null,
    jobCounts: zeroCounts,
    createdAt: "2026-04-01T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    ...replacement,
  }
}

describe("Scrape Run status presentation", () => {
  it.each(["pending", "in_progress"] as const)(
    "classifies %s as active",
    (status) => {
      expect(isActiveScrapeRun(summary({ status }))).toBe(true)
    },
  )

  it.each(["complete", "failed", "cancelled"] as const)(
    "classifies %s as terminal",
    (status) => {
      expect(isActiveScrapeRun(summary({ status }))).toBe(false)
    },
  )

  it("derives Cancelling only for an active run with a Cancellation Request", () => {
    const cancellationRequestedAt = "2026-04-01T10:05:00.000Z"

    expect(
      isCancellingScrapeRun(
        summary({ status: "pending", cancellationRequestedAt }),
      ),
    ).toBe(true)
    expect(
      isCancellingScrapeRun(
        summary({ status: "in_progress", cancellationRequestedAt }),
      ),
    ).toBe(true)
    expect(
      isCancellingScrapeRun(
        summary({ status: "cancelled", cancellationRequestedAt }),
      ),
    ).toBe(false)
    expect(isCancellingScrapeRun(summary())).toBe(false)
  })

  it.each([
    [summary({ status: "pending" }), "Pending"],
    [summary({ status: "in_progress" }), "In progress"],
    [
      summary({
        status: "in_progress",
        cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      }),
      "Cancelling",
    ],
    [summary({ status: "complete" }), "Complete"],
    [summary({ status: "failed" }), "Failed"],
    [summary({ status: "cancelled" }), "Cancelled"],
  ])("produces the agreed status label", (run, expected) => {
    expect(getScrapeRunStatusLabel(run)).toBe(expected)
  })
})

describe("Scrape Job progress presentation", () => {
  it.each([
    [zeroCounts, 0, 0],
    [
      {
        total: 4,
        pending: 1,
        inProgress: 1,
        complete: 1,
        failed: 1,
        cancelled: 0,
      },
      2,
      50,
    ],
    [
      {
        total: 5,
        pending: 0,
        inProgress: 0,
        complete: 2,
        failed: 2,
        cancelled: 1,
      },
      5,
      100,
    ],
  ] satisfies Array<[ScrapeRunJobCounts, number, number]>)(
    "calculates finished count and progress",
    (counts, expectedFinished, expectedPercentage) => {
      expect(getFinishedJobCount(counts)).toBe(expectedFinished)
      expect(getJobProgressPercentage(counts)).toBe(expectedPercentage)
    },
  )

  it.each([
    [summary(), "Preparing matching pages…"],
    [
      summary({
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
      "2 of 4 jobs finished",
    ],
    [
      summary({
        status: "complete",
        jobCounts: {
          total: 4,
          pending: 0,
          inProgress: 0,
          complete: 3,
          failed: 1,
          cancelled: 0,
        },
      }),
      "3 succeeded · 1 failed",
    ],
    [
      summary({
        status: "cancelled",
        jobCounts: {
          total: 5,
          pending: 0,
          inProgress: 0,
          complete: 2,
          failed: 1,
          cancelled: 2,
        },
      }),
      "2 succeeded · 1 failed · 2 cancelled",
    ],
    [summary({ status: "failed" }), "No scrape jobs created"],
  ])("produces the agreed job summary", (run, expected) => {
    expect(getScrapeRunJobSummary(run)).toBe(expected)
  })
})

describe("Run Stage presentation", () => {
  it.each([
    ["mapping", "Mapping"],
    ["filtering", "Filtering"],
    ["scraping", "Scraping"],
  ] as const)("labels the %s stage", (stage, expected) => {
    expect(getScrapeRunStageLabel(stage)).toBe(expected)
  })

  it.each([
    ["pending", "Pending"],
    ["in_progress", "In progress"],
    ["complete", "Complete"],
    ["failed", "Failed"],
    ["cancelled", "Cancelled"],
    ["skipped", "Skipped"],
  ] as const)("labels the %s stage status", (status, expected) => {
    expect(getScrapeRunStageStatusLabel(status)).toBe(expected)
  })

  it.each([
    ["pending", "Pending"],
    ["in_progress", "In progress"],
    ["complete", "Complete"],
    ["failed", "Failed"],
    ["cancelled", "Cancelled"],
  ] as const)("labels the %s job status", (status, expected) => {
    expect(getScrapeJobStatusLabel(status)).toBe(expected)
  })
})

describe("Scrape Job list derivations", () => {
  const jobs = [
    ...validScrapeRunDetail.jobs,
    {
      ...validScrapeRunDetail.jobs[0],
      id: 33,
      status: "pending" as const,
      primaryIdentifier: null,
      finishedAt: null,
    },
  ]

  it("selects the configured Primary Identifier Field Label", () => {
    expect(getPrimaryIdentifierField(validScrapeRunDetail.fields)?.label).toBe(
      "Client Name",
    )
  })

  it("filters exact statuses without changing backend order", () => {
    expect(filterScrapeJobsByStatus(jobs, "all").map(({ id }) => id)).toEqual([
      31, 32, 33,
    ])
    expect(
      filterScrapeJobsByStatus(jobs, "complete").map(({ id }) => id),
    ).toEqual([31])
    expect(
      filterScrapeJobsByStatus(jobs, "in_progress").map(({ id }) => id),
    ).toEqual([])
  })

  it("counts every exact status for filter options", () => {
    expect(getScrapeJobStatusCounts(jobs)).toEqual({
      all: 3,
      pending: 1,
      in_progress: 0,
      complete: 1,
      failed: 1,
      cancelled: 0,
    })
  })

  it("uses fixed 25-row pages and preserves stable order", () => {
    const manyJobs = Array.from({ length: 53 }, (_, index) => ({
      ...validScrapeRunDetail.jobs[0],
      id: index + 1,
    }))

    expect(SCRAPE_JOB_PAGE_SIZE).toBe(25)
    expect(paginateScrapeJobs(manyJobs, 2).map(({ id }) => id)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 26),
    )
    expect(paginateScrapeJobs(manyJobs, 3).map(({ id }) => id)).toEqual([
      51, 52, 53,
    ])
  })

  it.each([
    [5, 0, 1],
    [-2, 53, 1],
    [2, 53, 2],
    [9, 53, 3],
    [3, 26, 2],
  ])(
    "clamps requested page %s for %s jobs to %s",
    (requestedPage, totalJobs, expectedPage) => {
      expect(clampScrapeJobPage(requestedPage, totalJobs)).toBe(expectedPage)
    },
  )

  it.each([
    [0, 1, { start: 0, end: 0, total: 0 }],
    [53, 1, { start: 1, end: 25, total: 53 }],
    [53, 2, { start: 26, end: 50, total: 53 }],
    [53, 8, { start: 51, end: 53, total: 53 }],
  ])(
    "derives the visible range for %s jobs on page %s",
    (totalJobs, page, expectedRange) => {
      expect(getVisibleScrapeJobRange(totalJobs, page)).toEqual(expectedRange)
    },
  )
})

describe("Scrape Run secondary text", () => {
  it("displays only the Target Site hostname", () => {
    expect(getTargetSiteHostname("https://customers.example.com:8443/")).toBe(
      "customers.example.com",
    )
  })

  it("formats Run and job timestamps with stable locale options", () => {
    const localDate = new Date(2026, 3, 1, 10, 5)
    const timestamp = localDate.toISOString()

    expect(formatScrapeRunTimestamp(timestamp, "en-US")).toBe(
      "Apr 1, 2026, 10:05 AM",
    )
    expect(formatScrapeRunCreatedAt(timestamp, "en-US")).toBe(
      "Apr 1, 2026, 10:05 AM",
    )
  })
})
