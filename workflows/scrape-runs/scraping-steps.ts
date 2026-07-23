import {
  claimScrapeJob,
  completeScrapeJob,
  failScrapeJob,
  finalizeScraping,
  isScrapeBatchAdmitted,
} from "@/lib/server/scrape-runs/lifecycle-repository"
import {
  MissingRequiredFieldsError,
  scrapePageForExtraction,
} from "@/lib/server/scrape-runs/providers/scrape-extraction"
import type { ClaimedScrapeRun, PersistedScrapeJob } from "./steps"

export type ScrapeJobStepResult = Readonly<{
  outcome: "complete" | "failed" | "stopped"
  scrapeJobId: number
}>

export async function admitScrapeBatchStep(scrapeRunId: number) {
  "use step"

  return isScrapeBatchAdmitted({ scrapeRunId })
}

export async function processScrapeJobStep(
  run: ClaimedScrapeRun,
  job: PersistedScrapeJob,
): Promise<ScrapeJobStepResult> {
  "use step"

  const claimed = await claimScrapeJob({
    scrapeRunId: run.scrapeRunId,
    scrapeJobId: job.id,
  })

  if (!claimed) {
    return { outcome: "stopped", scrapeJobId: job.id }
  }

  if (claimed.status === "complete" || claimed.status === "failed") {
    return { outcome: claimed.status, scrapeJobId: job.id }
  }

  if (claimed.status === "cancelled") {
    return { outcome: "stopped", scrapeJobId: job.id }
  }

  try {
    const result = await scrapePageForExtraction({
      pageUrl: claimed.url,
      fields: run.fields,
      apiKey: process.env.FIRECRAWL_API_KEY ?? "",
    })
    const completed = await completeScrapeJob({
      scrapeRunId: run.scrapeRunId,
      scrapeJobId: job.id,
      result,
    })

    return {
      outcome: completed?.status === "complete" ? "complete" : "stopped",
      scrapeJobId: job.id,
    }
  } catch (error) {
    if (!(error instanceof MissingRequiredFieldsError)) {
      throw error
    }

    const failed = await failScrapeJob({
      scrapeRunId: run.scrapeRunId,
      scrapeJobId: job.id,
      failure: error.failure,
      missingRequiredFieldKeys: error.missingRequiredFieldKeys,
    })

    return {
      outcome: failed?.status === "failed" ? "failed" : "stopped",
      scrapeJobId: job.id,
    }
  }
}
processScrapeJobStep.maxRetries = 2

export async function failScrapeJobStep(
  scrapeRunId: number,
  scrapeJobId: number,
) {
  "use step"

  return failScrapeJob({
    scrapeRunId,
    scrapeJobId,
    failure: { code: "scrape_failed", message: "Extraction failed." },
  })
}

export async function finalizeScrapingStep(scrapeRunId: number) {
  "use step"

  return finalizeScraping({ scrapeRunId })
}
