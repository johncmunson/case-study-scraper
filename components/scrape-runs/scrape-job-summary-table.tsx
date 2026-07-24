"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { DownloadExtractionDataset } from "@/components/scrape-runs/download-extraction-dataset"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { isTerminalScrapeJobStatus } from "@/lib/scrape-runs/contracts"
import {
  getScrapeJobDetailPath,
  type ScrapeJobSummary,
  type ScrapeRunDetail,
} from "@/lib/scrape-runs/api-contracts"
import {
  SCRAPE_JOB_PAGE_SIZE,
  clampScrapeJobPage,
  filterScrapeJobsByStatus,
  formatScrapeRunTimestamp,
  getPrimaryIdentifierField,
  getScrapeJobStatusCounts,
  getScrapeJobStatusLabel,
  getVisibleScrapeJobRange,
  isActiveScrapeRun,
  paginateScrapeJobs,
  type ScrapeJobStatusFilter,
} from "@/lib/scrape-runs/presentation"

const STATUS_FILTERS = [
  "all",
  "pending",
  "in_progress",
  "complete",
  "failed",
  "cancelled",
] as const satisfies readonly ScrapeJobStatusFilter[]

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

const JOB_STATUS_BADGE_VARIANTS = {
  pending: "secondary",
  in_progress: "default",
  complete: "secondary",
  failed: "destructive",
  cancelled: "outline",
} as const satisfies Record<ScrapeJobSummary["status"], BadgeVariant>

function getFilterLabel(filter: ScrapeJobStatusFilter) {
  return filter === "all" ? "All" : getScrapeJobStatusLabel(filter)
}

function JobUrlLink({
  className,
  job,
  runId,
}: {
  className?: string
  job: ScrapeJobSummary
  runId: number
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            aria-label={job.url}
            className={className}
            href={getScrapeJobDetailPath(runId, job.id)}
            prefetch={false}
          />
        }
      >
        {job.url}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm break-all">{job.url}</TooltipContent>
    </Tooltip>
  )
}

function JobStatus({ job }: { job: ScrapeJobSummary }) {
  const statusLabel = getScrapeJobStatusLabel(job.status)

  return (
    <div className="space-y-1">
      <Badge
        aria-label={`Status: ${statusLabel}`}
        variant={JOB_STATUS_BADGE_VARIANTS[job.status]}
      >
        {statusLabel}
      </Badge>
      {job.status === "failed" && job.failureCode && (
        <p className="max-w-40 wrap-anywhere font-mono text-xs text-destructive">
          <code>{job.failureCode}</code>
        </p>
      )}
    </div>
  )
}

function FinishedTime({ job }: { job: ScrapeJobSummary }) {
  if (!isTerminalScrapeJobStatus(job.status) || !job.finishedAt) {
    return <>—</>
  }

  const formatted = formatScrapeRunTimestamp(job.finishedAt)

  return (
    <time
      aria-label={`Finished ${formatted}`}
      dateTime={job.finishedAt}
      suppressHydrationWarning
    >
      {formatted}
    </time>
  )
}

function ScrapeJobRow({
  job,
  primaryIdentifierLabel,
  runId,
}: {
  job: ScrapeJobSummary
  primaryIdentifierLabel: string
  runId: number
}) {
  const showPrimaryIdentifier =
    job.status === "complete" && job.primaryIdentifier !== null

  return (
    <TableRow>
      <TableCell className="max-w-48 whitespace-normal sm:max-w-64">
        <div className="min-w-0 space-y-1">
          {showPrimaryIdentifier ? (
            <Link
              className="block truncate font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              href={getScrapeJobDetailPath(runId, job.id)}
              prefetch={false}
            >
              {job.primaryIdentifier}
            </Link>
          ) : (
            <span aria-label={`${primaryIdentifierLabel}: Not available`}>—</span>
          )}
          <JobUrlLink
            className="block max-w-full truncate text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            job={job}
            runId={runId}
          />
        </div>
      </TableCell>
      <TableCell className="hidden max-w-80 md:table-cell">
        <JobUrlLink
          className="block max-w-80 truncate text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          job={job}
          runId={runId}
        />
      </TableCell>
      <TableCell className="whitespace-normal">
        <JobStatus job={job} />
      </TableCell>
      <TableCell data-column="attempts" className="hidden lg:table-cell">
        {job.attemptCount}
      </TableCell>
      <TableCell
        data-column="finished"
        className="hidden text-muted-foreground lg:table-cell"
      >
        <FinishedTime job={job} />
      </TableCell>
    </TableRow>
  )
}

function ZeroJobs({ active }: { active: boolean }) {
  return (
    <Empty className="min-h-40 border">
      <EmptyHeader>
        <EmptyTitle>
          {active ? "Matching pages are being prepared" : "No scrape jobs created"}
        </EmptyTitle>
        {active && (
          <EmptyDescription>
            Run Preparation is establishing matching pages.
          </EmptyDescription>
        )}
      </EmptyHeader>
    </Empty>
  )
}

function NoFilteredJobs({
  filter,
  onShowAll,
}: {
  filter: Exclude<ScrapeJobStatusFilter, "all">
  onShowAll: () => void
}) {
  const statusLabel = getScrapeJobStatusLabel(filter)

  return (
    <Empty className="min-h-40 border">
      <EmptyHeader>
        <EmptyTitle>No matching Scrape Jobs</EmptyTitle>
        <EmptyDescription>
          No jobs have the {statusLabel} status.
        </EmptyDescription>
      </EmptyHeader>
      <Button type="button" variant="outline" size="sm" onClick={onShowAll}>
        Show all jobs
      </Button>
    </Empty>
  )
}

export function ScrapeJobSummaryTable({ run }: { run: ScrapeRunDetail }) {
  const [statusFilter, setStatusFilter] =
    useState<ScrapeJobStatusFilter>("all")
  const [requestedPage, setRequestedPage] = useState(1)
  const primaryIdentifier = getPrimaryIdentifierField(run.fields)
  const primaryIdentifierLabel = primaryIdentifier?.label ?? "Primary Identifier"
  const statusCounts = getScrapeJobStatusCounts(run.jobs)
  // Pagination bounds rendering only; the accepted read contract still validates every job.
  const filteredJobs = filterScrapeJobsByStatus(run.jobs, statusFilter)
  const page = clampScrapeJobPage(requestedPage, filteredJobs.length)
  const visibleJobs = paginateScrapeJobs(filteredJobs, page)
  const range = getVisibleScrapeJobRange(filteredJobs.length, page)
  const totalPages = Math.max(
    1,
    Math.ceil(filteredJobs.length / SCRAPE_JOB_PAGE_SIZE),
  )
  const setFilter = (value: unknown) => {
    if (
      typeof value === "string" &&
      STATUS_FILTERS.includes(value as ScrapeJobStatusFilter)
    ) {
      setStatusFilter(value as ScrapeJobStatusFilter)
      setRequestedPage(1)
    }
  }

  return (
    <section aria-labelledby="scrape-jobs-heading">
      <Card>
        <CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle>
            <h3 id="scrape-jobs-heading">Scrape Jobs</h3>
          </CardTitle>
          <CardDescription>
            Browse extraction attempts for the matching pages in this Scrape Run.
          </CardDescription>
          <CardAction className="col-start-1 row-span-1 row-start-3 justify-self-stretch pt-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end sm:pt-0">
            <DownloadExtractionDataset
              runId={run.id}
              runName={run.name}
              runStatus={run.status}
              successfulResultCount={run.jobCounts.complete}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {run.jobs.length === 0 ? (
            <ZeroJobs active={isActiveScrapeRun(run)} />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`scrape-job-status-${run.id}`}>
                    Filter by status
                  </Label>
                  <Select value={statusFilter} onValueChange={setFilter}>
                    <SelectTrigger
                      id={`scrape-job-status-${run.id}`}
                      aria-label="Filter by status"
                      className="min-w-44"
                    >
                      <SelectValue>
                        {getFilterLabel(statusFilter)} ({statusCounts[statusFilter]})
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start">
                      {STATUS_FILTERS.map((filter) => (
                        <SelectItem key={filter} value={filter}>
                          {getFilterLabel(filter)} ({statusCounts[filter]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {filteredJobs.length > 0 && (
                  <p className="text-sm text-muted-foreground" aria-live="polite">
                    {range.start}–{range.end} of {range.total} jobs
                  </p>
                )}
              </div>

              {filteredJobs.length === 0 && statusFilter !== "all" ? (
                <NoFilteredJobs
                  filter={statusFilter}
                  onShowAll={() => {
                    setStatusFilter("all")
                    setRequestedPage(1)
                  }}
                />
              ) : (
                <>
                  <Table aria-label="Scrape Jobs" className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[48%] wrap-anywhere whitespace-normal md:w-[28%]">
                          {primaryIdentifierLabel}
                        </TableHead>
                        <TableHead className="hidden w-[36%] md:table-cell">
                          Page URL
                        </TableHead>
                        <TableHead className="w-[52%] md:w-[18%]">Status</TableHead>
                        <TableHead
                          data-column="attempts"
                          className="hidden w-[8%] lg:table-cell"
                        >
                          Attempts
                        </TableHead>
                        <TableHead
                          data-column="finished"
                          className="hidden w-[20%] lg:table-cell"
                        >
                          Finished
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleJobs.map((job) => (
                        <ScrapeJobRow
                          key={job.id}
                          job={job}
                          primaryIdentifierLabel={primaryIdentifierLabel}
                          runId={run.id}
                        />
                      ))}
                    </TableBody>
                  </Table>

                  {totalPages > 1 && (
                    <Pagination aria-label="Scrape Job pages">
                      <PaginationContent>
                        <PaginationItem>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={page === 1}
                            aria-label="Previous page"
                            onClick={() => setRequestedPage(page - 1)}
                          >
                            <ChevronLeftIcon aria-hidden="true" />
                            <span className="hidden sm:inline">Previous</span>
                          </Button>
                        </PaginationItem>
                        <PaginationItem>
                          <span className="px-2 text-sm text-muted-foreground">
                            Page {page} of {totalPages}
                          </span>
                        </PaginationItem>
                        <PaginationItem>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={page === totalPages}
                            aria-label="Next page"
                            onClick={() => setRequestedPage(page + 1)}
                          >
                            <span className="hidden sm:inline">Next</span>
                            <ChevronRightIcon aria-hidden="true" />
                          </Button>
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
