import "server-only"

import { writeToString } from "fast-csv"

import type {
  ExtractionDatasetField,
  ExtractionDatasetFormat,
  ExtractionDatasetRecord,
} from "@/lib/scrape-runs/extraction-dataset"

export const EXTRACTION_DATASET_SOURCE_HEADER = "Canonical Page URL (source)"

export class ExtractionDatasetSerializationError extends Error {
  readonly format: ExtractionDatasetFormat

  constructor(format: ExtractionDatasetFormat, cause: unknown) {
    super(`Failed to serialize the Extraction Dataset as ${format}.`, { cause })
    this.name = "ExtractionDatasetSerializationError"
    this.format = format
  }
}

export function serializeExtractionDatasetJson(
  records: readonly ExtractionDatasetRecord[],
) {
  try {
    return JSON.stringify(records, null, 2)
  } catch (error) {
    throw new ExtractionDatasetSerializationError("json", error)
  }
}

export async function serializeExtractionDatasetCsv(
  fields: readonly ExtractionDatasetField[],
  records: readonly ExtractionDatasetRecord[],
) {
  const orderedFields = [...fields].sort(
    (left, right) => left.position - right.position,
  )
  const headers = [
    EXTRACTION_DATASET_SOURCE_HEADER,
    ...orderedFields.map((field) => field.label),
  ]
  const rows = records.map((record) => [
    record.canonicalPageUrl,
    ...orderedFields.map((field) => record.fields[field.key] ?? ""),
  ])

  try {
    return await writeToString(rows, {
      headers,
      rowDelimiter: "\r\n",
      writeBOM: true,
    })
  } catch (error) {
    throw new ExtractionDatasetSerializationError("csv", error)
  }
}
