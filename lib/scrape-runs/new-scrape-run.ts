import { z } from "zod"

const httpUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(value)
        return url.protocol === "http:" || url.protocol === "https:"
      } catch {
        return false
      }
    },
    { error: "Must be a valid HTTP or HTTPS URL." },
  )

const scrapeFieldSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Field labels must contain at least 2 characters.")
    .max(30, "Field labels must contain at most 30 characters."),
  description: z
    .string()
    .trim()
    .min(2, "Field descriptions must contain at least 2 characters.")
    .max(100, "Field descriptions must contain at most 100 characters."),
  required: z.boolean(),
  primaryIdentifier: z.boolean(),
})

export const newScrapeRunSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required."),
    url: httpUrlSchema,
    exampleUrls: z
      .array(httpUrlSchema)
      .min(2, "At least 2 example URLs are required.")
      .max(5, "At most 5 example URLs are allowed."),
    fields: z
      .array(scrapeFieldSchema)
      .min(1, "At least 1 field to extract is required.")
      .max(10, "At most 10 fields to extract are allowed."),
  })
  .strict()
  .superRefine((value, context) => {
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

export type NewScrapeRunInput = z.infer<typeof newScrapeRunSchema>
