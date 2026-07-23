import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import {
  createScrapeRun,
  fetchScrapeRunSummaries,
  scrapeRunSummaryListSchema,
  scrapeRunSummarySchema,
  ScrapeRunApiError,
} from "@/lib/scrape-runs/api-contracts"
import type { NewScrapeRunInput } from "@/lib/scrape-runs/new-scrape-run"
import { validScrapeRunSummary } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

const apiUrl = "http://localhost/api/scrape-runs"

const newRunInput: NewScrapeRunInput = {
  name: "Customer stories",
  url: "https://www.example.com/customers",
  exampleUrls: [
    "https://www.example.com/customers/acme",
    "https://www.example.com/customers/globex",
  ],
  fields: [
    {
      label: "Company",
      description: "The company name",
      required: true,
      primaryIdentifier: true,
    },
  ],
}

describe("Scrape Run frontend contracts", () => {
  it("accepts a complete Run Summary and list", () => {
    expect(scrapeRunSummarySchema.parse(validScrapeRunSummary)).toEqual(
      validScrapeRunSummary,
    )
    expect(
      scrapeRunSummaryListSchema.parse([validScrapeRunSummary]),
    ).toEqual([validScrapeRunSummary])
  })

  it.each([
    ["non-positive ID", { id: 0 }],
    ["non-integer ID", { id: 1.5 }],
    ["unknown status", { status: "paused" }],
    [
      "negative count",
      {
        jobCounts: { ...validScrapeRunSummary.jobCounts, failed: -1 },
      },
    ],
    [
      "non-integer count",
      {
        jobCounts: { ...validScrapeRunSummary.jobCounts, total: 5.5 },
      },
    ],
    ["invalid URL", { targetUrl: "not a URL" }],
    [
      "unnormalized target origin URL",
      { targetUrl: "https://example.com/path" },
    ],
    ["localhost URL", { targetUrl: "http://localhost/" }],
    ["IP address URL", { targetUrl: "http://127.0.0.1/" }],
    ["internal hostname URL", { targetUrl: "https://service.internal/" }],
    ["nullable creation timestamp", { createdAt: null }],
    ["invalid nullable timestamp", { startedAt: "yesterday" }],
    ["missing nullable timestamp", { finishedAt: undefined }],
  ])("rejects a summary with a %s", (_label, replacement) => {
    expect(
      scrapeRunSummarySchema.safeParse({
        ...validScrapeRunSummary,
        ...replacement,
      }).success,
    ).toBe(false)
  })
})

describe("Scrape Run frontend fetchers", () => {
  it("validates GET data before returning it", async () => {
    server.use(
      http.get(apiUrl, () => HttpResponse.json([validScrapeRunSummary])),
    )

    await expect(fetchScrapeRunSummaries(apiUrl)).resolves.toEqual([
      validScrapeRunSummary,
    ])
  })

  it("submits the raw create input and validates the created summary", async () => {
    server.use(
      http.post(apiUrl, async ({ request }) => {
        expect(await request.json()).toEqual(newRunInput)
        expect(request.headers.get("content-type")).toBe("application/json")
        return HttpResponse.json(validScrapeRunSummary, { status: 201 })
      }),
    )

    await expect(
      createScrapeRun(apiUrl, { arg: newRunInput }),
    ).resolves.toEqual(validScrapeRunSummary)
  })

  it("retains safe HTTP error details and a valid persisted run ID", async () => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json(
          { error: "The scrape run could not be started.", scrapeRunId: 17 },
          { status: 503 },
        ),
      ),
    )

    const error = await fetchScrapeRunSummaries(apiUrl).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ScrapeRunApiError)
    expect(error).toMatchObject({
      message: "The scrape run could not be started.",
      status: 503,
      scrapeRunId: 17,
    })
  })

  it.each([
    ["non-JSON", HttpResponse.text("upstream details", { status: 502 })],
    ["malformed JSON", new HttpResponse("{not json", { status: 500 })],
    [
      "blank error message",
      HttpResponse.json({ error: "   " }, { status: 500 }),
    ],
    [
      "invalid persisted run ID",
      HttpResponse.json(
        { error: "A safe message", scrapeRunId: 0 },
        { status: 503 },
      ),
    ],
  ])("falls back safely for a %s error body", async (_label, response) => {
    server.use(http.get(apiUrl, () => response))

    const error = await fetchScrapeRunSummaries(apiUrl).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ScrapeRunApiError)
    expect(error).toMatchObject({
      message: `Request failed with status ${response.status}.`,
      status: response.status,
      scrapeRunId: undefined,
    })
  })

  it("rejects a nonconforming successful response", async () => {
    server.use(
      http.get(apiUrl, () =>
        HttpResponse.json([
          { ...validScrapeRunSummary, status: "unknown" },
        ]),
      ),
    )

    const error = await fetchScrapeRunSummaries(apiUrl).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ScrapeRunApiError)
    expect(error).toMatchObject({
      message: "The server returned an invalid response.",
      status: 200,
    })
  })
})
