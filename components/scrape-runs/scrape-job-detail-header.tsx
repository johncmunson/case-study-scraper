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
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"
import {
  formatScrapeRunTimestamp,
  getScrapeJobHeading,
  getScrapeJobStatusLabel,
} from "@/lib/scrape-runs/presentation"
import { cn } from "@/lib/utils"

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

export function ScrapeJobDetailHeader({ job }: { job: ScrapeJobDetail }) {
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

      <h2
        id="scrape-job-heading"
        className="wrap-break-word text-2xl font-semibold tracking-tight"
      >
        {heading}
      </h2>

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Canonical Page URL</h3>
          </CardTitle>
          <CardDescription>
            The normalized source page for this Scrape Job.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="wrap-anywhere select-text text-sm">{job.url}</p>
          <a
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open page
            <ExternalLinkIcon aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div
          role="status"
          aria-label={`Scrape Job status: ${statusLabel}`}
          aria-live="polite"
          aria-atomic="true"
        >
          <Badge
            aria-label={`Status: ${statusLabel}`}
            variant={STATUS_BADGE_VARIANTS[job.status]}
          >
            {job.status === "in_progress" && <Spinner aria-hidden="true" />}
            {statusLabel}
          </Badge>
        </div>

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
      </div>
    </section>
  )
}
