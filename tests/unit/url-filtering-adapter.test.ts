import { APICallError } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { FatalError, RetryableError } from "workflow"
import { describe, expect, it, vi } from "vitest"

import {
  postProcessSelectedUrls,
  selectMatchingPageUrls,
} from "@/lib/server/scrape-runs/providers/url-filtering"

const targetUrl = "https://example.com/"
const siteUrls = [
  "https://example.com/",
  "https://example.com/cases/alpha",
  "https://example.com/about",
  "https://example.com/cases/beta",
]
const exampleUrls = [
  "https://example.com/cases/beta",
  "https://example.com/cases/missing",
]

type GenerateCallOptions = Readonly<{
  prompt: unknown
  responseFormat?: unknown
}>

function generationResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: {
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: {
        total: 10,
        text: 10,
        reasoning: undefined,
      },
    },
    warnings: [],
  }
}

describe("URL filtering post-processing", () => {
  it("intersects, canonicalizes, deduplicates, unions Example Pages, and follows Site URL Set order", () => {
    expect(
      postProcessSelectedUrls({
        targetUrl,
        siteUrls,
        exampleUrls,
        returnedUrls: [
          "https://example.com/cases/beta?source=model",
          "https://EXAMPLE.com:443/cases/alpha/#top",
          "https://example.com/cases/alpha",
          "https://example.com/rewritten",
          "https://sub.example.com/cases/alpha",
          "https://other.com/cases/alpha",
          "not a URL",
        ],
      }),
    ).toEqual([
      "https://example.com/cases/alpha",
      "https://example.com/cases/beta",
      "https://example.com/cases/missing",
    ])
  })

  it("still returns every Example Page in user order when the model selects nothing", () => {
    expect(
      postProcessSelectedUrls({
        targetUrl,
        siteUrls,
        exampleUrls,
        returnedUrls: [],
      }),
    ).toEqual(exampleUrls)
  })
})

describe("AI structured URL filtering adapter", () => {
  it("makes one structured-output call with every Site URL and Example Page and uses its output", async () => {
    let callOptions: GenerateCallOptions | undefined
    const doGenerate = vi.fn(async (options: GenerateCallOptions) => {
      callOptions = options
      return generationResult(
        JSON.stringify({
          urls: [
            "https://example.com/cases/beta",
            "https://example.com/cases/alpha",
          ],
        }),
      )
    })
    const model = new MockLanguageModelV4({ doGenerate })

    await expect(
      selectMatchingPageUrls({
        targetUrl,
        siteUrls,
        exampleUrls,
        filteringModel: model,
      }),
    ).resolves.toEqual([
      "https://example.com/cases/alpha",
      "https://example.com/cases/beta",
      "https://example.com/cases/missing",
    ])

    expect(doGenerate).toHaveBeenCalledOnce()
    expect(callOptions?.responseFormat).toMatchObject({ type: "json" })
    const serializedPrompt = JSON.stringify(callOptions?.prompt)
    for (const url of [...siteUrls, ...exampleUrls]) {
      expect(serializedPrompt).toContain(url)
    }
    expect(serializedPrompt).toContain("copy exact candidate URLs")
  })

  it("makes no hidden AI SDK retries and maps transient API errors to Workflow retry", async () => {
    const doGenerate = vi.fn(async () => {
      throw new APICallError({
        message: "rate limited with sensitive provider details",
        url: "https://ai-gateway.vercel.sh/v1/ai/language-model",
        requestBodyValues: {},
        statusCode: 429,
        responseHeaders: { "retry-after": "4" },
      })
    })
    const model = new MockLanguageModelV4({ doGenerate })

    let thrown: unknown
    try {
      await selectMatchingPageUrls({
        targetUrl,
        siteUrls,
        exampleUrls,
        filteringModel: model,
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(RetryableError)
    expect(thrown).toMatchObject({
      message: "Filtering provider request failed transiently.",
    })
    expect((thrown as RetryableError).retryAfter.getTime()).toBeGreaterThan(
      Date.now() + 3_000,
    )
    expect(doGenerate).toHaveBeenCalledOnce()
  })

  it("treats structurally malformed structured output as retryable", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => generationResult('{"urls":"not-an-array"}'),
    })

    await expect(
      selectMatchingPageUrls({
        targetUrl,
        siteUrls,
        exampleUrls,
        filteringModel: model,
      }),
    ).rejects.toMatchObject({
      constructor: RetryableError,
      message: "Filtering provider returned malformed output.",
    })
  })

  it("maps deterministic API errors to a sanitized fatal error", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({
          message: "billing account details",
          url: "https://ai-gateway.vercel.sh/v1/ai/language-model",
          requestBodyValues: {},
          statusCode: 402,
        })
      },
    })

    await expect(
      selectMatchingPageUrls({
        targetUrl,
        siteUrls,
        exampleUrls,
        filteringModel: model,
      }),
    ).rejects.toMatchObject({
      constructor: FatalError,
      message:
        "Filtering provider request cannot succeed without intervention.",
    })
  })

  it("does not log or persist the LLM response or selected URL list", async () => {
    const consoleSpies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ]
    const { databaseMock } = await import("@/tests/mocks/database")
    const model = new MockLanguageModelV4({
      doGenerate: async () =>
        generationResult(
          JSON.stringify({ urls: ["https://example.com/cases/alpha"] }),
        ),
    })

    await selectMatchingPageUrls({
      targetUrl,
      siteUrls,
      exampleUrls,
      filteringModel: model,
    })

    expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true)
    expect(databaseMock.insert).not.toHaveBeenCalled()
    expect(databaseMock.update).not.toHaveBeenCalled()
    expect(databaseMock.transaction).not.toHaveBeenCalled()
  })
})
