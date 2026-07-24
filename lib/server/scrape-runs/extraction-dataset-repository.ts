import "server-only"

import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { scrapeJobs, scrapeRunFields, scrapeRuns } from "@/db/schema"
import type { ExtractionDatasetSource } from "@/lib/scrape-runs/extraction-dataset"

export async function findOwnedScrapeRunExtractionDatasetSource({
  userId,
  scrapeRunId,
}: Readonly<{
  userId: number
  scrapeRunId: number
}>) {
  const run = await db.query.scrapeRuns.findFirst({
    where: and(
      eq(scrapeRuns.id, scrapeRunId),
      eq(scrapeRuns.userId, userId),
    ),
    columns: {
      id: true,
      name: true,
      status: true,
    },
    with: {
      fields: {
        columns: {
          position: true,
          label: true,
          key: true,
          required: true,
        },
        orderBy: asc(scrapeRunFields.position),
      },
      jobs: {
        columns: {
          url: true,
          result: true,
        },
        where: eq(scrapeJobs.status, "complete"),
        orderBy: asc(scrapeJobs.url),
      },
    },
  })

  if (!run) {
    return null
  }

  return {
    id: run.id,
    name: run.name,
    status: run.status,
    fields: run.fields,
    successfulJobs: run.jobs.map(({ url, result }) => ({
      canonicalPageUrl: url,
      result: result as unknown,
    })),
  } satisfies ExtractionDatasetSource & Readonly<{ id: number; name: string }>
}
