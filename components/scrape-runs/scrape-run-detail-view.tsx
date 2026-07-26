"use client"

import { CircleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"
import useSWR, { useSWRConfig } from "swr"
import useSWRMutation from "swr/mutation"

import { CancelScrapeRunDialog } from "@/components/scrape-runs/cancel-scrape-run-dialog"
import { ScrapeJobSummaryTable } from "@/components/scrape-runs/scrape-job-summary-table"
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
  cancelScrapeRun,
  fetchScrapeRunDetail,
  fetchScrapeRunSummaries,
  getScrapeRunCancellationApiPath,
  getScrapeRunDetailApiPath,
  SCRAPE_RUNS_API_PATH,
  ScrapeRunApiError,
  type CancelScrapeRunResponse,
  type ScrapeRunDetail,
  type ScrapeRunSummaryList,
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

type CancellationNotice = Readonly<{
  title: string
  description: string
  visibility: "always" | "while-active"
}>

function CancellationWarning({ notice }: { notice: CancellationNotice }) {
  return (
    <Alert>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{notice.title}</AlertTitle>
      <AlertDescription>{notice.description}</AlertDescription>
    </Alert>
  )
}

function RefreshWarning({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert>
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>Couldn’t refresh scrape run</AlertTitle>
      <AlertDescription>
        Showing the most recently loaded data.
      </AlertDescription>
      <AlertAction>
        <RetryButton onRetry={onRetry} />
      </AlertAction>
    </Alert>
  )
}

export function ScrapeRunDetailView({ runId }: { runId: string }) {
  const { mutate: mutateCache } = useSWRConfig()
  const [cancellationNotice, setCancellationNotice] =
    useState<CancellationNotice | null>(null)
  const [detailRefreshFailed, setDetailRefreshFailed] = useState(false)
  const [listRefreshFailed, setListRefreshFailed] = useState(false)
  const [notFoundAfterCancellation, setNotFoundAfterCancellation] =
    useState(false)
  const readModelRefreshGeneration = useRef(0)
  const detailPath = getScrapeRunDetailApiPath(runId)
  const { data, error, mutate } = useSWR<ScrapeRunDetail, ScrapeRunApiError>(
    detailPath,
    fetchScrapeRunDetail,
    {
      errorRetryCount: GET_ERROR_RETRY_COUNT,
      refreshInterval: (latestDetail) =>
        latestDetail && isActiveScrapeRun(latestDetail)
          ? ACTIVE_RUN_REFRESH_INTERVAL
          : 0,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      shouldRetryOnError: shouldRetryDetailRequest,
      onSuccess: () => {
        setDetailRefreshFailed(false)
      },
    },
  )
  const cancellationPath = getScrapeRunCancellationApiPath(runId)
  const { trigger: cancelRun, isMutating: isCancelling } = useSWRMutation<
    CancelScrapeRunResponse,
    ScrapeRunApiError
  >(cancellationPath, cancelScrapeRun)
  const retry = () => {
    void mutate()
  }

  async function revalidateReadModels() {
    const refreshGeneration = ++readModelRefreshGeneration.current
    const [detailResult, listResult] = await Promise.allSettled([
      mutateCache<ScrapeRunDetail>(
        detailPath,
        fetchScrapeRunDetail(detailPath),
        { revalidate: false },
      ),
      mutateCache<ScrapeRunSummaryList>(
        SCRAPE_RUNS_API_PATH,
        fetchScrapeRunSummaries(SCRAPE_RUNS_API_PATH),
        { revalidate: false },
      ),
    ])
    if (refreshGeneration === readModelRefreshGeneration.current) {
      setDetailRefreshFailed(detailResult.status === "rejected")
      setListRefreshFailed(listResult.status === "rejected")
    }

    return { detailResult, listResult }
  }

  function retryReadModels() {
    void revalidateReadModels()
  }

  if (notFoundAfterCancellation) {
    return <NotFoundState />
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

  const cancellationAction = isActiveScrapeRun(data) ? (
    <CancelScrapeRunDialog
      isMutating={isCancelling}
      isRetry={data.cancellationRequestedAt !== null}
      onConfirm={async () => {
        setCancellationNotice(null)

        try {
          const cancelledRun = await cancelRun()

          if (cancelledRun.id !== data.id) {
            throw new ScrapeRunApiError(
              "The server returned an invalid response.",
              { status: 202 },
            )
          }

          await Promise.all([
            mutateCache<ScrapeRunDetail>(
              detailPath,
              (currentDetail) =>
                currentDetail
                  ? { ...currentDetail, status: cancelledRun.status }
                  : currentDetail,
              { revalidate: false },
            ),
            mutateCache<ScrapeRunSummaryList>(
              SCRAPE_RUNS_API_PATH,
              (currentRuns) =>
                currentRuns?.map((run) =>
                  run.id === cancelledRun.id
                    ? { ...run, status: cancelledRun.status }
                    : run,
                ),
              { revalidate: false },
            ),
          ])
          await revalidateReadModels()
        } catch (caughtError) {
          const cancellationError =
            caughtError instanceof ScrapeRunApiError
              ? caughtError
              : new ScrapeRunApiError("Unable to cancel the scrape run.")

          if (cancellationError.status === 409) {
            setCancellationNotice({
              title: "Scrape Run finished before cancellation",
              description:
                "The Scrape Run completed or failed before cancellation took effect. Showing its latest state.",
              visibility: "always",
            })
            await revalidateReadModels()
            return
          }

          if (cancellationError.status === 503) {
            setCancellationNotice({
              title: "Cancellation hasn’t finished",
              description:
                "The cancellation request was recorded, but cleanup did not finish. Retry cancellation after the latest state loads.",
              visibility: "while-active",
            })
            await revalidateReadModels()
            return
          }

          if (cancellationError.status === 404) {
            setCancellationNotice({
              title: "Couldn’t cancel scrape run",
              description:
                "The Scrape Run could not be found. Checking whether it is still available.",
              visibility: "always",
            })
            const [detailResult] = await Promise.allSettled([
              mutateCache<ScrapeRunDetail>(
                detailPath,
                fetchScrapeRunDetail(detailPath),
                { revalidate: false },
              ),
            ])

            if (
              detailResult.status === "rejected" &&
              detailResult.reason instanceof ScrapeRunApiError &&
              detailResult.reason.status === 404
            ) {
              setNotFoundAfterCancellation(true)
            }
            return
          }

          setCancellationNotice({
            title: "Couldn’t confirm cancellation",
            description:
              "The request may have reached the server. Showing the latest available Scrape Run state.",
            visibility: "while-active",
          })
          await revalidateReadModels()
        }
      }}
    />
  ) : undefined

  return (
    <div className="space-y-6">
      <ScrapeRunDetailHeader
        run={data}
        cancellationAction={cancellationAction}
      />
      {cancellationNotice &&
        (cancellationNotice.visibility === "always" ||
          isActiveScrapeRun(data)) && (
          <CancellationWarning notice={cancellationNotice} />
        )}
      {(error || detailRefreshFailed || listRefreshFailed) && (
        <RefreshWarning onRetry={retryReadModels} />
      )}
      <ScrapeRunOverview run={data} />
      <ScrapeRunStageList stages={data.stages} />
      <ScrapeJobSummaryTable run={data} />
      <ScrapeRunConfiguration run={data} />
    </div>
  )
}
