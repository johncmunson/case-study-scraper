import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import type { ScrapeRunSummary } from "@/lib/scrape-runs/api-contracts"
import {
  formatScrapeRunCreatedAt,
  getJobProgressPercentage,
  getScrapeRunJobSummary,
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
} as const satisfies Record<ScrapeRunSummary["status"], BadgeVariant>

function getStatusBadgeVariant(run: ScrapeRunSummary): BadgeVariant {
  return isCancellingScrapeRun(run)
    ? "outline"
    : STATUS_BADGE_VARIANTS[run.status]
}

export function ScrapeRunListItem({ run }: { run: ScrapeRunSummary }) {
  const hostname = getTargetSiteHostname(run.targetUrl)
  const statusLabel = getScrapeRunStatusLabel(run)
  const formattedCreatedAt = formatScrapeRunCreatedAt(run.createdAt)
  const hasActiveJobProgress =
    isActiveScrapeRun(run) && run.jobCounts.total > 0
  const showSpinner =
    run.status === "in_progress" || isCancellingScrapeRun(run)

  return (
    <div role="listitem" className="min-w-0 overflow-hidden rounded-lg">
      <Item
        render={<Link href={`/app/scrape-runs/${run.id}`} />}
        variant="outline"
        className="min-w-0 items-start gap-4 overflow-hidden p-4 sm:flex-nowrap"
      >
        <ItemContent className="min-w-0 gap-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <ItemTitle className="block w-full min-w-0 text-base">
                <h2 className="truncate" title={run.name}>
                  {run.name}
                </h2>
              </ItemTitle>
              <ItemDescription className="truncate" title={hostname}>
                {hostname}
              </ItemDescription>
            </div>

            <Badge
              aria-label={`Status: ${statusLabel}`}
              variant={getStatusBadgeVariant(run)}
            >
              {showSpinner && <Spinner aria-hidden="true" />}
              {statusLabel}
            </Badge>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p>{getScrapeRunJobSummary(run)}</p>
              <time
                aria-label={`Created ${formattedCreatedAt}`}
                className="shrink-0 text-xs text-muted-foreground"
                dateTime={run.createdAt}
                suppressHydrationWarning
              >
                {formattedCreatedAt}
              </time>
            </div>

            {hasActiveJobProgress && (
              <Progress
                aria-label={`Scrape Job progress for ${run.name}`}
                value={getJobProgressPercentage(run.jobCounts)}
              />
            )}
          </div>
        </ItemContent>
      </Item>
    </div>
  )
}
