import { z } from "zod"

import { scrapeRunStatusSchema } from "@/lib/scrape-runs/contracts"
import type { NewScrapeRunInput } from "@/lib/scrape-runs/new-scrape-run"

export const SCRAPE_RUNS_API_PATH = "/api/scrape-runs"

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
      value === `${url.origin}/`
    )
  }, "Must be a normalized HTTP or HTTPS Target Site URL.")

const isoDateTimeSchema = z.iso.datetime({ offset: true })
const nullableIsoDateTimeSchema = isoDateTimeSchema.nullable()
const nonnegativeIntegerSchema = z.number().int().nonnegative()

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

export const scrapeRunSummarySchema = z
  .object({
    id: z.number().int().positive(),
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

export const scrapeRunApiErrorResponseSchema = z
  .object({
    error: z.string().min(1),
    scrapeRunId: z.number().int().positive().optional(),
  })
  .strip()

export type ScrapeRunJobCounts = z.infer<typeof scrapeRunJobCountsSchema>
export type ScrapeRunSummary = z.infer<typeof scrapeRunSummarySchema>
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

async function validatedResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown

  try {
    body = await readUnknownJson(response)
  } catch {
    throw new ScrapeRunApiError("The server returned an invalid response.", {
      status: response.status,
    })
  }

  const result = schema.safeParse(body)

  if (!result.success) {
    throw new ScrapeRunApiError("The server returned an invalid response.", {
      status: response.status,
    })
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
    throw new ScrapeRunApiError("The server returned an invalid response.", {
      status: response.status,
    })
  }

  return validatedResponse(response, scrapeRunSummarySchema)
}
