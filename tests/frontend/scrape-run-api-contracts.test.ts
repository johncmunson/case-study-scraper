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
import { server } from "@/tests/mocks/server"

const apiUrl = "http://localhost/api/scrape-runs"

const validSummary = {
  id: 17,
  name: "Customer stories",
  targetUrl: "https://www.example.com/",
  status: "in_progress" as const,
  cancellationRequestedAt: null,
  jobCounts: {
    total: 5,
    pending: 1,
    inProgress: 1,
    complete: 2,
    failed: 1,
    cancelled: 0,
  },
  createdAt: "2026-04-01T10:00:00.000Z",
  startedAt: "2026-04-01T10:01:00.000Z",
  finishedAt: null,
}

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
    expect(scrapeRunSummarySchema.parse(validSummary)).toEqual(validSummary)
    expect(scrapeRunSummaryListSchema.parse([validSummary])).toEqual([
      validSummary,
    ])
  })

  it.each([
    ["non-positive ID", { id: 0 }],
    ["non-integer ID", { id: 1.5 }],
    ["unknown status", { status: "paused" }],
    ["negative count", { jobCounts: { ...validSummary.jobCounts, failed: -1 } }],
    [
      "non-integer count",
      { jobCounts: { ...validSummary.jobCounts, total: 5.5 } },
    ],
    ["invalid URL", { targetUrl: "not a URL" }],
    ["unnormalized Target Site URL", { targetUrl: "https://example.com/path" }],
    ["nullable creation timestamp", { createdAt: null }],
    ["invalid nullable timestamp", { startedAt: "yesterday" }],
    ["missing nullable timestamp", { finishedAt: undefined }],
  ])("rejects a summary with a %s", (_label, replacement) => {
    expect(
      scrapeRunSummarySchema.safeParse({
        ...validSummary,
        ...replacement,
      }).success,
    ).toBe(false)
  })
})

describe("Scrape Run frontend fetchers", () => {
  it("validates GET data before returning it", async () => {
    server.use(
      http.get(apiUrl, () => HttpResponse.json([validSummary])),
    )

    await expect(fetchScrapeRunSummaries(apiUrl)).resolves.toEqual([
      validSummary,
    ])
  })

  it("submits the raw create input and validates the created summary", async () => {
    server.use(
      http.post(apiUrl, async ({ request }) => {
        expect(await request.json()).toEqual(newRunInput)
        expect(request.headers.get("content-type")).toBe("application/json")
        return HttpResponse.json(validSummary, { status: 201 })
      }),
    )

    await expect(
      createScrapeRun(apiUrl, { arg: newRunInput }),
    ).resolves.toEqual(validSummary)
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
    ["malformed", new HttpResponse("{not json", { status: 500 })],
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
        HttpResponse.json([{ ...validSummary, status: "unknown" }]),
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
