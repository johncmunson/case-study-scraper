import { APICallError } from "ai"
import { SdkError } from "firecrawl"
import { FatalError, RetryableError } from "workflow"
import { describe, expect, it } from "vitest"

import {
  MalformedProviderOutputError,
  toProviderWorkflowError,
} from "@/lib/server/scrape-runs/providers/errors"

describe("provider failure classification", () => {
  it.each([408, 429, 500, 502, 503, 504])(
    "classifies HTTP %s as retryable",
    (status) => {
      const classified = toProviderWorkflowError(
        "mapping",
        new SdkError("provider payload", status),
      )

      expect(classified).toBeInstanceOf(RetryableError)
      expect(classified.message).not.toContain("provider payload")
    },
  )

  it.each([400, 401, 402, 403, 404, 409, 422])(
    "classifies deterministic HTTP %s as fatal",
    (status) => {
      expect(
        toProviderWorkflowError(
          "filtering",
          new APICallError({
            message: "provider payload",
            url: "https://provider.invalid",
            requestBodyValues: {},
            statusCode: status,
          }),
        ),
      ).toBeInstanceOf(FatalError)
    },
  )

  it.each(["EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"])(
    "classifies raw network error code %s as retryable",
    (code) => {
      expect(
        toProviderWorkflowError("filtering", {
          name: "Error",
          message: "network details",
          code,
        }),
      ).toBeInstanceOf(RetryableError)
    },
  )

  it("classifies a raw timeout by name as retryable", () => {
    expect(
      toProviderWorkflowError("filtering", {
        name: "TimeoutError",
        message: "timed out",
      }),
    ).toBeInstanceOf(RetryableError)
  })

  it("classifies Firecrawl network failures without a status as retryable", () => {
    expect(
      toProviderWorkflowError(
        "mapping",
        new SdkError("socket failed", undefined, "ECONNRESET"),
      ),
    ).toBeInstanceOf(RetryableError)
  })

  it("classifies malformed provider output as retryable", () => {
    expect(
      toProviderWorkflowError("filtering", new MalformedProviderOutputError()),
    ).toMatchObject({
      constructor: RetryableError,
      message: "Filtering provider returned malformed output.",
    })
  })

  it("does not retry unknown programming or configuration errors", () => {
    expect(
      toProviderWorkflowError("mapping", new TypeError("invalid adapter use")),
    ).toBeInstanceOf(FatalError)
  })
})
