import { describe, expect, it } from "vitest"

import { newScrapeRunSchema } from "@/lib/scrape-runs/new-scrape-run"

const validPayload = {
  name: "Case studies",
  url: "https://example.com/case-studies",
  exampleUrls: [
    "https://example.com/case-studies/one",
    "https://example.com/case-studies/two",
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

describe("newScrapeRunSchema", () => {
  it("accepts a valid scrape run", () => {
    expect(newScrapeRunSchema.safeParse(validPayload).success).toBe(true)
  })

  it("rejects non-HTTP URLs and too few example URLs", () => {
    const result = newScrapeRunSchema.safeParse({
      ...validPayload,
      url: "ftp://example.com/case-studies",
      exampleUrls: ["https://example.com/one"],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Must be a valid HTTP or HTTPS URL.",
          "At least 2 example URLs are required.",
        ]),
      )
    }
  })

  it("requires exactly one primary identifier", () => {
    const result = newScrapeRunSchema.safeParse({
      ...validPayload,
      fields: [
        { ...validPayload.fields[0], primaryIdentifier: false },
        {
          label: "Title",
          description: "The case study title",
          required: true,
          primaryIdentifier: false,
        },
      ],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Exactly one field must be the primary identifier.",
      )
    }
  })

  it("requires the primary identifier to be required", () => {
    const result = newScrapeRunSchema.safeParse({
      ...validPayload,
      fields: [{ ...validPayload.fields[0], required: false }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "The primary identifier field must be required.",
      )
    }
  })
})
