import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Spinner } from "@/components/ui/spinner"
import type { ScrapeRunDetail } from "@/lib/scrape-runs/api-contracts"
import {
  formatScrapeRunTimestamp,
  getScrapeRunStatusLabel,
  getTargetSiteHostname,
  isActiveScrapeRun,
  isCancellingScrapeRun,
} from "@/lib/scrape-runs/presentation"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

const STATUS_BADGE_VARIANTS = {
  pending: "secondary",
  in_progress: "default",
  complete: "secondary",
  failed: "destructive",
  cancelled: "outline",
} as const satisfies Record<ScrapeRunDetail["status"], BadgeVariant>

function getStatusBadgeVariant(run: ScrapeRunDetail): BadgeVariant {
  return isCancellingScrapeRun(run)
    ? "outline"
    : STATUS_BADGE_VARIANTS[run.status]
}

function RunTimestamp({
  label,
  timestamp,
}: {
  label: string
  timestamp: string
}) {
  const formattedTimestamp = formatScrapeRunTimestamp(timestamp)

  return (
    <>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd>
        <time
          aria-label={`${label} ${formattedTimestamp}`}
          dateTime={timestamp}
          suppressHydrationWarning
        >
          {formattedTimestamp}
        </time>
      </dd>
    </>
  )
}

export function ScrapeRunDetailHeader({ run }: { run: ScrapeRunDetail }) {
  const hostname = getTargetSiteHostname(run.targetUrl)
  const statusLabel = getScrapeRunStatusLabel(run)
  const showSpinner =
    run.status === "in_progress" || isCancellingScrapeRun(run)

  return (
    <section className="space-y-5" aria-labelledby="scrape-run-name">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/app/scrape-runs" />}>
              Scrape Runs
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate">{run.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h2
            id="scrape-run-name"
            className="wrap-break-word text-2xl font-semibold tracking-tight"
          >
            {run.name}
          </h2>
          <a
            className="inline-flex max-w-full items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            href={run.targetUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="truncate">{hostname}</span>
            <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>

        <Badge
          aria-label={`Status: ${statusLabel}`}
          variant={getStatusBadgeVariant(run)}
        >
          {showSpinner && <Spinner aria-hidden="true" />}
          {statusLabel}
        </Badge>
      </div>

      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm text-muted-foreground sm:grid-cols-[repeat(2,max-content_minmax(0,1fr))] sm:gap-x-4">
        <RunTimestamp label="Created" timestamp={run.createdAt} />
        {run.startedAt && (
          <RunTimestamp label="Started" timestamp={run.startedAt} />
        )}
        {!isActiveScrapeRun(run) && run.finishedAt && (
          <RunTimestamp label="Finished" timestamp={run.finishedAt} />
        )}
        {run.cancellationRequestedAt && (
          <RunTimestamp
            label="Cancellation requested"
            timestamp={run.cancellationRequestedAt}
          />
        )}
      </dl>
    </section>
  )
}
