import { CircleAlertIcon } from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"
import type {
  ScrapeRunApiError,
  ScrapeRunSummaryList,
} from "@/lib/scrape-runs/api-contracts"

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
      <AlertDescription>Showing the most recently loaded data.</AlertDescription>
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
  if (summaries === undefined) {
    return error ? (
      <InitialListError onRetry={onRetry} />
    ) : (
      <ScrapeRunListSkeleton />
    )
  }

  return (
    <div className="space-y-3">
      {error && <RefreshWarning onRetry={onRetry} />}
      {summaries.length === 0 ? (
        <EmptyScrapeRunList />
      ) : (
        <ItemGroup aria-label="Scrape runs">
          {summaries.map((run) => (
            <ScrapeRunListItem key={run.id} run={run} />
          ))}
        </ItemGroup>
      )}
    </div>
  )
}
