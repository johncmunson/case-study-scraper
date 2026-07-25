"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
} from "lucide-react"
import { useState } from "react"

import { ScrapeRunListItem } from "@/components/scrape-runs/scrape-run-list-item"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Item, ItemGroup } from "@/components/ui/item"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  ScrapeRunApiError,
  ScrapeRunSummaryList,
} from "@/lib/scrape-runs/api-contracts"

const SCRAPE_RUN_PAGE_SIZE = 15

type ScrapeRunListProps = {
  error: ScrapeRunApiError | undefined
  onRetry: () => void
  summaries: ScrapeRunSummaryList | undefined
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      Retry
    </Button>
  )
}

function ScrapeRunListSkeleton() {
  return (
    <ItemGroup aria-label="Loading scrape runs">
      {Array.from({ length: 3 }, (_, index) => (
        <Item key={index} role="listitem" variant="outline" aria-hidden="true">
          <Skeleton className="h-14 w-full" />
        </Item>
      ))}
    </ItemGroup>
  )
}

function InitialListError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Unable to load scrape runs</AlertTitle>
      <AlertDescription>Please try again.</AlertDescription>
      <AlertAction>
        <RetryButton onRetry={onRetry} />
      </AlertAction>
    </Alert>
  )
}

function RefreshWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert>
      <CircleAlertIcon />
      <AlertTitle>Couldn’t refresh scrape runs</AlertTitle>
      <AlertDescription>
        Showing the most recently loaded data.
      </AlertDescription>
      <AlertAction>
        <RetryButton onRetry={onRetry} />
      </AlertAction>
    </Alert>
  )
}

function EmptyScrapeRunList() {
  return (
    <Empty className="min-h-48 border">
      <EmptyHeader>
        <EmptyTitle>No scrape runs yet</EmptyTitle>
        <EmptyDescription>
          Use the Create New Scrape Run action to configure your first run.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function ScrapeRunList({
  error,
  onRetry,
  summaries,
}: ScrapeRunListProps) {
  const [requestedPage, setRequestedPage] = useState(1)

  if (summaries === undefined) {
    return error ? (
      <InitialListError onRetry={onRetry} />
    ) : (
      <ScrapeRunListSkeleton />
    )
  }

  const totalPages = Math.max(
    1,
    Math.ceil(summaries.length / SCRAPE_RUN_PAGE_SIZE),
  )
  const page = Math.min(Math.max(requestedPage, 1), totalPages)
  const startIndex = (page - 1) * SCRAPE_RUN_PAGE_SIZE
  const visibleSummaries = summaries.slice(
    startIndex,
    startIndex + SCRAPE_RUN_PAGE_SIZE,
  )

  return (
    <div className="space-y-3">
      {error && <RefreshWarning onRetry={onRetry} />}
      {summaries.length === 0 ? (
        <EmptyScrapeRunList />
      ) : (
        <>
          <ItemGroup aria-label="Scrape runs">
            {visibleSummaries.map((run) => (
              <ScrapeRunListItem key={run.id} run={run} />
            ))}
          </ItemGroup>
          {totalPages > 1 && (
            <Pagination aria-label="Scrape Run pages">
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
    </div>
  )
}
