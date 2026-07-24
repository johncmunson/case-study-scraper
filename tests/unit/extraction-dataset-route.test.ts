import { writeToString } from "fast-csv"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { GET as getExtractionDataset } from "@/app/api/scrape-runs/[runId]/extraction-dataset/route"
import { findOwnedScrapeRunExtractionDatasetSource } from "@/lib/server/scrape-runs/extraction-dataset-repository"

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock("@/lib/server/scrape-runs/extraction-dataset-repository", () => ({
  findOwnedScrapeRunExtractionDatasetSource: vi.fn(),
}))

vi.mock("fast-csv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fast-csv")>()

  return { ...actual, writeToString: vi.fn() }
})

const source = {
  id: 17,
  name: "Café / Customer Stories",
  status: "complete" as const,
  fields: [
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
  ],
  successfulJobs: [
    {
      canonicalPageUrl: "https://example.com/customers/zeta",
      result: { industry: null, client: "Zeta" },
    },
    {
      canonicalPageUrl: "https://example.com/customers/acme",
      result: { industry: "Software, Services", client: "Acme" },
    },
  ],
}

function runContext(runId = "17") {
  return { params: Promise.resolve({ runId }) }
}

function request(format?: string) {
  const url = new URL(
    "http://localhost/api/scrape-runs/17/extraction-dataset",
  )

  if (format !== undefined) {
    url.searchParams.set("format", format)
  }

  return new Request(url)
}

beforeEach(async () => {
  const actualCsv = await vi.importActual<typeof import("fast-csv")>("fast-csv")
  vi.mocked(writeToString).mockImplementation(actualCsv.writeToString)
  vi.mocked(getCurrentSession).mockResolvedValue({
    user: { id: "42" },
  } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)
  vi.mocked(findOwnedScrapeRunExtractionDatasetSource).mockResolvedValue(source)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe("Extraction Dataset route", () => {
  it("returns 401 without a session before parsing or reading dataset state", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)

    const response = await getExtractionDataset(request(), runContext())

    expect(response.status).toBe(401)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." })
    expect(findOwnedScrapeRunExtractionDatasetSource).not.toHaveBeenCalled()
  })

  it.each([undefined, "", "xml", "CSV"]) (
    "returns 400 for unsupported format %j without reading the Run",
    async (format) => {
      const response = await getExtractionDataset(request(format), runContext())

      expect(response.status).toBe(400)
      expect(response.headers.get("Cache-Control")).toBe("private, no-store")
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
      await expect(response.json()).resolves.toEqual({
        error: "A supported Extraction Dataset format is required.",
      })
      expect(findOwnedScrapeRunExtractionDatasetSource).not.toHaveBeenCalled()
    },
  )

  it.each(["not-a-run", "0", "-1", "17.5", "9007199254740992"])(
    "returns the private 404 for invalid Run ID %s",
    async (runId) => {
      const response = await getExtractionDataset(request("csv"), runContext(runId))

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        error: "Scrape run not found.",
      })
      expect(findOwnedScrapeRunExtractionDatasetSource).not.toHaveBeenCalled()
    },
  )

  it("returns the same 404 for a missing or non-owned Run", async () => {
    vi.mocked(findOwnedScrapeRunExtractionDatasetSource).mockResolvedValue(null)

    const response = await getExtractionDataset(request("json"), runContext())

    expect(findOwnedScrapeRunExtractionDatasetSource).toHaveBeenCalledWith({
      userId: 42,
      scrapeRunId: 17,
    })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: "Scrape run not found.",
    })
  })

  it.each(["pending", "in_progress"] as const)(
    "returns 409 for an active %s Run even when successful results exist",
    async (status) => {
      vi.mocked(findOwnedScrapeRunExtractionDatasetSource).mockResolvedValue({
        ...source,
        status,
      })

      const response = await getExtractionDataset(request("json"), runContext())

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error:
          "The Extraction Dataset is available after the Scrape Run finishes.",
      })
    },
  )

  it.each(["complete", "failed", "cancelled"] as const)(
    "returns 409 for a terminal %s Run without successful results",
    async (status) => {
      vi.mocked(findOwnedScrapeRunExtractionDatasetSource).mockResolvedValue({
        ...source,
        status,
        successfulJobs: [],
      })

      const response = await getExtractionDataset(request("csv"), runContext())

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error: "No successful results are available to download.",
      })
    },
  )

  it("returns a pretty, successful-only JSON attachment with private response headers", async () => {
    const response = await getExtractionDataset(request("json"), runContext())

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    )
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="cafe-customer-stories-17.json"',
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")

    const body = await response.text()
    expect(body).toBe(
      `[
  {
    "canonicalPageUrl": "https://example.com/customers/acme",
    "fields": {
      "client": "Acme",
      "industry": "Software, Services"
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
    expect(body).not.toContain("Café / Customer Stories")
    expect(body).not.toContain('"id"')
    expect(body).not.toContain('"status"')
    expect(body).not.toContain("failure")
  })

  it.each(["complete", "failed", "cancelled"] as const)(
    "downloads preserved successful results from an eligible %s Run",
    async (status) => {
      vi.mocked(findOwnedScrapeRunExtractionDatasetSource).mockResolvedValue({
        ...source,
        status,
      })

      const response = await getExtractionDataset(request("json"), runContext())

      expect(response.status).toBe(200)
      expect(await response.json()).toHaveLength(2)
    },
  )

  it("returns a BOM-prefixed CRLF CSV attachment with ordered labels and blank Missing Values", async () => {
    const response = await getExtractionDataset(request("csv"), runContext())

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe(
      "text/csv; charset=utf-8",
    )
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="cafe-customer-stories-17.csv"',
    )
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
    const body = Buffer.from(await response.arrayBuffer()).toString("utf8")
    expect(body).toBe(
      "\ufeffCanonical Page URL (source),Client,Industry\r\n" +
        'https://example.com/customers/acme,Acme,"Software, Services"\r\n' +
        "https://example.com/customers/zeta,Zeta,",
    )
  })

  it.each([
    [{ client: "Acme" }, "field-keys-mismatch"],
    [{ client: null, industry: null }, "required-field-missing"],
  ] as const)(
    "returns a safe 500 for inconsistent stored results: %s",
    async (result, failureReason) => {
      vi.mocked(findOwnedScrapeRunExtractionDatasetSource).mockResolvedValue({
        ...source,
        successfulJobs: [
          {
            canonicalPageUrl: "https://example.com/customers/acme",
            result,
          },
        ],
      })

      const response = await getExtractionDataset(request("json"), runContext())

      expect(response.status).toBe(500)
      expect(response.headers.get("Cache-Control")).toBe("private, no-store")
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
      await expect(response.json()).resolves.toEqual({
        error: "The Extraction Dataset could not be generated.",
      })
      expect(console.error).toHaveBeenCalledWith(
        "Extraction Dataset generation failed.",
        expect.objectContaining({
          scrapeRunId: 17,
          format: "json",
          recordCount: 1,
          failureCategory: `invalid-stored-result:${failureReason}`,
        }),
      )
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "Acme",
      )
    },
  )

  it.each([
    {
      format: "json" as const,
      failSerialization: () =>
        vi.spyOn(JSON, "stringify").mockImplementationOnce(() => {
          throw new Error("sensitive extracted value")
        }),
    },
    {
      format: "csv" as const,
      failSerialization: () =>
        vi
          .mocked(writeToString)
          .mockRejectedValueOnce(new Error("sensitive extracted value")),
    },
  ])(
    "returns a safe 500 and safe diagnostics when $format serialization fails",
    async ({ format, failSerialization }) => {
      failSerialization()

      const response = await getExtractionDataset(request(format), runContext())

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({
        error: "The Extraction Dataset could not be generated.",
      })
      expect(console.error).toHaveBeenCalledWith(
        "Extraction Dataset generation failed.",
        expect.objectContaining({
          scrapeRunId: 17,
          format,
          recordCount: 2,
          failureCategory: "serialization-failed",
        }),
      )
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
        "sensitive extracted value",
      )
    },
  )

  it("returns a safe 500 and does not log database errors or extracted values when loading fails", async () => {
    vi.mocked(findOwnedScrapeRunExtractionDatasetSource).mockRejectedValue(
      new Error("SQL failed near sensitive extracted value"),
    )

    const response = await getExtractionDataset(request("csv"), runContext())

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: "The Extraction Dataset could not be generated.",
    })
    expect(console.error).toHaveBeenCalledWith(
      "Extraction Dataset generation failed.",
      expect.objectContaining({
        scrapeRunId: 17,
        format: "csv",
        failureCategory: "dataset-load-failed",
      }),
    )
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      "sensitive extracted value",
    )
  })
})
