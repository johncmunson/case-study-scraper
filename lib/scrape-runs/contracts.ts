import { z } from "zod"

export const SCRAPE_RUN_STATUSES = [
  "pending",
  "in_progress",
  "complete",
  "failed",
  "cancelled",
] as const

export const SCRAPE_JOB_STATUSES = SCRAPE_RUN_STATUSES

export const SCRAPE_RUN_STAGE_STATUSES = [
  ...SCRAPE_RUN_STATUSES,
  "skipped",
] as const

export const SCRAPE_RUN_STAGES = ["mapping", "filtering", "scraping"] as const

export const SCRAPE_RUN_ERROR_CODES = [
  "workflow_dispatch_failed",
  "mapping_failed",
  "filtering_failed",
  "job_creation_failed",
  "scrape_failed",
  "missing_required_fields",
  "unexpected_workflow_failure",
] as const

export const scrapeRunStatusSchema = z.enum(SCRAPE_RUN_STATUSES)
export const scrapeJobStatusSchema = z.enum(SCRAPE_JOB_STATUSES)
export const scrapeRunStageStatusSchema = z.enum(SCRAPE_RUN_STAGE_STATUSES)
export const scrapeRunStageSchema = z.enum(SCRAPE_RUN_STAGES)
export const scrapeRunErrorCodeSchema = z.enum(SCRAPE_RUN_ERROR_CODES)

/**
 * Validates the shared Extraction Result value shape. Configured Field Key
 * membership is run-specific and must be validated separately.
 */
export const extractionResultRecordSchema = z.record(
  z.string(),
  z.string().nullable(),
)
export const scrapeRunFailureSchema = z
  .object({
    code: scrapeRunErrorCodeSchema,
    message: z.string(),
  })
  .strict()

export type ScrapeRunStatus = z.infer<typeof scrapeRunStatusSchema>
export type ScrapeJobStatus = z.infer<typeof scrapeJobStatusSchema>
export type ScrapeRunStageStatus = z.infer<typeof scrapeRunStageStatusSchema>
export type ScrapeRunStage = z.infer<typeof scrapeRunStageSchema>
export type ScrapeRunErrorCode = z.infer<typeof scrapeRunErrorCodeSchema>

export type RunConfigurationField = Readonly<{
  label: string
  key: string
  description: string
  required: boolean
  primaryIdentifier: boolean
}>

/**
 * The normalized, user-owned portion of a run's immutable configuration.
 * The server-owned filtering model is attached when the run is persisted.
 */
export type RunConfiguration = Readonly<{
  name: string
  url: string
  exampleUrls: readonly string[]
  fields: readonly RunConfigurationField[]
}>

export type PersistedRunConfiguration = RunConfiguration &
  Readonly<{
    filteringModel: string
  }>

export type ExtractionResult = Readonly<
  z.infer<typeof extractionResultRecordSchema>
>

export type ScrapeRunFailure = Readonly<z.infer<typeof scrapeRunFailureSchema>>

export function isActiveScrapeRunStatus(status: ScrapeRunStatus) {
  return status === "pending" || status === "in_progress"
}

export function isTerminalScrapeRunStatus(status: ScrapeRunStatus) {
  return !isActiveScrapeRunStatus(status)
}

export function isTerminalScrapeJobStatus(status: ScrapeJobStatus) {
  return status === "complete" || status === "failed" || status === "cancelled"
}
