import "server-only"

import Firecrawl, { SdkError } from "firecrawl"
import { FatalError } from "workflow"

import type {
  ExtractionResult,
  RunConfigurationField,
  ScrapeRunFailure,
} from "@/lib/scrape-runs/contracts"
import {
  MalformedProviderOutputError,
  toProviderWorkflowError,
} from "@/lib/server/scrape-runs/providers/errors"

const NULL_INSTRUCTION = "Return null if not found on the page."

type FirecrawlExtractionProperty = Readonly<{
  type: readonly ["string", "null"]
  description: string
}>

export type FirecrawlExtractionSchema = Readonly<{
  type: "object"
  properties: Readonly<Record<string, FirecrawlExtractionProperty>>
}>

function assertValidExtractionFields(
  fields: readonly RunConfigurationField[],
): void {
  if (fields.length === 0) {
    throw new TypeError("At least one extraction field is required.")
  }

  const keys = new Set<string>()
  let primaryFieldCount = 0

  for (const field of fields) {
    if (!field.key || !field.description || keys.has(field.key)) {
      throw new TypeError("Extraction field configuration is invalid.")
    }

    keys.add(field.key)

    if (field.primaryIdentifier) {
      primaryFieldCount += 1

      if (!field.required) {
        throw new TypeError("The Primary Identifier must be required.")
      }
    }
  }

  if (primaryFieldCount !== 1) {
    throw new TypeError("Exactly one Primary Identifier is required.")
  }
}

export function buildFirecrawlExtractionSchema(
  fields: readonly RunConfigurationField[],
): FirecrawlExtractionSchema {
  assertValidExtractionFields(fields)

  const properties = Object.fromEntries(
    fields.map((field) => [
      field.key,
      {
        type: ["string", "null"] as const,
        description: `${field.description} ${NULL_INSTRUCTION}`,
      },
    ]),
  )

  return {
    type: "object",
    properties,
  }
}

export class MissingRequiredFieldsError extends FatalError {
  readonly failure: ScrapeRunFailure = Object.freeze({
    code: "missing_required_fields",
    message: "The page did not contain every required extraction field.",
  })
  readonly missingRequiredFieldKeys: readonly string[]

  constructor(missingRequiredFieldKeys: readonly string[]) {
    super("Required extraction fields were missing.")
    this.missingRequiredFieldKeys = Object.freeze([
      ...missingRequiredFieldKeys,
    ])
  }
}

function normalizeExtractionOutput(
  output: unknown,
  fields: readonly RunConfigurationField[],
): ExtractionResult {
  if (output === null || typeof output !== "object" || Array.isArray(output)) {
    throw new MalformedProviderOutputError()
  }

  const record = output as Record<string, unknown>
  const configuredKeys = new Set(fields.map((field) => field.key))

  if (Object.keys(record).some((key) => !configuredKeys.has(key))) {
    throw new MalformedProviderOutputError()
  }

  const result: Record<string, string | null> = {}

  for (const field of fields) {
    const value = record[field.key]

    if (value !== undefined && value !== null && typeof value !== "string") {
      throw new MalformedProviderOutputError()
    }

    if (typeof value === "string") {
      const trimmedValue = value.trim()
      result[field.key] = trimmedValue || null
    } else {
      result[field.key] = null
    }
  }

  const missingRequiredFieldKeys = fields
    .filter((field) => field.required && result[field.key] === null)
    .map((field) => field.key)

  if (missingRequiredFieldKeys.length > 0) {
    throw new MissingRequiredFieldsError(missingRequiredFieldKeys)
  }

  return Object.freeze(result)
}

export type ScrapePageForExtractionInput = Readonly<{
  pageUrl: string
  fields: readonly RunConfigurationField[]
  apiKey: string
}>

export async function scrapePageForExtraction({
  pageUrl,
  fields,
  apiKey,
}: ScrapePageForExtractionInput): Promise<ExtractionResult> {
  try {
    if (!apiKey.trim()) {
      throw new TypeError("A Firecrawl API key is required.")
    }

    const parsedPageUrl = new URL(pageUrl)
    if (parsedPageUrl.protocol !== "http:" && parsedPageUrl.protocol !== "https:") {
      throw new TypeError("A valid HTTP(S) page URL is required.")
    }

    const schema = buildFirecrawlExtractionSchema(fields)
    // The installed SDK counts maxRetries as total attempts. One disables its
    // hidden retry loop so Workflow remains the sole retry authority.
    const firecrawl = new Firecrawl({ apiKey, maxRetries: 1 })
    const document = await firecrawl.scrape(pageUrl, {
      formats: [{ type: "json", schema }],
    })
    const originStatusCode = document.metadata?.statusCode

    if (originStatusCode !== undefined && originStatusCode >= 400) {
      throw new SdkError(
        "The page returned an unsuccessful HTTP status.",
        originStatusCode,
      )
    }

    return normalizeExtractionOutput(document.json, fields)
  } catch (error) {
    throw toProviderWorkflowError("scraping", error)
  }
}
