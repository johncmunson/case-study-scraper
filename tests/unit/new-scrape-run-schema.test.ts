import { describe, expect, it } from "vitest"

import {
  generateFieldKey,
  newScrapeRunSchema,
} from "@/lib/scrape-runs/new-scrape-run"

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

function getMessages(payload: unknown) {
  const result = newScrapeRunSchema.safeParse(payload)
  expect(result.success).toBe(false)

  if (result.success) {
    return []
  }

  return result.error.issues.map((issue) => issue.message)
}

function createFields(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    label: `F${index}`,
    description: `Field ${index}`,
    required: index === 0,
    primaryIdentifier: index === 0,
  }))
}

describe("newScrapeRunSchema", () => {
  it("normalizes a valid payload into an immutable Run Configuration", () => {
    const result = newScrapeRunSchema.safeParse({
      ...validPayload,
      name: "  Case studies  ",
      url: "https://EXAMPLE.com:443/case-studies?source=test#top",
      exampleUrls: [
        "https://example.com:443/case-studies/one/?source=test",
        "https://EXAMPLE.com/case-studies/two#results",
      ],
      fields: [
        {
          ...validPayload.fields[0],
          label: "  Client Name  ",
          description: "  The company name  ",
        },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        name: "Case studies",
        url: "https://example.com/",
        exampleUrls: [
          "https://example.com/case-studies/one",
          "https://example.com/case-studies/two",
        ],
        fields: [
          {
            label: "Client Name",
            key: "client_name",
            description: "The company name",
            required: true,
            primaryIdentifier: true,
          },
        ],
      })
      expect(Object.isFrozen(result.data)).toBe(true)
      expect(Object.isFrozen(result.data.exampleUrls)).toBe(true)
      expect(Object.isFrozen(result.data.fields)).toBe(true)
      expect(Object.isFrozen(result.data.fields[0])).toBe(true)
    }
  })

  it("enforces the inclusive name boundaries after trimming", () => {
    expect(
      newScrapeRunSchema.safeParse({ ...validPayload, name: "a" }).success,
    ).toBe(true)
    expect(
      newScrapeRunSchema.safeParse({
        ...validPayload,
        name: "a".repeat(100),
      }).success,
    ).toBe(true)

    expect(getMessages({ ...validPayload, name: "   " })).toContain(
      "Name is required.",
    )
    expect(getMessages({ ...validPayload, name: "a".repeat(101) })).toContain(
      "Name must contain at most 100 characters.",
    )
  })

  it("enforces the submitted URL length boundary before trimming", () => {
    const prefix = "https://example.com/"
    const atLimit = `${prefix}${"a".repeat(2_048 - prefix.length)}`

    expect(
      newScrapeRunSchema.safeParse({ ...validPayload, url: atLimit }).success,
    ).toBe(true)
    expect(getMessages({ ...validPayload, url: `${atLimit}a` })).toContain(
      "URLs must contain at most 2,048 characters.",
    )
    expect(
      getMessages({
        ...validPayload,
        exampleUrls: [` ${atLimit}`, validPayload.exampleUrls[1]],
      }),
    ).toContain("URLs must contain at most 2,048 characters.")
  })

  it("enforces the example-page count boundaries", () => {
    const fiveExamples = Array.from(
      { length: 5 },
      (_, index) => `https://example.com/${index}`,
    )

    expect(
      newScrapeRunSchema.safeParse({
        ...validPayload,
        exampleUrls: fiveExamples,
      }).success,
    ).toBe(true)
    expect(
      getMessages({
        ...validPayload,
        exampleUrls: ["https://example.com/one"],
      }),
    ).toContain("At least 2 example URLs are required.")
    expect(
      getMessages({
        ...validPayload,
        exampleUrls: [...fiveExamples, "https://example.com/extra"],
      }),
    ).toContain("At most 5 example URLs are allowed.")
  })

  it("enforces the extraction-field count boundaries", () => {
    expect(
      newScrapeRunSchema.safeParse({
        ...validPayload,
        fields: createFields(10),
      }).success,
    ).toBe(true)
    expect(getMessages({ ...validPayload, fields: [] })).toContain(
      "At least 1 field to extract is required.",
    )
    expect(
      getMessages({ ...validPayload, fields: createFields(11) }),
    ).toContain("At most 10 fields to extract are allowed.")
  })

  it("enforces field label and description length boundaries", () => {
    const boundaryFields = [
      {
        label: "Ab",
        description: "ab",
        required: true,
        primaryIdentifier: true,
      },
      {
        label: "A".repeat(30),
        description: "a".repeat(100),
        required: false,
        primaryIdentifier: false,
      },
    ]

    expect(
      newScrapeRunSchema.safeParse({ ...validPayload, fields: boundaryFields })
        .success,
    ).toBe(true)

    expect(
      getMessages({
        ...validPayload,
        fields: [{ ...boundaryFields[0], label: "A", description: "a" }],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Field labels must contain at least 2 characters.",
        "Field descriptions must contain at least 2 characters.",
      ]),
    )
    expect(
      getMessages({
        ...validPayload,
        fields: [
          {
            ...boundaryFields[0],
            label: "A".repeat(31),
            description: "a".repeat(101),
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Field labels must contain at most 30 characters.",
        "Field descriptions must contain at most 100 characters.",
      ]),
    )
  })

  it.each(["Two  Spaces", "Under_score", "Hyphen-Name", "Café"])(
    "rejects invalid Field Label %j",
    (label) => {
      expect(
        getMessages({
          ...validPayload,
          fields: [{ ...validPayload.fields[0], label }],
        }),
      ).toContain(
        "Field labels may contain only letters, numbers, and single spaces between words.",
      )
    },
  )

  it("allows numeric-leading Field Keys and generates stable snake_case keys", () => {
    expect(generateFieldKey("123 Project Name")).toBe("123_project_name")

    const result = newScrapeRunSchema.safeParse({
      ...validPayload,
      fields: [{ ...validPayload.fields[0], label: "123 Project Name" }],
    })

    expect(result.success && result.data.fields[0].key).toBe("123_project_name")
  })

  it("rejects case-insensitive labels and generated Field Key collisions", () => {
    const messages = getMessages({
      ...validPayload,
      fields: [
        validPayload.fields[0],
        {
          ...validPayload.fields[0],
          label: "company",
          primaryIdentifier: false,
        },
      ],
    })

    expect(messages).toEqual(
      expect.arrayContaining([
        "Field labels must be unique ignoring case.",
        "Field labels must generate unique Field Keys.",
      ]),
    )
  })

  it("requires exact target hostnames while allowing hostname case differences", () => {
    expect(
      newScrapeRunSchema.safeParse({
        ...validPayload,
        url: "https://EXAMPLE.com",
      }).success,
    ).toBe(true)

    for (const exampleUrl of [
      "https://www.example.com/case-studies/one",
      "https://other.com/case-studies/one",
    ]) {
      expect(
        getMessages({
          ...validPayload,
          exampleUrls: [exampleUrl, validPayload.exampleUrls[1]],
        }),
      ).toContain("Example URLs must use the exact target hostname.")
    }
  })

  it("rejects examples that duplicate after canonicalization", () => {
    expect(
      getMessages({
        ...validPayload,
        exampleUrls: [
          "https://example.com/case-studies/one?source=one#top",
          "https://example.com:443/case-studies/one/",
        ],
      }),
    ).toContain("Example URLs must be distinct after normalization.")
  })

  it("rejects non-HTTP, credentialed, and non-public URLs", () => {
    expect(
      getMessages({ ...validPayload, url: "ftp://example.com/path" }),
    ).toContain("Must be a valid HTTP or HTTPS URL.")
    expect(
      getMessages({
        ...validPayload,
        exampleUrls: [
          "https://user@example.com/one",
          validPayload.exampleUrls[1],
        ],
      }),
    ).toContain("URLs must not include credentials.")
    expect(
      getMessages({ ...validPayload, url: "https://localhost/path" }),
    ).toContain("URLs must use a public DNS hostname.")
  })

  it("requires exactly one primary identifier", () => {
    const secondField = {
      label: "Title",
      description: "The case study title",
      required: true,
      primaryIdentifier: false,
    }

    expect(
      getMessages({
        ...validPayload,
        fields: [
          { ...validPayload.fields[0], primaryIdentifier: false },
          secondField,
        ],
      }),
    ).toContain("Exactly one field must be the primary identifier.")

    expect(
      getMessages({
        ...validPayload,
        fields: [
          validPayload.fields[0],
          { ...secondField, primaryIdentifier: true },
        ],
      }),
    ).toContain("Exactly one field must be the primary identifier.")
  })

  it("requires the primary identifier to be required", () => {
    expect(
      getMessages({
        ...validPayload,
        fields: [{ ...validPayload.fields[0], required: false }],
      }),
    ).toContain("The primary identifier field must be required.")
  })

  it("rejects unknown run and field properties", () => {
    expect(
      newScrapeRunSchema.safeParse({ ...validPayload, unexpected: true })
        .success,
    ).toBe(false)
    expect(
      newScrapeRunSchema.safeParse({
        ...validPayload,
        fields: [{ ...validPayload.fields[0], unexpected: true }],
      }).success,
    ).toBe(false)
  })
})
