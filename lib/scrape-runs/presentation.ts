import {
  isActiveScrapeRunStatus,
  type ScrapeJobStatus,
  type ScrapeRunStage,
  type ScrapeRunStageStatus,
  type ScrapeRunStatus,
} from "@/lib/scrape-runs/contracts"
import type {
  ScrapeJobDetail,
  ScrapeJobSummary,
  ScrapeRunField,
  ScrapeRunJobCounts,
  ScrapeRunSummary,
} from "@/lib/scrape-runs/api-contracts"

export const SCRAPE_JOB_PAGE_SIZE = 25

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In progress",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
} as const satisfies Record<ScrapeRunStatus, string>

const STAGE_LABELS = {
  mapping: "Mapping",
  filtering: "Filtering",
  scraping: "Scraping",
} as const satisfies Record<ScrapeRunStage, string>

const STAGE_STATUS_LABELS = {
  ...STATUS_LABELS,
  skipped: "Skipped",
} as const satisfies Record<ScrapeRunStageStatus, string>

export type ScrapeJobStatusFilter = "all" | ScrapeJobStatus

export function isActiveScrapeRun(run: ScrapeRunSummary) {
  return isActiveScrapeRunStatus(run.status)
}

export function isCancellingScrapeRun(run: ScrapeRunSummary) {
  return isActiveScrapeRun(run) && run.cancellationRequestedAt !== null
}

export function getScrapeRunStatusLabel(run: ScrapeRunSummary) {
  return isCancellingScrapeRun(run) ? "Cancelling" : STATUS_LABELS[run.status]
}

export function getScrapeRunStageLabel(stage: ScrapeRunStage) {
  return STAGE_LABELS[stage]
}

export function getScrapeRunStageStatusLabel(
  status: ScrapeRunStageStatus,
) {
  return STAGE_STATUS_LABELS[status]
}

export function getScrapeJobStatusLabel(status: ScrapeJobStatus) {
  return STATUS_LABELS[status]
}

export function isActiveScrapeJob(job: ScrapeJobDetail) {
  return job.status === "pending" || job.status === "in_progress"
}

export function getScrapeJobHeading(job: ScrapeJobDetail) {
  if (job.status !== "complete" || job.result === null) {
    return "Scrape Job"
  }

  const primaryIdentifier = job.fields.find(
    (field) => field.primaryIdentifier,
  )

  return primaryIdentifier
    ? (job.result[primaryIdentifier.key] ?? "Scrape Job")
    : "Scrape Job"
}

export function getFinishedJobCount(jobCounts: ScrapeRunJobCounts) {
  return jobCounts.complete + jobCounts.failed + jobCounts.cancelled
}

export function getJobProgressPercentage(jobCounts: ScrapeRunJobCounts) {
  if (jobCounts.total === 0) {
    return 0
  }

  return (getFinishedJobCount(jobCounts) / jobCounts.total) * 100
}

export function getScrapeRunJobSummary(run: ScrapeRunSummary) {
  const { jobCounts } = run

  if (isActiveScrapeRun(run)) {
    if (jobCounts.total === 0) {
      return "Preparing matching pages…"
    }

    return `${getFinishedJobCount(jobCounts)} of ${jobCounts.total} jobs finished`
  }

  if (jobCounts.total === 0) {
    return "No scrape jobs created"
  }

  const outcomes = [
    `${jobCounts.complete} succeeded`,
    `${jobCounts.failed} failed`,
  ]

  if (jobCounts.cancelled > 0) {
    outcomes.push(`${jobCounts.cancelled} cancelled`)
  }

  return outcomes.join(" · ")
}

export function getPrimaryIdentifierField(
  fields: readonly ScrapeRunField[],
) {
  return fields.find((field) => field.primaryIdentifier)
}

export function filterScrapeJobsByStatus<T extends ScrapeJobSummary>(
  jobs: readonly T[],
  status: ScrapeJobStatusFilter,
) {
  return status === "all"
    ? [...jobs]
    : jobs.filter((job) => job.status === status)
}

export function getScrapeJobStatusCounts(jobs: readonly ScrapeJobSummary[]) {
  const counts: Record<ScrapeJobStatusFilter, number> = {
    all: jobs.length,
    pending: 0,
    in_progress: 0,
    complete: 0,
    failed: 0,
    cancelled: 0,
  }

  for (const job of jobs) {
    counts[job.status] += 1
  }

  return counts
}

export function clampScrapeJobPage(
  requestedPage: number,
  totalJobs: number,
) {
  const totalPages = Math.max(
    1,
    Math.ceil(totalJobs / SCRAPE_JOB_PAGE_SIZE),
  )
  const integerPage = Number.isFinite(requestedPage)
    ? Math.trunc(requestedPage)
    : 1

  return Math.min(Math.max(integerPage, 1), totalPages)
}

export function paginateScrapeJobs<T extends ScrapeJobSummary>(
  jobs: readonly T[],
  requestedPage: number,
) {
  const page = clampScrapeJobPage(requestedPage, jobs.length)
  const start = (page - 1) * SCRAPE_JOB_PAGE_SIZE

  return jobs.slice(start, start + SCRAPE_JOB_PAGE_SIZE)
}

export function getVisibleScrapeJobRange(
  totalJobs: number,
  requestedPage: number,
) {
  if (totalJobs === 0) {
    return { start: 0, end: 0, total: 0 }
  }

  const page = clampScrapeJobPage(requestedPage, totalJobs)
  const start = (page - 1) * SCRAPE_JOB_PAGE_SIZE + 1

  return {
    start,
    end: Math.min(start + SCRAPE_JOB_PAGE_SIZE - 1, totalJobs),
    total: totalJobs,
  }
}

export function getTargetSiteHostname(targetUrl: string) {
  return new URL(targetUrl).hostname
}

export function formatScrapeRunTimestamp(
  timestamp: string,
  locales?: Intl.LocalesArgument,
) {
  return new Intl.DateTimeFormat(locales, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}

export function formatScrapeRunCreatedAt(
  createdAt: string,
  locales?: Intl.LocalesArgument,
) {
  return formatScrapeRunTimestamp(createdAt, locales)
}
