import { http, HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import {
  deleteScrapeJob,
  fetchScrapeJobDetail,
  getScrapeJobDetailApiPath,
  scrapeJobDetailSchema,
  ScrapeRunApiError,
} from "@/lib/scrape-runs/api-contracts"
import { server } from "@/tests/mocks/server"

const detailUrl = "http://localhost/api/scrape-runs/17/scrape-jobs/31"

const validScrapeJobDetail = {
  id: 31,
  url: "https://www.example.com/customers/acme",
  status: "complete",
  attemptCount: 1,
  result: {
    client_name: "Acme",
    industry: "Software",
    summary: null,
  },
  missingRequiredFieldKeys: null,
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-04-01T10:02:00.000Z",
  updatedAt: "2026-04-01T10:03:00.000Z",
  startedAt: "2026-04-01T10:02:10.000Z",
  finishedAt: "2026-04-01T10:03:00.000Z",
  scrapeRun: {
    id: 17,
    name: "Customer stories",
    status: "complete",
  },
  fields: [
    {
      position: 0,
      label: "Client Name",
      key: "client_name",
      description: "The customer name",
      required: true,
      primaryIdentifier: true,
    },
    {
      position: 1,
      label: "Industry",
      key: "industry",
      description: "The customer industry",
      required: true,
      primaryIdentifier: false,
    },
    {
      position: 2,
      label: "Summary",
      key: "summary",
      description: "A short summary",
      required: false,
      primaryIdentifier: false,
    },
  ],
} as const

describe("Scrape Job detail frontend contract", () => {
  it("accepts one complete strict self-contained response", () => {
    expect(scrapeJobDetailSchema.parse(validScrapeJobDetail)).toEqual(
      validScrapeJobDetail,
    )
    expect(
      scrapeJobDetailSchema.safeParse({
        ...validScrapeJobDetail,
        workflowRunId: "wfr_secret",
      }).success,
    ).toBe(false)
  })

  it.each([
    "pending",
    "in_progress",
    "complete",
    "failed",
    "cancelled",
  ] as const)("accepts parent Run status %s", (status) => {
    expect(
      scrapeJobDetailSchema.safeParse({
        ...validScrapeJobDetail,
        scrapeRun: { ...validScrapeJobDetail.scrapeRun, status },
      }).success,
    ).toBe(true)
  })

  it.each([
    ["Job ID", { id: 0 }],
    ["non-integer Job ID", { id: 1.5 }],
    ["Run ID", { scrapeRun: { ...validScrapeJobDetail.scrapeRun, id: -1 } }],
    [
      "non-integer Run ID",
      { scrapeRun: { ...validScrapeJobDetail.scrapeRun, id: 1.5 } },
    ],
    [
      "Run name",
      { scrapeRun: { ...validScrapeJobDetail.scrapeRun, name: "" } },
    ],
    [
      "Run status",
      { scrapeRun: { ...validScrapeJobDetail.scrapeRun, status: "paused" } },
    ],
    ["Job URL", { url: "ftp://example.com/customer" }],
    ["status", { status: "paused" }],
    ["attempt count", { attemptCount: -1 }],
    ["non-integer attempt count", { attemptCount: 1.5 }],
    ["failure code", { failureCode: "provider_exploded" }],
    ["created timestamp", { createdAt: "yesterday" }],
    ["nullable timestamp", { startedAt: "soon" }],
    [
      "field position",
      { fields: [{ ...validScrapeJobDetail.fields[0], position: -1 }] },
    ],
    [
      "non-integer field position",
      { fields: [{ ...validScrapeJobDetail.fields[0], position: 0.5 }] },
    ],
    [
      "field label",
      { fields: [{ ...validScrapeJobDetail.fields[0], label: "" }] },
    ],
    [
      "field key",
      { fields: [{ ...validScrapeJobDetail.fields[0], key: "Client Name" }] },
    ],
    [
      "field description",
      { fields: [{ ...validScrapeJobDetail.fields[0], description: "" }] },
    ],
  ])("rejects an invalid %s", (_label, replacement) => {
    expect(
      scrapeJobDetailSchema.safeParse({
        ...validScrapeJobDetail,
        ...replacement,
      }).success,
    ).toBe(false)
  })

  it.each([
    ["no fields", []],
    [
      "no Primary Identifier",
      validScrapeJobDetail.fields.map((field) => ({
        ...field,
        primaryIdentifier: false,
      })),
    ],
    [
      "multiple Primary Identifiers",
      validScrapeJobDetail.fields.map((field) => ({
        ...field,
        primaryIdentifier: field.required,
      })),
    ],
    [
      "an optional Primary Identifier",
      validScrapeJobDetail.fields.map((field, index) =>
        index === 0 ? { ...field, required: false } : field,
      ),
    ],
    [
      "misordered positions",
      [
        validScrapeJobDetail.fields[1],
        validScrapeJobDetail.fields[0],
        validScrapeJobDetail.fields[2],
      ],
    ],
    [
      "duplicate positions",
      validScrapeJobDetail.fields.map((field) => ({
        ...field,
        position: 0,
      })),
    ],
    [
      "duplicate keys",
      validScrapeJobDetail.fields.map((field) => ({
        ...field,
        key: "client_name",
      })),
    ],
  ])("rejects fields with %s", (_label, fields) => {
    expect(
      scrapeJobDetailSchema.safeParse({
        ...validScrapeJobDetail,
        fields,
      }).success,
    ).toBe(false)
  })

  it.each([
    ["a missing configured key", { client_name: "Acme", industry: "Software" }],
    [
      "an extra key",
      {
        ...validScrapeJobDetail.result,
        provider_metadata: "private",
      },
    ],
    [
      "a null required value",
      { ...validScrapeJobDetail.result, industry: null },
    ],
    ["a non-string value", { ...validScrapeJobDetail.result, industry: 42 }],
  ])("rejects a complete result with %s", (_label, result) => {
    expect(
      scrapeJobDetailSchema.safeParse({
        ...validScrapeJobDetail,
        result,
      }).success,
    ).toBe(false)
  })

  it("requires configured result keys to be own properties", () => {
    expect(
      scrapeJobDetailSchema.safeParse({
        ...validScrapeJobDetail,
        fields: [
          {
            ...validScrapeJobDetail.fields[0],
            key: "constructor",
          },
          validScrapeJobDetail.fields[2],
        ],
        result: {
          summary: "A summary",
          private_data: "Must not replace a configured key",
        },
      }).success,
    ).toBe(false)
  })

  it("requires a null result for every non-complete lifecycle status", () => {
    for (const status of [
      "pending",
      "in_progress",
      "failed",
      "cancelled",
    ] as const) {
      expect(
        scrapeJobDetailSchema.safeParse({
          ...validScrapeJobDetail,
          status,
        }).success,
      ).toBe(false)
      expect(
        scrapeJobDetailSchema.safeParse({
          ...validScrapeJobDetail,
          status,
          result: null,
        }).success,
      ).toBe(true)
    }
  })

  it("accepts all known statuses with their valid result shape", () => {
    for (const status of [
      "pending",
      "in_progress",
      "complete",
      "failed",
      "cancelled",
    ] as const) {
      expect(
        scrapeJobDetailSchema.safeParse({
          ...validScrapeJobDetail,
          status,
          result: status === "complete" ? validScrapeJobDetail.result : null,
        }).success,
      ).toBe(true)
    }
  })

  it("accepts only configured Required Extraction Fields in missing diagnostics", () => {
    expect(
      scrapeJobDetailSchema.safeParse({
        ...validScrapeJobDetail,
        status: "failed",
        result: null,
        failureCode: "missing_required_fields",
        missingRequiredFieldKeys: ["client_name", "industry"],
      }).success,
    ).toBe(true)

    for (const missingRequiredFieldKeys of [["summary"], ["unknown_key"]]) {
      expect(
        scrapeJobDetailSchema.safeParse({
          ...validScrapeJobDetail,
          status: "failed",
          result: null,
          failureCode: "missing_required_fields",
          missingRequiredFieldKeys,
        }).success,
      ).toBe(false)
    }
  })
})

describe("Scrape Job detail API path and fetcher", () => {
  it("builds the nested API path separately from the frontend path", () => {
    expect(getScrapeJobDetailApiPath(17, 31)).toBe(
      "/api/scrape-runs/17/scrape-jobs/31",
    )
  })

  it.each([
    "pending",
    "in_progress",
    "complete",
    "failed",
    "cancelled",
  ] as const)(
    "validates and returns a self-contained %s response against the expected route IDs",
    async (status) => {
      const detail = {
        ...validScrapeJobDetail,
        status,
        result: status === "complete" ? validScrapeJobDetail.result : null,
      }
      server.use(http.get(detailUrl, () => HttpResponse.json(detail)))

      await expect(fetchScrapeJobDetail(detailUrl, 17, 31)).resolves.toEqual(
        detail,
      )
    },
  )

  it.each([
    ["Run ID", 18, 31],
    ["Job ID", 17, 32],
  ])(
    "rejects a response whose %s does not match the route",
    async (_label, runId, jobId) => {
      server.use(
        http.get(detailUrl, () => HttpResponse.json(validScrapeJobDetail)),
      )

      await expect(
        fetchScrapeJobDetail(detailUrl, runId, jobId),
      ).rejects.toMatchObject({
        message: "The server returned an invalid response.",
        status: 200,
      })
    },
  )

  it("rejects malformed JSON without exposing validation internals", async () => {
    server.use(
      http.get(detailUrl, () =>
        HttpResponse.json({
          ...validScrapeJobDetail,
          result: { client_name: null },
        }),
      ),
    )

    const error = await fetchScrapeJobDetail(detailUrl, 17, 31).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ScrapeRunApiError)
    expect(error).toMatchObject({
      message: "The server returned an invalid response.",
      status: 200,
    })
  })

  it("retains a safe API error from an unsuccessful response", async () => {
    server.use(
      http.get(detailUrl, () =>
        HttpResponse.json({ error: "Scrape job not found." }, { status: 404 }),
      ),
    )

    await expect(fetchScrapeJobDetail(detailUrl, 17, 31)).rejects.toMatchObject(
      {
        message: "Scrape job not found.",
        status: 404,
      },
    )
  })

  it("uses a safe message for network failures", async () => {
    server.use(http.get(detailUrl, () => HttpResponse.error()))

    await expect(fetchScrapeJobDetail(detailUrl, 17, 31)).rejects.toMatchObject(
      {
        message: "Unable to load the scrape job.",
        status: undefined,
      },
    )
  })
})

describe("Scrape Job deletion API contract", () => {
  it("sends DELETE and accepts only an exact 204", async () => {
    let method = ""
    server.use(
      http.delete(detailUrl, ({ request }) => {
        method = request.method
        return new HttpResponse(null, { status: 204 })
      }),
    )

    await expect(deleteScrapeJob(detailUrl)).resolves.toBeUndefined()
    expect(method).toBe("DELETE")
  })

  it.each([200, 202])("rejects successful status %s", async (status) => {
    server.use(http.delete(detailUrl, () => HttpResponse.json({}, { status })))

    await expect(deleteScrapeJob(detailUrl)).rejects.toMatchObject({
      message: "The server returned an invalid response.",
      status,
    })
  })

  it("retains safe server errors", async () => {
    server.use(
      http.delete(detailUrl, () =>
        HttpResponse.json(
          { error: "A Scrape Job in an active scrape run cannot be deleted." },
          { status: 409 },
        ),
      ),
    )

    await expect(deleteScrapeJob(detailUrl)).rejects.toMatchObject({
      message: "A Scrape Job in an active scrape run cannot be deleted.",
      status: 409,
    })
  })

  it("uses a safe message for network failures", async () => {
    server.use(http.delete(detailUrl, () => HttpResponse.error()))

    await expect(deleteScrapeJob(detailUrl)).rejects.toMatchObject({
      message: "Unable to delete the scrape job.",
      status: undefined,
    })
  })
})
