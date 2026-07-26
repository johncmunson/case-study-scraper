import { describe, expect, expectTypeOf, it } from "vitest"

import {
  buildExtractionDataset,
  getExtractionDatasetApiPath,
  getExtractionDatasetAvailability,
  getExtractionDatasetFilename,
  type ExtractionDatasetRecord,
} from "@/lib/scrape-runs/extraction-dataset"
import type { ScrapeRunStatus } from "@/lib/scrape-runs/contracts"

const fields = [
  {
    position: 1,
    label: "Industry",
    key: "industry",
    required: false,
  },
  {
    position: 0,
    label: "Client",
    key: "client",
    required: true,
  },
] as const

describe("Extraction Dataset contracts", () => {
  it.each([
    ["pending", 0, "active-run"],
    ["pending", 1, "active-run"],
    ["in_progress", 0, "active-run"],
    ["in_progress", 1, "active-run"],
    ["complete", 0, "no-successful-results"],
    ["failed", 0, "no-successful-results"],
    ["cancelled", 0, "no-successful-results"],
    ["complete", 1, "available"],
    ["failed", 1, "available"],
    ["cancelled", 1, "available"],
  ] satisfies ReadonlyArray<readonly [ScrapeRunStatus, number, string]>)(
    "classifies a %s Run with %i successful Jobs as %s",
    (status, successfulResultCount, expected) => {
      expect(
        getExtractionDatasetAvailability(status, successfulResultCount),
      ).toBe(expected)
    },
  )

  it("builds records in Canonical Page URL order with fields in configured order", () => {
    const result = buildExtractionDataset({
      status: "complete",
      fields,
      successfulJobs: [
        {
          canonicalPageUrl: "https://example.com/customers/zeta",
          result: { industry: null, client: "Zeta" },
        },
        {
          canonicalPageUrl: "https://example.com/customers/acme",
          result: { industry: "Software", client: "Acme" },
        },
      ],
    })

    expect(result).toEqual({
      status: "available",
      records: [
        {
          canonicalPageUrl: "https://example.com/customers/acme",
          fields: { client: "Acme", industry: "Software" },
        },
        {
          canonicalPageUrl: "https://example.com/customers/zeta",
          fields: { client: "Zeta", industry: null },
        },
      ],
    })

    if (result.status === "available") {
      expect(Object.keys(result.records[0].fields)).toEqual([
        "client",
        "industry",
      ])
    }
  })

  it("returns unavailable outcomes before validating partial Active Run results", () => {
    expect(
      buildExtractionDataset({
        status: "in_progress",
        fields,
        successfulJobs: [
          {
            canonicalPageUrl: "https://example.com/customers/acme",
            result: { corrupt: true },
          },
        ],
      }),
    ).toEqual({ status: "unavailable", reason: "active-run" })

    expect(
      buildExtractionDataset({
        status: "failed",
        fields,
        successfulJobs: [],
      }),
    ).toEqual({
      status: "unavailable",
      reason: "no-successful-results",
    })
  })

  it.each([
    [null, "result-not-object"],
    [[], "result-not-object"],
    ["not an object", "result-not-object"],
    [{ client: "Acme" }, "field-keys-mismatch"],
    [
      { client: "Acme", industry: null, unexpected: "value" },
      "field-keys-mismatch",
    ],
    [{ client: "Acme", industry: 42 }, "field-value-invalid"],
    [{ client: null, industry: "Software" }, "required-field-missing"],
  ] as const)(
    "rejects an inconsistent stored result: %s",
    (storedResult, reason) => {
      expect(
        buildExtractionDataset({
          status: "complete",
          fields,
          successfulJobs: [
            {
              canonicalPageUrl: "https://example.com/customers/acme",
              result: storedResult,
            },
          ],
        }),
      ).toEqual({ status: "invalid", reason })
    },
  )

  it("creates explicit format API paths", () => {
    expect(getExtractionDatasetApiPath(42, "csv")).toBe(
      "/api/scrape-runs/42/extraction-dataset?format=csv",
    )
    expect(getExtractionDatasetApiPath("42", "json")).toBe(
      "/api/scrape-runs/42/extraction-dataset?format=json",
    )
  })

  it.each([
    ["Acme Case Studies", 42, "csv", "acme-case-studies-42.csv"],
    ["Acme Case Studies", 43, "json", "acme-case-studies-43.json"],
    [
      "  Café / Customer \\ Stories  ",
      7,
      "json",
      "cafe-customer-stories-7.json",
    ],
    ["one---two___three", 8, "csv", "one-two-three-8.csv"],
    ["../../\u0000", 9, "json", "scrape-run-9.json"],
  ] as const)(
    "creates a safe filename from %j",
    (runName, runId, format, expected) => {
      expect(getExtractionDatasetFilename(runName, runId, format)).toBe(
        expected,
      )
    },
  )

  it("keeps identically named Runs distinguishable by ID", () => {
    expect(getExtractionDatasetFilename("Customers", 1, "csv")).not.toBe(
      getExtractionDatasetFilename("Customers", 2, "csv"),
    )
  })

  it("exposes the nested record contract", () => {
    expectTypeOf<ExtractionDatasetRecord>().toEqualTypeOf<
      Readonly<{
        canonicalPageUrl: string
        fields: Readonly<Record<string, string | null>>
      }>
    >()
  })
})
