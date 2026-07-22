import "server-only"

import { APICallError, NoObjectGeneratedError } from "ai"
import { SdkError } from "firecrawl"
import { FatalError, RetryableError } from "workflow"

import type { ScrapeRunStage } from "@/lib/scrape-runs/contracts"

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])
const NETWORK_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETDOWN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
])

export class MalformedProviderOutputError extends Error {
  constructor() {
    super("Provider output did not match its contract.")
    this.name = "MalformedProviderOutputError"
  }
}

function providerLabel(provider: ScrapeRunStage) {
  if (provider === "mapping") {
    return "Mapping"
  }

  return provider === "filtering" ? "Filtering" : "Scraping"
}

function findApiCallError(error: unknown): APICallError | undefined {
  if (APICallError.isInstance(error)) {
    return error
  }

  if (
    error &&
    typeof error === "object" &&
    "cause" in error &&
    error.cause !== error
  ) {
    return findApiCallError(error.cause)
  }
}

function statusCodeFrom(error: unknown) {
  const apiCallError = findApiCallError(error)

  if (apiCallError?.statusCode !== undefined) {
    return apiCallError.statusCode
  }

  if (error instanceof SdkError) {
    return error.status
  }
}

function retryAfterFrom(error: unknown): number | Date | undefined {
  const headers = findApiCallError(error)?.responseHeaders
  const retryAfterMilliseconds = headers?.["retry-after-ms"]

  if (retryAfterMilliseconds) {
    const parsedMilliseconds = Number.parseFloat(retryAfterMilliseconds)

    if (Number.isFinite(parsedMilliseconds) && parsedMilliseconds >= 0) {
      return parsedMilliseconds
    }
  }

  const retryAfter = headers?.["retry-after"]

  if (!retryAfter) {
    return
  }

  const seconds = Number.parseFloat(retryAfter)

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const date = new Date(retryAfter)
  return Number.isNaN(date.getTime()) || date.getTime() <= Date.now()
    ? undefined
    : date
}

function hasNetworkFailure(error: unknown) {
  if (error instanceof SdkError && error.status === undefined) {
    return true
  }

  const apiCallError = findApiCallError(error)

  if (apiCallError?.statusCode === undefined && apiCallError?.isRetryable) {
    return true
  }

  if (!error || typeof error !== "object") {
    return false
  }

  if (
    "code" in error &&
    typeof error.code === "string" &&
    NETWORK_ERROR_CODES.has(error.code)
  ) {
    return true
  }

  return (
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  )
}

export function toProviderWorkflowError(
  provider: ScrapeRunStage,
  error: unknown,
): RetryableError | FatalError {
  if (RetryableError.is(error) || FatalError.is(error)) {
    return error
  }

  const label = providerLabel(provider)

  if (
    error instanceof MalformedProviderOutputError ||
    NoObjectGeneratedError.isInstance(error)
  ) {
    return new RetryableError(`${label} provider returned malformed output.`)
  }

  const statusCode = statusCodeFrom(error)

  if (
    (statusCode !== undefined && RETRYABLE_STATUS_CODES.has(statusCode)) ||
    hasNetworkFailure(error)
  ) {
    return new RetryableError(`${label} provider request failed transiently.`, {
      retryAfter: retryAfterFrom(error),
    })
  }

  return new FatalError(
    `${label} provider request cannot succeed without intervention.`,
  )
}
