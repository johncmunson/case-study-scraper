import { z } from "zod"

import {
  SCRAPE_RUN_STAGES,
  scrapeJobStatusSchema,
  scrapeRunErrorCodeSchema,
  scrapeRunStageSchema,
  scrapeRunStageStatusSchema,
  scrapeRunStatusSchema,
} from "@/lib/scrape-runs/contracts"
import type { NewScrapeRunInput } from "@/lib/scrape-runs/new-scrape-run"
import { isPublicDnsHostname } from "@/lib/scrape-runs/public-hostname"

export const SCRAPE_RUNS_API_PATH = "/api/scrape-runs"

export function getScrapeRunDetailApiPath(runId: number | string) {
  return `${SCRAPE_RUNS_API_PATH}/${runId}`
}

export function getScrapeRunCancellationApiPath(runId: number | string) {
  return `${getScrapeRunDetailApiPath(runId)}/cancel`
}

export function getScrapeJobDetailPath(
  runId: number | string,
  jobId: number | string,
) {
  return `/app/scrape-runs/${runId}/scrape-jobs/${jobId}`
}

const normalizedTargetUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    let url: URL

    try {
      url = new URL(value)
    } catch {
      return false
    }

    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" &&
      url.password === "" &&
      isPublicDnsHostname(url.hostname) &&
      value === `${url.origin}/`
    )
  }, "Must be a normalized HTTP or HTTPS target origin URL.")

const httpUrlSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}, "Must be a valid HTTP or HTTPS URL.")
const isoDateTimeSchema = z.iso.datetime({ offset: true })
const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable()
const positiveIntegerSchema = z.number().int().positive()
const nonnegativeIntegerSchema = z.number().int().nonnegative()
const nullableFailureCodeSchema = scrapeRunErrorCodeSchema.nullable()
const nonemptyStringSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0)

export const scrapeRunJobCountsSchema = z
  .object({
    total: nonnegativeIntegerSchema,
    pending: nonnegativeIntegerSchema,
    inProgress: nonnegativeIntegerSchema,
    complete: nonnegativeIntegerSchema,
    failed: nonnegativeIntegerSchema,
    cancelled: nonnegativeIntegerSchema,
  })
  .strict()
  .refine(
    ({ total, pending, inProgress, complete, failed, cancelled }) =>
      pending + inProgress + complete + failed + cancelled === total,
    { message: "Status-specific job counts must sum to the total." },
  )

export const scrapeRunSummarySchema = z
  .object({
    id: positiveIntegerSchema,
    name: z.string().min(1).max(100),
    targetUrl: normalizedTargetUrlSchema,
    status: scrapeRunStatusSchema,
    cancellationRequestedAt: nullableIsoDateTimeSchema,
    jobCounts: scrapeRunJobCountsSchema,
    createdAt: isoDateTimeSchema,
    startedAt: nullableIsoDateTimeSchema,
    finishedAt: nullableIsoDateTimeSchema,
  })
  .strict()

export const scrapeRunSummaryListSchema = z.array(scrapeRunSummarySchema)

export const scrapeRunFieldSchema = z
  .object({
    position: nonnegativeIntegerSchema,
    label: nonemptyStringSchema,
    key: z.string().regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
    description: nonemptyStringSchema,
    required: z.boolean(),
    primaryIdentifier: z.boolean(),
  })
  .strict()

export const scrapeRunStageStateSchema = z
  .object({
    stage: scrapeRunStageSchema,
    status: scrapeRunStageStatusSchema,
    attemptCount: nonnegativeIntegerSchema,
    failureCode: nullableFailureCodeSchema,
    failureMessage: z.string().nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    startedAt: nullableIsoDateTimeSchema,
    finishedAt: nullableIsoDateTimeSchema,
  })
  .strict()

const orderedScrapeRunFieldsSchema = z
  .array(scrapeRunFieldSchema)
  .min(1)
  .refine(
    (fields) =>
      fields.every(
        (field, index) =>
          index === 0 || fields[index - 1].position < field.position,
      ),
    { message: "Extraction Fields must be ordered by unique positions." },
  )

export const scrapeJobSummarySchema = z
  .object({
    id: positiveIntegerSchema,
    url: httpUrlSchema,
    status: scrapeJobStatusSchema,
    primaryIdentifier: z.string().nullable(),
    failureCode: nullableFailureCodeSchema,
    attemptCount: nonnegativeIntegerSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    startedAt: nullableIsoDateTimeSchema,
    finishedAt: nullableIsoDateTimeSchema,
  })
  .strict()

const orderedScrapeJobSummariesSchema = z
  .array(scrapeJobSummarySchema)
  .refine(
    (jobs) =>
      jobs.every(
        (job, index) => index === 0 || jobs[index - 1].id < job.id,
      ),
    { message: "Scrape Jobs must be ordered by unique IDs." },
  )

const canonicalRunStagesSchema = z
  .array(scrapeRunStageStateSchema)
  .length(SCRAPE_RUN_STAGES.length)
  .refine(
    (stages) =>
      stages.every(
        (stage, index) => stage.stage === SCRAPE_RUN_STAGES[index],
      ),
    { message: "Run Stages must be unique and in canonical order." },
  )

export const scrapeRunDetailSchema = scrapeRunSummarySchema
  .extend({
    failureCode: nullableFailureCodeSchema,
    failureMessage: z.string().nullable(),
    exampleUrls: z.array(httpUrlSchema),
    filteringModel: nonemptyStringSchema,
    fields: orderedScrapeRunFieldsSchema,
    stages: canonicalRunStagesSchema,
    jobs: orderedScrapeJobSummariesSchema,
  })
  .strict()
  .superRefine(({ fields }, context) => {
    const primaryFieldIndexes = fields.flatMap((field, index) =>
      field.primaryIdentifier ? [index] : [],
    )

    if (primaryFieldIndexes.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Exactly one field must be the Primary Identifier.",
        path: ["fields"],
      })
      return
    }

    const primaryFieldIndex = primaryFieldIndexes[0]

    if (!fields[primaryFieldIndex].required) {
      context.addIssue({
        code: "custom",
        message: "The Primary Identifier field must be required.",
        path: ["fields", primaryFieldIndex, "required"],
      })
    }
  })

export const cancelScrapeRunResponseSchema = z
  .object({
    id: positiveIntegerSchema,
    status: z.literal("cancelled"),
  })
  .strict()

export const scrapeRunApiErrorResponseSchema = z
  .object({
    error: nonemptyStringSchema,
    scrapeRunId: z.number().int().positive().optional(),
  })
  .strip()

export type ScrapeRunJobCounts = z.infer<typeof scrapeRunJobCountsSchema>
export type ScrapeRunSummary = z.infer<typeof scrapeRunSummarySchema>
export type ScrapeRunField = z.infer<typeof scrapeRunFieldSchema>
export type ScrapeRunStageState = z.infer<typeof scrapeRunStageStateSchema>
export type ScrapeJobSummary = z.infer<typeof scrapeJobSummarySchema>
export type ScrapeRunDetail = z.infer<typeof scrapeRunDetailSchema>
export type CancelScrapeRunResponse = z.infer<
  typeof cancelScrapeRunResponseSchema
>
export type ScrapeRunSummaryList = z.infer<
  typeof scrapeRunSummaryListSchema
>
export type ScrapeRunApiErrorResponse = z.infer<
  typeof scrapeRunApiErrorResponseSchema
>

type ScrapeRunApiErrorOptions = Readonly<{
  status?: number
  scrapeRunId?: number
}>

export class ScrapeRunApiError extends Error {
  readonly status: number | undefined
  readonly scrapeRunId: number | undefined

  constructor(message: string, options: ScrapeRunApiErrorOptions = {}) {
    super(message)
    this.name = "ScrapeRunApiError"
    this.status = options.status
    this.scrapeRunId = options.scrapeRunId
  }
}

async function readUnknownJson(response: Response): Promise<unknown> {
  return (await response.json()) as unknown
}

export async function scrapeRunApiErrorFromResponse(response: Response) {
  let body: unknown

  try {
    body = await readUnknownJson(response)
  } catch {
    return new ScrapeRunApiError(
      `Request failed with status ${response.status}.`,
      { status: response.status },
    )
  }

  const result = scrapeRunApiErrorResponseSchema.safeParse(body)

  if (!result.success) {
    return new ScrapeRunApiError(
      `Request failed with status ${response.status}.`,
      { status: response.status },
    )
  }

  return new ScrapeRunApiError(result.data.error, {
    status: response.status,
    scrapeRunId: result.data.scrapeRunId,
  })
}

async function fetchResponse(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  networkErrorMessage: string,
) {
  try {
    return await fetch(input, init)
  } catch {
    throw new ScrapeRunApiError(networkErrorMessage)
  }
}

function invalidResponseError(response: Response) {
  return new ScrapeRunApiError("The server returned an invalid response.", {
    status: response.status,
  })
}

async function validatedResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown

  try {
    body = await readUnknownJson(response)
  } catch {
    throw invalidResponseError(response)
  }

  const result = schema.safeParse(body)

  if (!result.success) {
    throw invalidResponseError(response)
  }

  return result.data
}

export async function fetchScrapeRunSummaries(
  url: string,
): Promise<ScrapeRunSummaryList> {
  const response = await fetchResponse(
    url,
    undefined,
    "Unable to load scrape runs.",
  )

  if (!response.ok) {
    throw await scrapeRunApiErrorFromResponse(response)
  }

  return validatedResponse(response, scrapeRunSummaryListSchema)
}

export async function fetchScrapeRunDetail(
  url: string,
): Promise<ScrapeRunDetail> {
  const response = await fetchResponse(
    url,
    undefined,
    "Unable to load the scrape run.",
  )

  if (!response.ok) {
    throw await scrapeRunApiErrorFromResponse(response)
  }

  return validatedResponse(response, scrapeRunDetailSchema)
}

export async function cancelScrapeRun(
  url: string,
): Promise<CancelScrapeRunResponse> {
  const response = await fetchResponse(
    url,
    { method: "POST" },
    "Unable to cancel the scrape run.",
  )

  if (!response.ok) {
    throw await scrapeRunApiErrorFromResponse(response)
  }

  if (response.status !== 202) {
    throw invalidResponseError(response)
  }

  return validatedResponse(response, cancelScrapeRunResponseSchema)
}

type CreateScrapeRunFetcherOptions = Readonly<{
  arg: NewScrapeRunInput
}>

export async function createScrapeRun(
  url: string,
  { arg }: CreateScrapeRunFetcherOptions,
): Promise<ScrapeRunSummary> {
  const response = await fetchResponse(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(arg),
    },
    "Unable to create the scrape run.",
  )

  if (!response.ok) {
    throw await scrapeRunApiErrorFromResponse(response)
  }

  if (response.status !== 201) {
    throw invalidResponseError(response)
  }

  return validatedResponse(response, scrapeRunSummarySchema)
}
