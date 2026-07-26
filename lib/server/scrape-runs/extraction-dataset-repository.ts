import "server-only"

import { and, asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { scrapeJobs, scrapeRunFields, scrapeRuns } from "@/db/schema"
import type { ExtractionDatasetSource } from "@/lib/scrape-runs/extraction-dataset"
import { isActiveScrapeRunStatus } from "@/lib/scrape-runs/contracts"

export async function findOwnedScrapeRunExtractionDatasetSource({
  userId,
  scrapeRunId,
}: Readonly<{
  userId: number
  scrapeRunId: number
}>) {
  const ownedRunWhere = and(
    eq(scrapeRuns.id, scrapeRunId),
    eq(scrapeRuns.userId, userId),
  )
  const identityColumns = {
    id: true,
    name: true,
    status: true,
  } as const
  const ownedRun = await db.query.scrapeRuns.findFirst({
    where: ownedRunWhere,
    columns: identityColumns,
  })

  if (!ownedRun) {
    return null
  }

  if (isActiveScrapeRunStatus(ownedRun.status)) {
    return {
      ...ownedRun,
      fields: [],
      successfulJobs: [],
    } satisfies ExtractionDatasetSource & Readonly<{ id: number; name: string }>
  }

  const run = await db.query.scrapeRuns.findFirst({
    where: ownedRunWhere,
    columns: identityColumns,
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
