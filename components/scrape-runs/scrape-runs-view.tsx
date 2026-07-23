"use client"

import useSWR from "swr"

import { NewScrapeRunDialog } from "@/components/scrape-runs/new-scrape-run-dialog"
import { ScrapeRunList } from "@/components/scrape-runs/scrape-run-list"
import {
  fetchScrapeRunSummaries,
  SCRAPE_RUNS_API_PATH,
  ScrapeRunApiError,
  type ScrapeRunSummaryList,
} from "@/lib/scrape-runs/api-contracts"
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <NewScrapeRunDialog />
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
