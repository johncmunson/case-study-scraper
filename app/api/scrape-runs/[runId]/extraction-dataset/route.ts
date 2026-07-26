import { getCurrentSession } from "@/auth/session"
import {
  numericSessionUserId,
  positiveIntegerRouteId,
  scrapeRunNotFoundResponse,
  unauthorizedResponse,
} from "@/app/api/scrape-runs/_route-helpers"
import {
  buildExtractionDataset,
  getExtractionDatasetFilename,
  type ExtractionDatasetFormat,
} from "@/lib/scrape-runs/extraction-dataset"
import { findOwnedScrapeRunExtractionDatasetSource } from "@/lib/server/scrape-runs/extraction-dataset-repository"
import {
  serializeExtractionDatasetCsv,
  serializeExtractionDatasetJson,
} from "@/lib/server/scrape-runs/extraction-dataset-serialization"

const CONTENT_TYPES: Record<ExtractionDatasetFormat, string> = {
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
}

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const startedAt = performance.now()
  const session = await getCurrentSession()

  if (!session) {
    return withPrivateHeaders(unauthorizedResponse())
  }

  const { runId } = await params
  const scrapeRunId = positiveIntegerRouteId(runId)

  if (scrapeRunId === null) {
    return withPrivateHeaders(scrapeRunNotFoundResponse())
  }

  const format = parseExtractionDatasetFormat(request)

  if (format === null) {
    return withPrivateHeaders(
      Response.json(
        { error: "A supported Extraction Dataset format is required." },
        { status: 400 },
      ),
    )
  }

  let source: Awaited<
    ReturnType<typeof findOwnedScrapeRunExtractionDatasetSource>
  >

  try {
    source = await findOwnedScrapeRunExtractionDatasetSource({
      userId: numericSessionUserId(session.user.id),
      scrapeRunId,
    })
  } catch (_error) {
    logGenerationFailure({
      scrapeRunId,
      format,
      startedAt,
      failureCategory: "dataset-load-failed",
    })
    return generationFailureResponse()
  }

  if (!source) {
    return withPrivateHeaders(scrapeRunNotFoundResponse())
  }

  const dataset = buildExtractionDataset(source)

  if (dataset.status === "unavailable") {
    return withPrivateHeaders(
      Response.json(
        {
          error:
            dataset.reason === "active-run"
              ? "The Extraction Dataset is available after the Scrape Run finishes."
              : "No successful results are available to download.",
        },
        { status: 409 },
      ),
    )
  }

  if (dataset.status === "invalid") {
    logGenerationFailure({
      scrapeRunId,
      format,
      recordCount: source.successfulJobs.length,
      startedAt,
      failureCategory: `invalid-stored-result:${dataset.reason}`,
    })
    return generationFailureResponse()
  }

  let body: string

  try {
    body =
      format === "csv"
        ? await serializeExtractionDatasetCsv(source.fields, dataset.records)
        : serializeExtractionDatasetJson(dataset.records)
  } catch (_error) {
    logGenerationFailure({
      scrapeRunId,
      format,
      recordCount: dataset.records.length,
      startedAt,
      failureCategory: "serialization-failed",
    })
    return generationFailureResponse()
  }

  const filename = getExtractionDatasetFilename(source.name, source.id, format)

  return new Response(body, {
    headers: {
      ...PRIVATE_RESPONSE_HEADERS,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": CONTENT_TYPES[format],
    },
  })
}

function parseExtractionDatasetFormat(
  request: Request,
): ExtractionDatasetFormat | null {
  const format = new URL(request.url).searchParams.get("format")

  return format === "csv" || format === "json" ? format : null
}

function generationFailureResponse() {
  return withPrivateHeaders(
    Response.json(
      { error: "The Extraction Dataset could not be generated." },
      { status: 500 },
    ),
  )
}

function withPrivateHeaders(response: Response) {
  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
    response.headers.set(name, value)
  }

  return response
}

function logGenerationFailure({
  scrapeRunId,
  format,
  recordCount,
  startedAt,
  failureCategory,
}: Readonly<{
  scrapeRunId: number
  format: ExtractionDatasetFormat
  recordCount?: number
  startedAt: number
  failureCategory: string
}>) {
  console.error("Extraction Dataset generation failed.", {
    scrapeRunId,
    format,
    ...(recordCount === undefined ? {} : { recordCount }),
    durationMs: Math.round(performance.now() - startedAt),
    failureCategory,
  })
}
