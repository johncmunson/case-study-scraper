"use client"

import { CircleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import useSWR, { useSWRConfig } from "swr"

import { DeleteScrapeJobDialog } from "@/components/scrape-runs/delete-scrape-job-dialog"
import { ScrapeJobDetailHeader } from "@/components/scrape-runs/scrape-job-detail-header"
import { ScrapeJobDetailSkeleton } from "@/components/scrape-runs/scrape-job-detail-skeleton"
import { ScrapeJobFailure } from "@/components/scrape-runs/scrape-job-failure"
import { ScrapeJobLifecycleState } from "@/components/scrape-runs/scrape-job-lifecycle-state"
import { ScrapeJobResult } from "@/components/scrape-runs/scrape-job-result"
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
  fetchScrapeJobDetail,
  fetchScrapeRunDetail,
  getScrapeJobDetailApiPath,
  getScrapeRunDetailApiPath,
  ScrapeRunApiError,
  type ScrapeJobDetail,
  type ScrapeRunDetail,
} from "@/lib/scrape-runs/api-contracts"
import { isActiveScrapeRunStatus } from "@/lib/scrape-runs/contracts"
import { isActiveScrapeJob } from "@/lib/scrape-runs/presentation"
import { cn } from "@/lib/utils"

const ACTIVE_JOB_REFRESH_INTERVAL = 3_000
const GET_ERROR_RETRY_COUNT = 3

function isRecoverableDetailError(error: ScrapeRunApiError) {
  return error.status === undefined || error.status >= 500
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="cursor-pointer"
      onClick={onRetry}
    >
      Retry
    </Button>
  )
}

function JobBackBreadcrumb({
  currentPage,
  runId,
}: {
  currentPage: string
  runId: string
}) {
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
          <BreadcrumbLink render={<Link href={`/app/scrape-runs/${runId}`} />}>
            Scrape Run
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

function NotFoundState({ runId }: { runId: string }) {
  return (
    <div className="space-y-6">
      <JobBackBreadcrumb currentPage="Not found" runId={runId} />
      <Card>
        <CardContent className="space-y-4 py-8 text-center">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Scrape Job not found</h2>
            <p className="text-muted-foreground">
              This Scrape Job does not exist or is not available in this Scrape Run.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={`/app/scrape-runs/${runId}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Back to Scrape Run
            </Link>
            <Link
              href="/app/scrape-runs"
              className={cn(buttonVariants({ variant: "ghost" }))}
            >
              View Scrape Runs
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function InitialErrorState({
  onRetry,
  runId,
}: {
  onRetry: () => void
  runId: string
}) {
  return (
    <div className="space-y-6">
      <JobBackBreadcrumb currentPage="Unavailable" runId={runId} />
      <Alert variant="destructive">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>
          <h2>Unable to load scrape job</h2>
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
      <AlertTitle>Couldn’t refresh scrape job</AlertTitle>
      <AlertDescription>Showing the most recently loaded data.</AlertDescription>
      <AlertAction>
        <RetryButton onRetry={onRetry} />
      </AlertAction>
    </Alert>
  )
}

export function ScrapeJobDetailView({
  runId,
  jobId,
}: {
  runId: string
  jobId: string
}) {
  const { cache, mutate: mutateCache } = useSWRConfig()
  const router = useRouter()
  const [notFound, setNotFound] = useState(false)
  const detailPath = getScrapeJobDetailApiPath(runId, jobId)
  const expectedRunId = Number(runId)
  const expectedJobId = Number(jobId)
  const { data, error, mutate } = useSWR<
    ScrapeJobDetail,
    ScrapeRunApiError
  >(
    detailPath,
    (url) => fetchScrapeJobDetail(url, expectedRunId, expectedJobId),
    {
      errorRetryCount: GET_ERROR_RETRY_COUNT,
      refreshInterval: (latestDetail) =>
        latestDetail &&
        (isActiveScrapeJob(latestDetail) ||
          isActiveScrapeRunStatus(latestDetail.scrapeRun.status))
          ? ACTIVE_JOB_REFRESH_INTERVAL
          : 0,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: isRecoverableDetailError,
      onErrorRetry: (
        detailError,
        key,
        configuration,
        revalidate,
        revalidateOptions,
      ) => {
        if (
          configuration.errorRetryCount !== undefined &&
          revalidateOptions.retryCount > configuration.errorRetryCount
        ) {
          return
        }

        const retryExponent = Math.min(revalidateOptions.retryCount, 8)
        const retryDelay =
          Math.trunc(
            (Math.random() + 0.5) * (1 << retryExponent),
          ) * configuration.errorRetryInterval

        setTimeout(() => {
          if (cache.get(key)?.error === detailError) {
            revalidate(revalidateOptions)
          }
        }, retryDelay)
      },
      onError: (detailError) => {
        if (detailError.status === 404) {
          setNotFound(true)
          void mutateCache(detailPath, undefined, { revalidate: false })
        }
      },
      onSuccess: () => {
        setNotFound(false)
      },
    },
  )
  const retry = () => {
    void mutate()
  }

  if (notFound || error?.status === 404) {
    return <NotFoundState runId={runId} />
  }

  if (data === undefined) {
    return error ? (
      <InitialErrorState onRetry={retry} runId={runId} />
    ) : (
      <ScrapeJobDetailSkeleton runId={runId} />
    )
  }

  const deletionAction = !isActiveScrapeRunStatus(data.scrapeRun.status) ? (
    <DeleteScrapeJobDialog
      job={data}
      runId={data.scrapeRun.id}
      triggerVariant="detail-button"
      onDeleted={async () => {
        const parentPath = getScrapeRunDetailApiPath(data.scrapeRun.id)
        try {
          await mutateCache<ScrapeRunDetail>(
            parentPath,
            fetchScrapeRunDetail(parentPath),
            { revalidate: false },
          )
        } catch {
          // The optimistic parent cache remains useful when warming fails.
        }
        router.replace(`/app/scrape-runs/${data.scrapeRun.id}`)
      }}
    />
  ) : undefined

  return (
    <div className="space-y-6">
      <ScrapeJobDetailHeader action={deletionAction} job={data} />
      {error && isRecoverableDetailError(error) && (
        <RefreshWarning onRetry={retry} />
      )}
      {data.status === "complete" ? (
        <ScrapeJobResult job={data} />
      ) : data.status === "failed" ? (
        <ScrapeJobFailure job={data} />
      ) : (
        <ScrapeJobLifecycleState status={data.status} />
      )}
    </div>
  )
}
