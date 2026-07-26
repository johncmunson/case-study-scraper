import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"
import {
  formatScrapeRunTimestamp,
  getScrapeJobHeading,
  getScrapeJobStatusLabel,
} from "@/lib/scrape-runs/presentation"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

const STATUS_BADGE_VARIANTS = {
  pending: "secondary",
  in_progress: "default",
  complete: "secondary",
  failed: "destructive",
  cancelled: "outline",
} as const satisfies Record<ScrapeJobDetail["status"], BadgeVariant>

function JobTimestamp({
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

export function ScrapeJobDetailHeader({
  action,
  job,
}: {
  action?: ReactNode
  job: ScrapeJobDetail
}) {
  const heading = getScrapeJobHeading(job)
  const statusLabel = getScrapeJobStatusLabel(job.status)

  return (
    <section className="space-y-5" aria-labelledby="scrape-job-heading">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/app/scrape-runs" />}>
              Scrape Runs
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbLink
              className="wrap-break-word"
              render={<Link href={`/app/scrape-runs/${job.scrapeRun.id}`} />}
            >
              {job.scrapeRun.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="wrap-break-word">
              {heading}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex min-w-0 items-start justify-between gap-4">
        <h2
          id="scrape-job-heading"
          className="wrap-break-word min-w-0 text-2xl font-semibold tracking-tight"
        >
          {heading}
        </h2>

        <div className="flex shrink-0 items-center gap-2">
          {action}
          <div
            role="status"
            aria-label={`Scrape Job status: ${statusLabel}`}
            aria-live="polite"
            aria-atomic="true"
          >
            <Badge
              aria-label={`Status: ${statusLabel}`}
              className="h-7 gap-1.5 px-3 text-sm [&>svg]:size-3.5!"
              variant={STATUS_BADGE_VARIANTS[job.status]}
            >
              {job.status === "in_progress" && <Spinner aria-hidden="true" />}
              {statusLabel}
            </Badge>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Page URL</h3>
            <a
              className="inline-flex max-w-full items-center gap-1 wrap-anywhere select-text text-sm text-muted-foreground underline underline-offset-4 hover:text-primary hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{job.url}</span>
              <ExternalLinkIcon
                aria-hidden="true"
                className="size-3.5 shrink-0"
              />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm text-muted-foreground sm:grid-cols-[repeat(2,max-content_minmax(0,1fr))] sm:gap-x-4">
            <dt className="font-medium text-foreground">Attempts</dt>
            <dd>{job.attemptCount}</dd>
            <JobTimestamp label="Created" timestamp={job.createdAt} />
            {job.startedAt && (
              <JobTimestamp label="Started" timestamp={job.startedAt} />
            )}
            {job.finishedAt && (
              <JobTimestamp label="Finished" timestamp={job.finishedAt} />
            )}
          </dl>
        </CardContent>
      </Card>
    </section>
  )
}
