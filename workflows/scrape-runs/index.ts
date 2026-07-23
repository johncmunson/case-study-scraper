import { FatalError, getWorkflowMetadata, RetryableError } from "workflow"

import {
  claimScrapeRunStep,
  failRunPreparationStep,
  filterMatchingPagesStep,
  handleUnexpectedWorkflowFailureStep,
  mapTargetSiteStep,
  persistScrapeJobsStep,
  startFilteringStep,
} from "./steps"

export type ScrapeRunWorkflowResult =
  | Readonly<{ outcome: "unclaimable"; scrapeRunId: number }>
  | Readonly<{ outcome: "stopped"; scrapeRunId: number }>
  | Readonly<{
      outcome: "mapping_failed" | "filtering_failed" | "job_creation_failed"
      scrapeRunId: number
    }>
  | Readonly<{
      outcome: "preparation_complete"
      scrapeRunId: number
      jobCount: number
    }>

function isClassifiedProviderFailure(error: unknown) {
  return FatalError.is(error) || RetryableError.is(error)
}

export async function scrapeRunWorkflow(
  scrapeRunId: number,
): Promise<ScrapeRunWorkflowResult> {
  "use workflow"

  try {
    const { workflowRunId } = getWorkflowMetadata()
    const run = await claimScrapeRunStep(scrapeRunId, workflowRunId)

    if (!run) {
      return { outcome: "unclaimable", scrapeRunId }
    }

    let mapping
    try {
      mapping = await mapTargetSiteStep(run)
    } catch (error) {
      if (!isClassifiedProviderFailure(error)) {
        throw error
      }

      const failed = await failRunPreparationStep(
        scrapeRunId,
        "mapping_failed",
      )
      return {
        outcome: failed ? "mapping_failed" : "stopped",
        scrapeRunId,
      }
    }

    if (mapping.outcome === "not_admitted") {
      return { outcome: "stopped", scrapeRunId }
    }

    if (!(await startFilteringStep(scrapeRunId))) {
      return { outcome: "stopped", scrapeRunId }
    }

    let filtering
    try {
      filtering = await filterMatchingPagesStep(run, mapping.siteUrls)
    } catch (error) {
      if (!isClassifiedProviderFailure(error)) {
        throw error
      }

      const failed = await failRunPreparationStep(
        scrapeRunId,
        "filtering_failed",
      )
      return {
        outcome: failed ? "filtering_failed" : "stopped",
        scrapeRunId,
      }
    }

    if (filtering.outcome === "not_admitted") {
      return { outcome: "stopped", scrapeRunId }
    }

    let jobCount: number | null
    try {
      jobCount = await persistScrapeJobsStep(
        scrapeRunId,
        filtering.canonicalPageUrls,
      )
    } catch {
      const failed = await failRunPreparationStep(
        scrapeRunId,
        "job_creation_failed",
      )
      return {
        outcome: failed ? "job_creation_failed" : "stopped",
        scrapeRunId,
      }
    }

    if (jobCount === null) {
      return { outcome: "stopped", scrapeRunId }
    }

    return { outcome: "preparation_complete", scrapeRunId, jobCount }
  } catch (error) {
    await handleUnexpectedWorkflowFailureStep(scrapeRunId)
    throw error
  }
}
