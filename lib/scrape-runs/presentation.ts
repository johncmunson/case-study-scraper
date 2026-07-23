import {
  isActiveScrapeRunStatus,
  type ScrapeRunStatus,
} from "@/lib/scrape-runs/contracts"
import type {
  ScrapeRunJobCounts,
  ScrapeRunSummary,
} from "@/lib/scrape-runs/api-contracts"

const STATUS_LABELS = {
  pending: "Pending",
  in_progress: "In progress",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
} as const satisfies Record<ScrapeRunStatus, string>

export function isActiveScrapeRun(run: ScrapeRunSummary) {
  return isActiveScrapeRunStatus(run.status)
}

export function isCancellingScrapeRun(run: ScrapeRunSummary) {
  return isActiveScrapeRun(run) && run.cancellationRequestedAt !== null
}

export function getScrapeRunStatusLabel(run: ScrapeRunSummary) {
  return isCancellingScrapeRun(run) ? "Cancelling" : STATUS_LABELS[run.status]
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

export function getTargetSiteHostname(targetUrl: string) {
  return new URL(targetUrl).hostname
}

export function formatScrapeRunCreatedAt(
  createdAt: string,
  locales?: Intl.LocalesArgument,
) {
  return new Intl.DateTimeFormat(locales, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt))
}
