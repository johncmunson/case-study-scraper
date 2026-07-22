import { http, HttpResponse } from "msw"
import { FatalError, RetryableError } from "workflow"
import { describe, expect, it, vi } from "vitest"

import type { RunConfigurationField } from "@/lib/scrape-runs/contracts"
import {
  buildFirecrawlExtractionSchema,
  MissingRequiredFieldsError,
  scrapePageForExtraction,
} from "@/lib/server/scrape-runs/providers/scrape-extraction"
import { server } from "@/tests/mocks/server"

const pageUrl = "https://example.com/cases/alpha"
const fields = [
  {
    label: "Client",
    key: "client",
    description: "The client who funded the project.",
    required: true,
    primaryIdentifier: true,
  },
  {
    label: "Sector",
    key: "sector",
    description: "The client's sector.",
    required: false,
    primaryIdentifier: false,
  },
] as const satisfies readonly RunConfigurationField[]

function scrapeHandler(resolver: Parameters<typeof http.post>[1]) {
  return http.post("https://api.firecrawl.dev/v2/scrape", resolver)
}

function successfulScrape(json: unknown) {
  return HttpResponse.json({ success: true, data: { json } })
}

describe("Firecrawl extraction schema", () => {
  it("uses nullable strings, appended null instructions, no required keyword, and no additional properties", () => {
    const schema = buildFirecrawlExtractionSchema(fields)

    expect(schema).toEqual({
      type: "object",
      additionalProperties: false,
      properties: {
        client: {
          type: ["string", "null"],
          description:
            "The client who funded the project. Return null if not found on the page.",
        },
        sector: {
          type: ["string", "null"],
          description:
            "The client's sector. Return null if not found on the page.",
        },
      },
    })
    expect(schema).not.toHaveProperty("required")
  })
})

describe("Firecrawl Scrape extraction adapter", () => {
  it("makes one JSON-mode scrape with the generated schema and retains default caching", async () => {
    let requestBody: Record<string, unknown> | undefined

    server.use(
      scrapeHandler(async ({ request }) => {
        requestBody = (await request.json()) as Record<string, unknown>
        return successfulScrape({ client: "  Acme Corp  ", sector: " Energy " })
      }),
    )

    await expect(
      scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-test" }),
    ).resolves.toEqual({ client: "Acme Corp", sector: "Energy" })

    expect(requestBody).toMatchObject({
      url: pageUrl,
      formats: [{ type: "json", schema: buildFirecrawlExtractionSchema(fields) }],
    })
    expect(requestBody).not.toHaveProperty("maxAge")
  })

  it("normalizes omitted, null, empty, and whitespace-only optional values to null", async () => {
    const outputs = [
      { client: "Acme" },
      { client: "Acme", sector: null },
      { client: "Acme", sector: "" },
      { client: "Acme", sector: "   \n " },
    ]

    server.use(
      scrapeHandler(() => successfulScrape(outputs.shift())),
    )

    for (let index = 0; index < 4; index += 1) {
      await expect(
        scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-test" }),
      ).resolves.toEqual({ client: "Acme", sector: null })
    }
  })

  it.each([
    ["a null document", null],
    ["an array document", []],
    ["an unknown property", { client: "Acme", sector: null, extra: "value" }],
    ["a wrong-typed property", { client: "Acme", sector: 42 }],
  ])("treats %s as retryable malformed output", async (_name, json) => {
    server.use(scrapeHandler(() => successfulScrape(json)))

    await expect(
      scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-test" }),
    ).rejects.toMatchObject({
      constructor: RetryableError,
      message: "Scraping provider returned malformed output.",
    })
  })

  it("returns a fatal missing-required outcome with only the missing Field Keys and no partial result", async () => {
    server.use(
      scrapeHandler(() => successfulScrape({ client: null, sector: "Energy" })),
    )

    let thrown: unknown
    try {
      await scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-test" })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(FatalError)
    expect(thrown).toBeInstanceOf(MissingRequiredFieldsError)
    expect(thrown).toMatchObject({
      failure: {
        code: "missing_required_fields",
        message: "The page did not contain every required extraction field.",
      },
      missingRequiredFieldKeys: ["client"],
    })
    expect(thrown).not.toHaveProperty("result")
  })

  it("treats a missing Primary Identifier as the same fatal required-field outcome", async () => {
    server.use(scrapeHandler(() => successfulScrape({ sector: "Energy" })))

    await expect(
      scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-test" }),
    ).rejects.toMatchObject({
      constructor: MissingRequiredFieldsError,
      missingRequiredFieldKeys: ["client"],
    })
  })

  it("classifies a transient provider failure without hidden SDK retries", async () => {
    const requests = vi.fn()

    server.use(
      scrapeHandler(() => {
        requests()
        return HttpResponse.json(
          { success: false, error: "upstream details" },
          { status: 503 },
        )
      }),
    )

    await expect(
      scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-test" }),
    ).rejects.toBeInstanceOf(RetryableError)
    expect(requests).toHaveBeenCalledOnce()
  })

  it("classifies deterministic provider failures as fatal", async () => {
    server.use(
      scrapeHandler(() =>
        HttpResponse.json(
          { success: false, error: "invalid authentication" },
          { status: 401 },
        ),
      ),
    )

    await expect(
      scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-invalid" }),
    ).rejects.toMatchObject({
      constructor: FatalError,
      message: "Scraping provider request cannot succeed without intervention.",
    })
  })

  it("does not log or persist extraction output", async () => {
    const consoleSpies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ]
    const { databaseMock } = await import("@/tests/mocks/database")

    server.use(
      scrapeHandler(() =>
        successfulScrape({ client: "private client", sector: null }),
      ),
    )

    await scrapePageForExtraction({ pageUrl, fields, apiKey: "fc-test" })

    expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true)
    expect(databaseMock.insert).not.toHaveBeenCalled()
    expect(databaseMock.update).not.toHaveBeenCalled()
    expect(databaseMock.transaction).not.toHaveBeenCalled()
  })
})
