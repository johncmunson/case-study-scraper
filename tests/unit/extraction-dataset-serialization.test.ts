import { writeToString } from "fast-csv"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type {
  ExtractionDatasetField,
  ExtractionDatasetRecord,
} from "@/lib/scrape-runs/extraction-dataset"
import {
  EXTRACTION_DATASET_SOURCE_HEADER,
  ExtractionDatasetSerializationError,
  serializeExtractionDatasetCsv,
  serializeExtractionDatasetJson,
} from "@/lib/server/scrape-runs/extraction-dataset-serialization"

vi.mock("fast-csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fast-csv")>()

  return { ...actual, writeToString: vi.fn() }
})

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
] satisfies readonly ExtractionDatasetField[]

const records = [
  {
    canonicalPageUrl: "https://example.com/customers/acme",
    fields: { client: "Acme", industry: "Software" },
  },
  {
    canonicalPageUrl: "https://example.com/customers/zeta",
    fields: { client: "Zeta", industry: null },
  },
] satisfies readonly ExtractionDatasetRecord[]

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("fast-csv")>("fast-csv")
  vi.mocked(writeToString).mockImplementation(actual.writeToString)
})

describe("Extraction Dataset serialization", () => {
  it("pretty-prints JSON with nested ordered Field Keys and Missing Values", () => {
    const output = serializeExtractionDatasetJson(records)

    expect(output).toBe(
      `[
  {
    "canonicalPageUrl": "https://example.com/customers/acme",
    "fields": {
      "client": "Acme",
      "industry": "Software"
    }
  },
  {
    "canonicalPageUrl": "https://example.com/customers/zeta",
    "fields": {
      "client": "Zeta",
      "industry": null
    }
  }
]`,
    )
    expect(Buffer.from(output).subarray(0, 3)).not.toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    )
  })

  it("wraps JSON generation failures without exposing the original error message", () => {
    const originalError = new Error("sensitive extracted value")
    vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
      throw originalError
    })

    expect(() => serializeExtractionDatasetJson(records)).toThrow(
      expect.objectContaining({
        name: "ExtractionDatasetSerializationError",
        format: "json",
        message: "Failed to serialize the Extraction Dataset as json.",
        cause: originalError,
      }),
    )
  })

  it("writes the source header and configured Field Labels in position order", async () => {
    await expect(serializeExtractionDatasetCsv(fields, records)).resolves.toBe(
      `\ufeff${EXTRACTION_DATASET_SOURCE_HEADER},Client,Industry\r\n` +
        "https://example.com/customers/acme,Acme,Software\r\n" +
        "https://example.com/customers/zeta,Zeta,",
    )
  })

  it("uses a UTF-8 BOM, CRLF row delimiters, Unicode, CSV quoting, and exact formula-like values", async () => {
    const output = await serializeExtractionDatasetCsv(
      [
        { position: 0, label: "Comma", key: "comma", required: false },
        { position: 1, label: "Quote", key: "quote", required: false },
        { position: 2, label: "LF", key: "lf", required: false },
        { position: 3, label: "CR", key: "cr", required: false },
        { position: 4, label: "CRLF", key: "crlf", required: false },
        { position: 5, label: "Unicode", key: "unicode", required: false },
        { position: 6, label: "Missing", key: "missing", required: false },
        { position: 7, label: "Formula", key: "formula", required: false },
      ],
      [
        {
          canonicalPageUrl: "https://example.com/customers/acme",
          fields: {
            comma: "Software, Services",
            quote: `Acme "Global"`,
            lf: "line one\nline two",
            cr: "line one\rline two",
            crlf: "line one\r\nline two",
            unicode: "Café 東京",
            missing: null,
            formula: "=SUM(A1:A2)",
          },
        },
      ],
    )

    expect(Buffer.from(output).subarray(0, 3)).toEqual(
      Buffer.from([0xef, 0xbb, 0xbf]),
    )
    expect(output).toBe(
      "\ufeffCanonical Page URL (source),Comma,Quote,LF,CR,CRLF,Unicode,Missing,Formula\r\n" +
        'https://example.com/customers/acme,"Software, Services","Acme ""Global""",' +
        '"line one\nline two","line one\rline two","line one\r\nline two",' +
        "Café 東京,,=SUM(A1:A2)",
    )
  })

  it("turns fast-csv failures into safe generation failures", async () => {
    const originalError = new Error("sensitive extracted value")
    vi.mocked(writeToString).mockRejectedValueOnce(originalError)

    await expect(
      serializeExtractionDatasetCsv(fields, records),
    ).rejects.toEqual(
      expect.objectContaining({
        name: "ExtractionDatasetSerializationError",
        format: "csv",
        message: "Failed to serialize the Extraction Dataset as csv.",
        cause: originalError,
      } satisfies Partial<ExtractionDatasetSerializationError>),
    )
  })
})
