"use client"

import useSWR from "swr"
import useSWRMutation from "swr/mutation"

import { NewScrapeRunDialog } from "@/components/scrape-runs/new-scrape-run-dialog"
import { ScrapeRunList } from "@/components/scrape-runs/scrape-run-list"
import {
  createScrapeRun,
  fetchScrapeRunSummaries,
  SCRAPE_RUNS_API_PATH,
  ScrapeRunApiError,
  type ScrapeRunSummary,
  type ScrapeRunSummaryList,
} from "@/lib/scrape-runs/api-contracts"
import type { NewScrapeRunInput } from "@/lib/scrape-runs/new-scrape-run"
import { isActiveScrapeRun } from "@/lib/scrape-runs/presentation"

const ACTIVE_RUN_REFRESH_INTERVAL = 3_000
const GET_ERROR_RETRY_COUNT = 3

function shouldRetryListRequest(error: ScrapeRunApiError) {
  return error.status === undefined || error.status >= 500
}

export function ScrapeRunsView() {
  const { data, error, mutate } = useSWR<
    ScrapeRunSummaryList,
    ScrapeRunApiError
  >(SCRAPE_RUNS_API_PATH, fetchScrapeRunSummaries, {
    errorRetryCount: GET_ERROR_RETRY_COUNT,
    refreshInterval: (latestSummaries) =>
      latestSummaries?.some(isActiveScrapeRun)
        ? ACTIVE_RUN_REFRESH_INTERVAL
        : 0,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    shouldRetryOnError: shouldRetryListRequest,
  })
  const { trigger: createRun, isMutating } = useSWRMutation<
    ScrapeRunSummary,
    ScrapeRunApiError,
    string,
    NewScrapeRunInput,
    ScrapeRunSummaryList
  >(SCRAPE_RUNS_API_PATH, createScrapeRun, {
    populateCache: (createdRun, currentRuns) => [
      createdRun,
      ...(currentRuns ?? []).filter((run) => run.id !== createdRun.id),
    ],
    revalidate: false,
    onError: (createError) => {
      if (
        createError.status === 409 ||
        (createError.status === 503 && createError.scrapeRunId !== undefined)
      ) {
        void mutate()
      }
    },
  })
  const hasActiveRun = data?.some(isActiveScrapeRun) ?? false

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <NewScrapeRunDialog
          hasActiveRun={hasActiveRun}
          isMutating={isMutating}
          onCreate={createRun}
        />
      </div>
      <ScrapeRunList
        summaries={data}
        error={error}
        onRetry={() => {
          void mutate()
        }}
      />
    </div>
  )
}
