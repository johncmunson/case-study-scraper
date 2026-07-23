import { describe, expect, it } from "vitest"

import {
  formatScrapeRunCreatedAt,
  getFinishedJobCount,
  getJobProgressPercentage,
  getScrapeRunJobSummary,
  getScrapeRunStatusLabel,
  getTargetSiteHostname,
  isActiveScrapeRun,
  isCancellingScrapeRun,
} from "@/lib/scrape-runs/presentation"
import type {
  ScrapeRunJobCounts,
  ScrapeRunSummary,
} from "@/lib/scrape-runs/api-contracts"

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

describe("Scrape Run secondary text", () => {
  it("displays only the Target Site hostname", () => {
    expect(getTargetSiteHostname("https://customers.example.com:8443/")).toBe(
      "customers.example.com",
    )
  })

  it("formats creation date and time with stable locale options", () => {
    const localDate = new Date(2026, 3, 1, 10, 5)

    expect(
      formatScrapeRunCreatedAt(localDate.toISOString(), "en-US"),
    ).toBe("Apr 1, 2026, 10:05 AM")
  })
})
