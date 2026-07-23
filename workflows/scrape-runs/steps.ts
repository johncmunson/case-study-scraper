import { gateway } from "ai"

import {
  completeMappingAndStartFiltering,
  createScrapeJobsAndStartScraping,
  failPreparationStage,
  handleUnexpectedWorkflowFailure,
  recordStageAttempt,
} from "@/lib/server/scrape-runs/lifecycle-repository"
import { mapTargetSite } from "@/lib/server/scrape-runs/providers/firecrawl-map"
import { selectMatchingPageUrls } from "@/lib/server/scrape-runs/providers/url-filtering"
import { claimScrapeRun } from "@/lib/server/scrape-runs/repository"
import type {
  RunConfigurationField,
  ScrapeRunErrorCode,
} from "@/lib/scrape-runs/contracts"

export type ClaimedScrapeRun = Readonly<{
  scrapeRunId: number
  targetUrl: string
  exampleUrls: string[]
  filteringModel: string
  fields: RunConfigurationField[]
}>

export type PersistedScrapeJob = Readonly<{
  id: number
}>

export type MappingStepResult =
  | Readonly<{ outcome: "mapped"; siteUrls: string[] }>
  | Readonly<{ outcome: "not_admitted" }>

export type FilteringStepResult =
  | Readonly<{ outcome: "filtered"; canonicalPageUrls: string[] }>
  | Readonly<{ outcome: "not_admitted" }>

export async function claimScrapeRunStep(
  scrapeRunId: number,
  workflowRunId: string,
): Promise<ClaimedScrapeRun | null> {
  "use step"

  const claimed = await claimScrapeRun({ scrapeRunId, workflowRunId })

  if (!claimed) {
    return null
  }

  return {
    scrapeRunId: claimed.id,
    targetUrl: claimed.targetUrl,
    exampleUrls: [...claimed.exampleUrls],
    filteringModel: claimed.filteringModel,
    fields: claimed.fields.map((field) => ({
      label: field.label,
      key: field.key,
      description: field.description,
      required: field.required,
      primaryIdentifier: field.primaryIdentifier,
    })),
  }
}

export async function mapTargetSiteStep(
  run: ClaimedScrapeRun,
): Promise<MappingStepResult> {
  "use step"

  const admitted = await recordStageAttempt({
    scrapeRunId: run.scrapeRunId,
    stage: "mapping",
  })

  if (!admitted) {
    return { outcome: "not_admitted" }
  }

  const siteUrls = await mapTargetSite({
    targetUrl: run.targetUrl,
    apiKey: process.env.FIRECRAWL_API_KEY ?? "",
  })

  return { outcome: "mapped", siteUrls }
}
mapTargetSiteStep.maxRetries = 2

export async function startFilteringStep(scrapeRunId: number) {
  "use step"

  return completeMappingAndStartFiltering({ scrapeRunId })
}

export async function filterMatchingPagesStep(
  run: ClaimedScrapeRun,
  siteUrls: string[],
): Promise<FilteringStepResult> {
  "use step"

  const admitted = await recordStageAttempt({
    scrapeRunId: run.scrapeRunId,
    stage: "filtering",
  })

  if (!admitted) {
    return { outcome: "not_admitted" }
  }

  const canonicalPageUrls = await selectMatchingPageUrls({
    targetUrl: run.targetUrl,
    siteUrls,
    exampleUrls: run.exampleUrls,
    filteringModel: gateway(run.filteringModel),
  })

  return { outcome: "filtered", canonicalPageUrls }
}
filterMatchingPagesStep.maxRetries = 2

export async function persistScrapeJobsStep(
  scrapeRunId: number,
  canonicalPageUrls: string[],
): Promise<PersistedScrapeJob[] | null> {
  "use step"

  const jobs = await createScrapeJobsAndStartScraping({
    scrapeRunId,
    canonicalPageUrls,
  })

  return jobs?.map((job) => ({ id: job.id })) ?? null
}

type PreparationFailureCode = Extract<
  ScrapeRunErrorCode,
  "mapping_failed" | "filtering_failed" | "job_creation_failed"
>

export async function failRunPreparationStep(
  scrapeRunId: number,
  code: PreparationFailureCode,
) {
  "use step"

  return failPreparationStage({
    scrapeRunId,
    stage: code === "mapping_failed" ? "mapping" : "filtering",
    failure: { code, message: "Run Preparation failed." },
  })
}

export async function handleUnexpectedWorkflowFailureStep(
  scrapeRunId: number,
) {
  "use step"

  return handleUnexpectedWorkflowFailure({
    scrapeRunId,
    failure: {
      code: "unexpected_workflow_failure",
      message: "The Workflow stopped unexpectedly.",
    },
  })
}
