import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import {
  cancelScrapeRun,
  cancelScrapeRunResponseSchema,
  createScrapeRun,
  deleteScrapeRun,
  fetchScrapeRunDetail,
  fetchScrapeRunSummaries,
  getScrapeJobDetailPath,
  getScrapeRunCancellationApiPath,
  getScrapeRunDetailApiPath,
  scrapeRunDetailSchema,
  scrapeRunSummaryListSchema,
  scrapeRunSummarySchema,
  ScrapeRunApiError,
} from "@/lib/scrape-runs/api-contracts"
import type { NewScrapeRunInput } from "@/lib/scrape-runs/new-scrape-run"
import {
  validScrapeRunDetail,
  validScrapeRunSummary,
} from "@/tests/frontend/scrape-run-fixtures"
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

describe("Scrape Run detail frontend contract", () => {
  it("accepts one complete strict Run detail response", () => {
    expect(scrapeRunDetailSchema.parse(validScrapeRunDetail)).toEqual(
      validScrapeRunDetail,
    )
    expect(
      scrapeRunDetailSchema.safeParse({
        ...validScrapeRunDetail,
        workflowRunId: "wfr_secret",
      }).success,
    ).toBe(false)
  })

  it.each([
    ["Run ID", { id: 0 }],
    ["Run failure code", { failureCode: "provider_exploded" }],
    ["Run failure timestamp", { finishedAt: "yesterday" }],
    ["Target Site", { targetUrl: "https://www.example.com/path" }],
    ["Example Page URL", { exampleUrls: ["ftp://example.com/one"] }],
    ["filtering model", { filteringModel: "" }],
    ["job ID", { jobs: [{ ...validScrapeRunDetail.jobs[0], id: -1 }] }],
    ["job status", { jobs: [{ ...validScrapeRunDetail.jobs[0], status: "paused" }] }],
    ["job URL", { jobs: [{ ...validScrapeRunDetail.jobs[0], url: "mailto:a@example.com" }] }],
    ["job failure code", { jobs: [{ ...validScrapeRunDetail.jobs[0], failureCode: "unknown" }] }],
    ["job attempts", { jobs: [{ ...validScrapeRunDetail.jobs[0], attemptCount: -1 }] }],
    ["job timestamp", { jobs: [{ ...validScrapeRunDetail.jobs[0], updatedAt: null }] }],
    ["field position", { fields: [{ ...validScrapeRunDetail.fields[0], position: -1 }] }],
    ["field label", { fields: [{ ...validScrapeRunDetail.fields[0], label: "" }] }],
    ["field key", { fields: [{ ...validScrapeRunDetail.fields[0], key: "" }] }],
    ["field description", { fields: [{ ...validScrapeRunDetail.fields[0], description: "" }] }],
    ["stage status", { stages: validScrapeRunDetail.stages.map((stage, index) => index === 0 ? { ...stage, status: "paused" } : stage) }],
    ["stage attempts", { stages: validScrapeRunDetail.stages.map((stage, index) => index === 0 ? { ...stage, attemptCount: 1.5 } : stage) }],
    ["stage failure code", { stages: validScrapeRunDetail.stages.map((stage, index) => index === 0 ? { ...stage, failureCode: "unknown" } : stage) }],
    ["stage timestamp", { stages: validScrapeRunDetail.stages.map((stage, index) => index === 0 ? { ...stage, createdAt: null } : stage) }],
  ])("rejects an invalid %s", (_label, replacement) => {
    expect(
      scrapeRunDetailSchema.safeParse({
        ...validScrapeRunDetail,
        ...replacement,
      }).success,
    ).toBe(false)
  })

  it.each([
    ["missing", validScrapeRunDetail.stages.slice(0, 2)],
    ["unknown", validScrapeRunDetail.stages.map((stage, index) => index === 0 ? { ...stage, stage: "discovery" } : stage)],
    ["duplicate", [validScrapeRunDetail.stages[0], validScrapeRunDetail.stages[0], validScrapeRunDetail.stages[2]]],
    ["misordered", [validScrapeRunDetail.stages[1], validScrapeRunDetail.stages[0], validScrapeRunDetail.stages[2]]],
  ])("rejects %s Run Stages", (_label, stages) => {
    expect(
      scrapeRunDetailSchema.safeParse({ ...validScrapeRunDetail, stages })
        .success,
    ).toBe(false)
  })

  it.each([
    ["no fields", []],
    [
      "no Primary Identifier",
      validScrapeRunDetail.fields.map((field) => ({
        ...field,
        primaryIdentifier: false,
      })),
    ],
    [
      "multiple Primary Identifiers",
      validScrapeRunDetail.fields.map((field) => ({
        ...field,
        required: true,
        primaryIdentifier: true,
      })),
    ],
    [
      "optional Primary Identifier",
      validScrapeRunDetail.fields.map((field, index) =>
        index === 0 ? { ...field, required: false } : field,
      ),
    ],
  ])("rejects extraction fields with %s", (_label, fields) => {
    expect(
      scrapeRunDetailSchema.safeParse({ ...validScrapeRunDetail, fields })
        .success,
    ).toBe(false)
  })

  it.each([
    [
      "misordered field positions",
      {
        fields: [
          validScrapeRunDetail.fields[1],
          validScrapeRunDetail.fields[0],
        ],
      },
    ],
    [
      "duplicate field positions",
      {
        fields: validScrapeRunDetail.fields.map((field) => ({
          ...field,
          position: 0,
        })),
      },
    ],
    [
      "misordered job IDs",
      {
        jobs: [validScrapeRunDetail.jobs[1], validScrapeRunDetail.jobs[0]],
      },
    ],
    [
      "duplicate job IDs",
      {
        jobs: validScrapeRunDetail.jobs.map((job) => ({ ...job, id: 31 })),
      },
    ],
  ])("rejects %s", (_label, replacement) => {
    expect(
      scrapeRunDetailSchema.safeParse({
        ...validScrapeRunDetail,
        ...replacement,
      }).success,
    ).toBe(false)
  })

  it("rejects job counts that do not sum to total", () => {
    expect(
      scrapeRunDetailSchema.safeParse({
        ...validScrapeRunDetail,
        jobCounts: { ...validScrapeRunDetail.jobCounts, total: 6 },
      }).success,
    ).toBe(false)
  })

  it("accepts every known lifecycle value and rejects unknown values", () => {
    for (const status of [
      "pending",
      "in_progress",
      "complete",
      "failed",
      "cancelled",
    ] as const) {
      expect(
        scrapeRunDetailSchema.safeParse({
          ...validScrapeRunDetail,
          status,
        }).success,
      ).toBe(true)
    }

    expect(
      scrapeRunDetailSchema.safeParse({
        ...validScrapeRunDetail,
        status: "paused",
      }).success,
    ).toBe(false)
  })

  it("accepts every Stage status including Skipped", () => {
    for (const status of [
      "pending",
      "in_progress",
      "complete",
      "failed",
      "cancelled",
      "skipped",
    ] as const) {
      const stages = validScrapeRunDetail.stages.map((stage, index) =>
        index === 0 ? { ...stage, status } : stage,
      )
      expect(
        scrapeRunDetailSchema.safeParse({ ...validScrapeRunDetail, stages })
          .success,
      ).toBe(true)
    }
  })

  it("accepts valid nullable values exactly where declared", () => {
    expect(
      scrapeRunDetailSchema.safeParse({
        ...validScrapeRunDetail,
        failureCode: "unexpected_workflow_failure",
        failureMessage: "The run stopped unexpectedly.",
        startedAt: null,
        finishedAt: null,
        jobs: [
          {
            ...validScrapeRunDetail.jobs[0],
            primaryIdentifier: null,
            failureCode: null,
            startedAt: null,
            finishedAt: null,
          },
        ],
      }).success,
    ).toBe(true)
  })
})

describe("Scrape Run API paths", () => {
  it("builds detail, cancellation, and future job-detail paths", () => {
    expect(getScrapeRunDetailApiPath(17)).toBe("/api/scrape-runs/17")
    expect(getScrapeRunCancellationApiPath(17)).toBe(
      "/api/scrape-runs/17/cancel",
    )
    expect(getScrapeJobDetailPath(17, 31)).toBe(
      "/app/scrape-runs/17/scrape-jobs/31",
    )
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

  it("validates detail GET data before returning it", async () => {
    const detailUrl = `${apiUrl}/17`
    server.use(
      http.get(detailUrl, () => HttpResponse.json(validScrapeRunDetail)),
    )

    await expect(fetchScrapeRunDetail(detailUrl)).resolves.toEqual(
      validScrapeRunDetail,
    )
  })

  it("rejects malformed detail JSON before returning it to a cache", async () => {
    const detailUrl = `${apiUrl}/17`
    server.use(
      http.get(detailUrl, () =>
        HttpResponse.json({
          ...validScrapeRunDetail,
          stages: validScrapeRunDetail.stages.slice(0, 2),
        }),
      ),
    )

    await expect(fetchScrapeRunDetail(detailUrl)).rejects.toMatchObject({
      message: "The server returned an invalid response.",
      status: 200,
    })
  })

  it("deletes a Run only for an exact bodyless 204", async () => {
    const detailUrl = `${apiUrl}/17`
    let method: string | undefined
    server.use(
      http.delete(detailUrl, ({ request }) => {
        method = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteScrapeRun(detailUrl)).resolves.toBeUndefined()
    expect(method).toBe("DELETE")
  })

  it.each([
    [401, "Unauthorized."],
    [404, "Scrape run not found."],
    [409, "An active scrape run cannot be deleted."],
  ])("retains safe deletion error details for %s", async (status, message) => {
    const detailUrl = `${apiUrl}/17`
    server.use(
      http.delete(detailUrl, () =>
        HttpResponse.json({ error: message }, { status }),
      ),
    )

    await expect(deleteScrapeRun(detailUrl)).rejects.toMatchObject({
      message,
      status,
    })
  })

  it("uses the status fallback for a non-JSON deletion error", async () => {
    const detailUrl = `${apiUrl}/17`
    server.use(
      http.delete(detailUrl, () =>
        HttpResponse.text("private details", { status: 500 }),
      ),
    )

    await expect(deleteScrapeRun(detailUrl)).rejects.toMatchObject({
      message: "Request failed with status 500.",
      status: 500,
    })
  })

  it("uses the safe deletion fallback for a network failure", async () => {
    const detailUrl = `${apiUrl}/17`
    server.use(http.delete(detailUrl, () => HttpResponse.error()))

    await expect(deleteScrapeRun(detailUrl)).rejects.toMatchObject({
      message: "Unable to delete the scrape run.",
      status: undefined,
    })
  })

  it.each([200, 202])(
    "rejects nominal deletion success status %s",
    async (status) => {
      const detailUrl = `${apiUrl}/17`
      server.use(
        http.delete(detailUrl, () => HttpResponse.json({}, { status })),
      )

      await expect(deleteScrapeRun(detailUrl)).rejects.toMatchObject({
        message: "The server returned an invalid response.",
        status,
      })
    },
  )

  it("posts cancellation and validates the exact 202 response", async () => {
    const cancelUrl = `${apiUrl}/17/cancel`
    server.use(
      http.post(cancelUrl, () =>
        HttpResponse.json({ id: 17, status: "cancelled" }, { status: 202 }),
      ),
    )

    await expect(cancelScrapeRun(cancelUrl)).resolves.toEqual({
      id: 17,
      status: "cancelled",
    })
    expect(
      cancelScrapeRunResponseSchema.safeParse({
        id: 17,
        status: "cancelled",
        finishedAt: "2026-04-01T10:05:00.000Z",
      }).success,
    ).toBe(false)
  })

  it.each([
    [{ id: 0, status: "cancelled" }, "non-positive ID"],
    [{ id: 17, status: "complete" }, "non-cancelled status"],
    [{ id: 17 }, "missing status"],
  ])("rejects a malformed cancellation response with %s", async (body, _label) => {
    const cancelUrl = `${apiUrl}/17/cancel`
    server.use(
      http.post(cancelUrl, () => HttpResponse.json(body, { status: 202 })),
    )

    await expect(cancelScrapeRun(cancelUrl)).rejects.toMatchObject({
      message: "The server returned an invalid response.",
      status: 202,
    })
  })

  it("rejects a successful cancellation response with the wrong status code", async () => {
    const cancelUrl = `${apiUrl}/17/cancel`
    server.use(
      http.post(cancelUrl, () =>
        HttpResponse.json({ id: 17, status: "cancelled" }),
      ),
    )

    await expect(cancelScrapeRun(cancelUrl)).rejects.toMatchObject({
      message: "The server returned an invalid response.",
      status: 200,
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
