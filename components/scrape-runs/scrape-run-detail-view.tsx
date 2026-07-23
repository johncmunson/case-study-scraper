"use client"

import { CircleAlertIcon } from "lucide-react"
import Link from "next/link"
import useSWR from "swr"

import { ScrapeRunConfiguration } from "@/components/scrape-runs/scrape-run-configuration"
import { ScrapeRunDetailHeader } from "@/components/scrape-runs/scrape-run-detail-header"
import { ScrapeRunDetailSkeleton } from "@/components/scrape-runs/scrape-run-detail-skeleton"
import { ScrapeRunOverview } from "@/components/scrape-runs/scrape-run-overview"
import { ScrapeRunStageList } from "@/components/scrape-runs/scrape-run-stage-list"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  fetchScrapeRunDetail,
  getScrapeRunDetailApiPath,
  ScrapeRunApiError,
  type ScrapeRunDetail,
} from "@/lib/scrape-runs/api-contracts"
import { isActiveScrapeRun } from "@/lib/scrape-runs/presentation"
import { cn } from "@/lib/utils"

const ACTIVE_RUN_REFRESH_INTERVAL = 3_000
const GET_ERROR_RETRY_COUNT = 3

function shouldRetryDetailRequest(error: ScrapeRunApiError) {
  return error.status === undefined || error.status >= 500
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
      Retry
    </Button>
  )
}

function BackBreadcrumb({ currentPage }: { currentPage: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/app/scrape-runs" />}>
            Scrape Runs
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{currentPage}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function NotFoundState() {
  return (
    <div className="space-y-6">
      <BackBreadcrumb currentPage="Not found" />
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <h2 className="text-xl font-semibold">Scrape Run not found</h2>
          <p className="text-muted-foreground">
            This Scrape Run does not exist or is not available to you.
          </p>
          <Link
            href="/app/scrape-runs"
            className={cn(buttonVariants({ variant: "outline" }), "mt-2")}
          >
            Back to Scrape Runs
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function InitialErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <BackBreadcrumb currentPage="Unavailable" />
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>
          <h2>Unable to load scrape run</h2>
        </AlertTitle>
        <AlertDescription>Please try again.</AlertDescription>
        <AlertAction>
          <RetryButton onRetry={onRetry} />
        </AlertAction>
      </Alert>
    </div>
  )
}

function RefreshWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>Couldn’t refresh scrape run</AlertTitle>
      <AlertDescription>Showing the most recently loaded data.</AlertDescription>
      <AlertAction>
        <RetryButton onRetry={onRetry} />
      </AlertAction>
    </Alert>
  )
}

export function ScrapeRunDetailView({ runId }: { runId: string }) {
  const detailPath = getScrapeRunDetailApiPath(runId)
  const { data, error, mutate } = useSWR<
    ScrapeRunDetail,
    ScrapeRunApiError
  >(detailPath, fetchScrapeRunDetail, {
    errorRetryCount: GET_ERROR_RETRY_COUNT,
    refreshInterval: (latestDetail) =>
      latestDetail && isActiveScrapeRun(latestDetail)
        ? ACTIVE_RUN_REFRESH_INTERVAL
        : 0,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    shouldRetryOnError: shouldRetryDetailRequest,
  })
  const retry = () => {
    void mutate()
  }

  if (data === undefined) {
    if (error?.status === 404) {
      return <NotFoundState />
    }

    return error ? (
      <InitialErrorState onRetry={retry} />
    ) : (
      <ScrapeRunDetailSkeleton />
    )
  }

  return (
    <div className="space-y-6">
      <ScrapeRunDetailHeader run={data} />
      {error && <RefreshWarning onRetry={retry} />}
      <ScrapeRunOverview run={data} />
      <ScrapeRunStageList stages={data.stages} />
      <ScrapeRunConfiguration run={data} />
    </div>
  )
}
