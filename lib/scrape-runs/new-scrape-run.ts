import { z } from "zod"

import type {
  RunConfiguration,
  RunConfigurationField,
} from "@/lib/scrape-runs/contracts"
import { normalizePageUrl, normalizeTargetUrl } from "@/lib/scrape-runs/urls"

export const FIELD_LABEL_PATTERN = /^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/

export function generateFieldKey(label: string) {
  return label.trim().toLowerCase().replaceAll(" ", "_")
}

type NormalizeUrl = typeof normalizePageUrl | typeof normalizeTargetUrl

function normalizedUrlSchema(normalizeUrl: NormalizeUrl) {
  return z.string().transform((value, context): string => {
    const result = normalizeUrl(value)

    if (!result.success) {
      context.addIssue({
        code: "custom",
        message: result.message,
        params: { urlError: result.error },
      })
      return z.NEVER
    }

    return result.url
  })
}

const scrapeFieldSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(2, "Field labels must contain at least 2 characters.")
      .max(30, "Field labels must contain at most 30 characters.")
      .regex(
        FIELD_LABEL_PATTERN,
        "Field labels may contain only letters, numbers, and single spaces between words.",
      ),
    description: z
      .string()
      .trim()
      .min(2, "Field descriptions must contain at least 2 characters.")
      .max(100, "Field descriptions must contain at most 100 characters."),
    required: z.boolean(),
    primaryIdentifier: z.boolean(),
  })
  .strict()

const createRunPayloadSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required.")
      .max(100, "Name must contain at most 100 characters."),
    url: normalizedUrlSchema(normalizeTargetUrl),
    exampleUrls: z
      .array(normalizedUrlSchema(normalizePageUrl))
      .min(2, "At least 2 example URLs are required.")
      .max(5, "At most 5 example URLs are allowed."),
    fields: z
      .array(scrapeFieldSchema)
      .min(1, "At least 1 field to extract is required.")
      .max(10, "At most 10 fields to extract are allowed."),
  })
  .strict()
  .superRefine((value, context) => {
    const targetHostname = new URL(value.url).hostname
    const seenExampleUrls = new Set<string>()

    value.exampleUrls.forEach((exampleUrl, index) => {
      if (new URL(exampleUrl).hostname !== targetHostname) {
        context.addIssue({
          code: "custom",
          message: "Example URLs must use the exact target hostname.",
          path: ["exampleUrls", index],
        })
      }

      if (seenExampleUrls.has(exampleUrl)) {
        context.addIssue({
          code: "custom",
          message: "Example URLs must be distinct after normalization.",
          path: ["exampleUrls", index],
        })
      }

      seenExampleUrls.add(exampleUrl)
    })

    const seenLabels = new Set<string>()
    const seenKeys = new Set<string>()

    value.fields.forEach((field, index) => {
      const normalizedLabel = field.label.toLowerCase()
      const key = generateFieldKey(field.label)

      if (seenLabels.has(normalizedLabel)) {
        context.addIssue({
          code: "custom",
          message: "Field labels must be unique ignoring case.",
          path: ["fields", index, "label"],
        })
      }

      if (seenKeys.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Field labels must generate unique Field Keys.",
          path: ["fields", index, "label"],
        })
      }

      seenLabels.add(normalizedLabel)
      seenKeys.add(key)
    })

    const primaryFieldIndexes = value.fields.flatMap((field, index) =>
      field.primaryIdentifier ? [index] : [],
    )

    if (primaryFieldIndexes.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Exactly one field must be the primary identifier.",
        path: ["fields"],
      })
      return
    }

    const primaryFieldIndex = primaryFieldIndexes[0]

    if (!value.fields[primaryFieldIndex].required) {
      context.addIssue({
        code: "custom",
        message: "The primary identifier field must be required.",
        path: ["fields", primaryFieldIndex, "required"],
      })
    }
  })

function freezeRunConfiguration(
  value: z.output<typeof createRunPayloadSchema>,
): RunConfiguration {
  const fields = Object.freeze(
    value.fields.map((field): RunConfigurationField =>
      Object.freeze({
        ...field,
        key: generateFieldKey(field.label),
      }),
    ),
  )

  return Object.freeze({
    name: value.name,
    url: value.url,
    exampleUrls: Object.freeze([...value.exampleUrls]),
    fields,
  })
}

export const newScrapeRunSchema = createRunPayloadSchema.transform(
  freezeRunConfiguration,
)

export type NewScrapeRunInput = z.input<typeof newScrapeRunSchema>
export type NormalizedNewScrapeRunInput = z.output<typeof newScrapeRunSchema>
