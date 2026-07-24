import Link from "next/link"

import { ScrapeRunCardActions } from "@/components/scrape-runs/scrape-run-card-actions"
import { Badge } from "@/components/ui/badge"
import {
  Item,
  ItemActions,
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
        variant="outline"
        className="relative min-w-0 items-stretch gap-0 overflow-hidden bg-card p-0 sm:flex-nowrap"
      >
        <Link
          href={`/app/scrape-runs/${run.id}`}
          className="min-w-0 flex-1 rounded-lg p-4 outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <ItemContent className="min-w-0 gap-3">
            <div className="min-w-0 pr-10">
              <ItemTitle className="block w-full min-w-0 text-base">
                <h2 className="truncate" title={run.name}>
                  {run.name}
                </h2>
              </ItemTitle>
              <ItemDescription className="truncate" title={hostname}>
                {hostname}
              </ItemDescription>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <p>{getScrapeRunJobSummary(run)}</p>
                <div className="flex shrink-0 items-center gap-2">
                  <time
                    aria-label={`Created ${formattedCreatedAt}`}
                    className="text-xs text-muted-foreground"
                    dateTime={run.createdAt}
                    suppressHydrationWarning
                  >
                    {formattedCreatedAt}
                  </time>
                  <Badge
                    aria-label={`Status: ${statusLabel}`}
                    variant={getStatusBadgeVariant(run)}
                  >
                    {showSpinner && <Spinner aria-hidden="true" />}
                    {statusLabel}
                  </Badge>
                </div>
              </div>

              {hasActiveJobProgress && (
                <Progress
                  aria-label={`Scrape Job progress for ${run.name}`}
                  value={getJobProgressPercentage(run.jobCounts)}
                />
              )}
            </div>
          </ItemContent>
        </Link>
        <ItemActions className="absolute top-4 right-4 z-10">
          <ScrapeRunCardActions run={run} />
        </ItemActions>
      </Item>
    </div>
  )
}
