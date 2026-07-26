import {
  isActiveScrapeRunStatus,
  type ScrapeRunStatus,
} from "@/lib/scrape-runs/contracts"

export const EXTRACTION_DATASET_FORMATS = ["csv", "json"] as const

export type ExtractionDatasetFormat =
  (typeof EXTRACTION_DATASET_FORMATS)[number]

export type ExtractionDatasetAvailability =
  "available" | "active-run" | "no-successful-results"

export type ExtractionDatasetField = Readonly<{
  position: number
  label: string
  key: string
  required: boolean
}>

export type ExtractionDatasetRecord = Readonly<{
  canonicalPageUrl: string
  fields: Readonly<Record<string, string | null>>
}>

export type ExtractionDatasetSource = Readonly<{
  status: ScrapeRunStatus
  fields: readonly ExtractionDatasetField[]
  successfulJobs: readonly Readonly<{
    canonicalPageUrl: string
    result: unknown
  }>[]
}>

export type ExtractionDatasetInvalidReason =
  | "result-not-object"
  | "field-keys-mismatch"
  | "field-value-invalid"
  | "required-field-missing"

export type ExtractionDatasetBuildResult =
  | Readonly<{
      status: "available"
      records: readonly ExtractionDatasetRecord[]
    }>
  | Readonly<{
      status: "unavailable"
      reason: Exclude<ExtractionDatasetAvailability, "available">
    }>
  | Readonly<{
      status: "invalid"
      reason: ExtractionDatasetInvalidReason
    }>

export function getExtractionDatasetAvailability(
  status: ScrapeRunStatus,
  successfulResultCount: number,
): ExtractionDatasetAvailability {
  if (isActiveScrapeRunStatus(status)) {
    return "active-run"
  }

  return successfulResultCount > 0 ? "available" : "no-successful-results"
}

export function getExtractionDatasetApiPath(
  runId: number | string,
  format: ExtractionDatasetFormat,
) {
  return `/api/scrape-runs/${runId}/extraction-dataset?format=${format}`
}

export function getExtractionDatasetFilename(
  runName: string,
  runId: number,
  format: ExtractionDatasetFormat,
) {
  const slug = runName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  const basename = slug ? `${slug}-${runId}` : `scrape-run-${runId}`

  return `${basename}.${format}`
}

export function buildExtractionDataset(
  source: ExtractionDatasetSource,
): ExtractionDatasetBuildResult {
  const availability = getExtractionDatasetAvailability(
    source.status,
    source.successfulJobs.length,
  )

  if (availability !== "available") {
    return { status: "unavailable", reason: availability }
  }

  const orderedFields = [...source.fields].sort(
    (left, right) => left.position - right.position,
  )
  const orderedJobs = [...source.successfulJobs].sort((left, right) =>
    compareStrings(left.canonicalPageUrl, right.canonicalPageUrl),
  )
  const records: ExtractionDatasetRecord[] = []

  for (const job of orderedJobs) {
    const validatedResult = validateStoredExtractionResult(
      job.result,
      orderedFields,
    )

    if (!validatedResult.valid) {
      return { status: "invalid", reason: validatedResult.reason }
    }

    records.push({
      canonicalPageUrl: job.canonicalPageUrl,
      fields: Object.fromEntries(
        orderedFields.map((field) => [
          field.key,
          validatedResult.value[field.key],
        ]),
      ),
    })
  }

  return { status: "available", records }
}

type StoredExtractionResultValidation =
  | Readonly<{
      valid: true
      value: Readonly<Record<string, string | null>>
    }>
  | Readonly<{
      valid: false
      reason: ExtractionDatasetInvalidReason
    }>

function validateStoredExtractionResult(
  storedResult: unknown,
  fields: readonly ExtractionDatasetField[],
): StoredExtractionResultValidation {
  if (
    typeof storedResult !== "object" ||
    storedResult === null ||
    Array.isArray(storedResult)
  ) {
    return { valid: false, reason: "result-not-object" }
  }

  const result = storedResult as Record<string, unknown>
  const resultKeys = Object.keys(result)

  if (
    resultKeys.length !== fields.length ||
    fields.some((field) => !Object.hasOwn(result, field.key))
  ) {
    return { valid: false, reason: "field-keys-mismatch" }
  }

  for (const field of fields) {
    const value = result[field.key]

    if (value !== null && typeof value !== "string") {
      return { valid: false, reason: "field-value-invalid" }
    }

    if (field.required && value === null) {
      return { valid: false, reason: "required-field-missing" }
    }
  }

  return {
    valid: true,
    value: result as Readonly<Record<string, string | null>>,
  }
}

function compareStrings(left: string, right: string) {
  if (left < right) {
    return -1
  }

  return left > right ? 1 : 0
}
