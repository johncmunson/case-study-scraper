import "server-only"

import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  scrapeJobs,
  scrapeRunFields,
  scrapeRuns,
  type ScrapeJob,
} from "@/db/schema"
import { SCRAPE_RUN_STAGES } from "@/lib/scrape-runs/contracts"

const jobCountSelection = {
  total: sql<number>`COUNT(${scrapeJobs.id})::integer`,
  pending: sql<number>`COUNT(${scrapeJobs.id}) FILTER (WHERE ${scrapeJobs.status} = 'pending')::integer`,
  inProgress: sql<number>`COUNT(${scrapeJobs.id}) FILTER (WHERE ${scrapeJobs.status} = 'in_progress')::integer`,
  complete: sql<number>`COUNT(${scrapeJobs.id}) FILTER (WHERE ${scrapeJobs.status} = 'complete')::integer`,
  failed: sql<number>`COUNT(${scrapeJobs.id}) FILTER (WHERE ${scrapeJobs.status} = 'failed')::integer`,
  cancelled: sql<number>`COUNT(${scrapeJobs.id}) FILTER (WHERE ${scrapeJobs.status} = 'cancelled')::integer`,
}

const runSummarySelection = {
  id: scrapeRuns.id,
  name: scrapeRuns.name,
  targetUrl: scrapeRuns.targetUrl,
  status: scrapeRuns.status,
  cancellationRequestedAt: scrapeRuns.cancellationRequestedAt,
  createdAt: scrapeRuns.createdAt,
  startedAt: scrapeRuns.startedAt,
  finishedAt: scrapeRuns.finishedAt,
}

export async function listOwnedScrapeRunSummaries({
  userId,
}: Readonly<{ userId: number }>) {
  const rows = await db
    .select({
      ...runSummarySelection,
      ...jobCountSelection,
    })
    .from(scrapeRuns)
    .leftJoin(scrapeJobs, eq(scrapeJobs.scrapeRunId, scrapeRuns.id))
    .where(eq(scrapeRuns.userId, userId))
    .groupBy(scrapeRuns.id)
    .orderBy(desc(scrapeRuns.createdAt), desc(scrapeRuns.id))

  return rows.map(
    ({ total, pending, inProgress, complete, failed, cancelled, ...run }) => ({
      ...run,
      jobCounts: { total, pending, inProgress, complete, failed, cancelled },
    }),
  )
}

export async function findOwnedScrapeRunDetail({
  userId,
  scrapeRunId,
}: Readonly<{ userId: number; scrapeRunId: number }>) {
  const run = await db.query.scrapeRuns.findFirst({
    where: and(eq(scrapeRuns.id, scrapeRunId), eq(scrapeRuns.userId, userId)),
    columns: {
      id: true,
      name: true,
      targetUrl: true,
      exampleUrls: true,
      filteringModel: true,
      status: true,
      cancellationRequestedAt: true,
      failureCode: true,
      failureMessage: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
    },
    with: {
      fields: { orderBy: asc(scrapeRunFields.position) },
      stages: true,
    },
  })

  if (!run) {
    return null
  }

  const primaryField = run.fields.find((field) => field.primaryIdentifier)

  if (!primaryField) {
    throw new Error("The scrape run has no Primary Identifier field.")
  }

  const [jobCounts, jobs] = await Promise.all([
    getScrapeJobCounts(scrapeRunId),
    db
      .select({
        id: scrapeJobs.id,
        url: scrapeJobs.url,
        status: scrapeJobs.status,
        primaryIdentifier:
          sql<string | null>`${scrapeJobs.result} ->> ${primaryField.key}`,
        failureCode: scrapeJobs.failureCode,
        attemptCount: scrapeJobs.attemptCount,
        createdAt: scrapeJobs.createdAt,
        updatedAt: scrapeJobs.updatedAt,
        startedAt: scrapeJobs.startedAt,
        finishedAt: scrapeJobs.finishedAt,
      })
      .from(scrapeJobs)
      .where(eq(scrapeJobs.scrapeRunId, scrapeRunId))
      .orderBy(asc(scrapeJobs.id)),
  ])

  return {
    id: run.id,
    name: run.name,
    targetUrl: run.targetUrl,
    status: run.status,
    cancellationRequestedAt: run.cancellationRequestedAt,
    failureCode: run.failureCode,
    failureMessage: run.failureMessage,
    jobCounts,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    exampleUrls: run.exampleUrls,
    filteringModel: run.filteringModel,
    fields: run.fields.map(
      ({ position, label, key, description, required, primaryIdentifier }) => ({
        position,
        label,
        key,
        description,
        required,
        primaryIdentifier,
      }),
    ),
    stages: run.stages
      .sort(
        (left, right) =>
          SCRAPE_RUN_STAGES.indexOf(left.stage) -
          SCRAPE_RUN_STAGES.indexOf(right.stage),
      )
      .map(
        ({
          stage,
          status,
          attemptCount,
          failureCode,
          failureMessage,
          createdAt,
          updatedAt,
          startedAt,
          finishedAt,
        }) => ({
          stage,
          status,
          attemptCount,
          failureCode,
          failureMessage,
          createdAt,
          updatedAt,
          startedAt,
          finishedAt,
        }),
      ),
    jobs,
  }
}

export async function findOwnedScrapeJobDetail({
  userId,
  scrapeRunId,
  scrapeJobId,
}: Readonly<{
  userId: number
  scrapeRunId: number
  scrapeJobId: number
}>): Promise<Omit<ScrapeJob, "scrapeRunId"> | null> {
  const [job] = await db
    .select({
      id: scrapeJobs.id,
      url: scrapeJobs.url,
      status: scrapeJobs.status,
      attemptCount: scrapeJobs.attemptCount,
      result: scrapeJobs.result,
      missingRequiredFieldKeys: scrapeJobs.missingRequiredFieldKeys,
      failureCode: scrapeJobs.failureCode,
      failureMessage: scrapeJobs.failureMessage,
      createdAt: scrapeJobs.createdAt,
      updatedAt: scrapeJobs.updatedAt,
      startedAt: scrapeJobs.startedAt,
      finishedAt: scrapeJobs.finishedAt,
    })
    .from(scrapeJobs)
    .innerJoin(scrapeRuns, eq(scrapeRuns.id, scrapeJobs.scrapeRunId))
    .where(
      and(
        eq(scrapeRuns.userId, userId),
        eq(scrapeJobs.scrapeRunId, scrapeRunId),
        eq(scrapeJobs.id, scrapeJobId),
      ),
    )

  return job ?? null
}

async function getScrapeJobCounts(scrapeRunId: number) {
  const [counts] = await db
    .select(jobCountSelection)
    .from(scrapeJobs)
    .where(eq(scrapeJobs.scrapeRunId, scrapeRunId))

  return counts ?? emptyScrapeJobCounts()
}

function emptyScrapeJobCounts(): Record<
  "total" | "pending" | "inProgress" | "complete" | "failed" | "cancelled",
  number
> {
  return {
    total: 0,
    pending: 0,
    inProgress: 0,
    complete: 0,
    failed: 0,
    cancelled: 0,
  }
}
