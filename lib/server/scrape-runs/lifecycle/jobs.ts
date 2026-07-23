import "server-only"

import { and, asc, count, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import { scrapeJobs, scrapeRuns, scrapeRunStages } from "@/db/schema"
import {
  isTerminalScrapeRunStatus,
  type ExtractionResult,
  type ScrapeJobStatus,
  type ScrapeRunFailure,
} from "@/lib/scrape-runs/contracts"
import { cancelScrapeRunInTransaction } from "./cancellation"
import { failureForStorage } from "./stored-failure"
import { lockActiveScrapeRun } from "./transaction"

export class InvalidScrapeJobSetError extends Error {
  constructor() {
    super("A scrape run must have at least two selected Canonical Page URLs.")
    this.name = "InvalidScrapeJobSetError"
  }
}

export async function createScrapeJobsAndStartScraping({
  scrapeRunId,
  canonicalPageUrls,
}: Readonly<{
  scrapeRunId: number
  canonicalPageUrls: readonly string[]
}>) {
  const distinctUrls = [...new Set(canonicalPageUrls)]

  return db.transaction(async (transaction) => {
    const run = await lockActiveScrapeRun(transaction, scrapeRunId)

    if (!run) {
      return null
    }

    const stages = await transaction
      .select()
      .from(scrapeRunStages)
      .where(eq(scrapeRunStages.scrapeRunId, scrapeRunId))
    const filtering = stages.find((record) => record.stage === "filtering")
    const scraping = stages.find((record) => record.stage === "scraping")

    if (
      filtering?.status === "complete" &&
      scraping?.status === "in_progress"
    ) {
      return transaction
        .select()
        .from(scrapeJobs)
        .where(eq(scrapeJobs.scrapeRunId, scrapeRunId))
        .orderBy(asc(scrapeJobs.id))
    }

    if (filtering?.status !== "in_progress" || scraping?.status !== "pending") {
      return null
    }

    if (distinctUrls.length < 2) {
      throw new InvalidScrapeJobSetError()
    }

    await transaction
      .insert(scrapeJobs)
      .values(distinctUrls.map((url) => ({ scrapeRunId, url })))
      .onConflictDoNothing({
        target: [scrapeJobs.scrapeRunId, scrapeJobs.url],
      })

    const transitionedAt = new Date()
    const [completed] = await transaction
      .update(scrapeRunStages)
      .set({
        status: "complete",
        finishedAt: transitionedAt,
        updatedAt: transitionedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.id, filtering.id),
          eq(scrapeRunStages.status, "in_progress"),
        ),
      )
      .returning({ id: scrapeRunStages.id })
    const [started] = await transaction
      .update(scrapeRunStages)
      .set({
        status: "in_progress",
        startedAt: transitionedAt,
        updatedAt: transitionedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.id, scraping.id),
          eq(scrapeRunStages.status, "pending"),
        ),
      )
      .returning({ id: scrapeRunStages.id })

    if (!completed || !started) {
      throw new Error("Could not atomically create jobs and start Scraping.")
    }

    return transaction
      .select()
      .from(scrapeJobs)
      .where(eq(scrapeJobs.scrapeRunId, scrapeRunId))
      .orderBy(asc(scrapeJobs.id))
  })
}

type ScrapeJobInput = Readonly<{
  scrapeRunId: number
  scrapeJobId: number
}>

export async function isScrapeBatchAdmitted({
  scrapeRunId,
}: Readonly<{ scrapeRunId: number }>) {
  return db.transaction(async (transaction) => {
    const run = await lockActiveScrapeRun(transaction, scrapeRunId)

    if (!run) {
      return false
    }

    const [scraping] = await transaction
      .select({ id: scrapeRunStages.id })
      .from(scrapeRunStages)
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.stage, "scraping"),
          eq(scrapeRunStages.status, "in_progress"),
        ),
      )

    return Boolean(scraping)
  })
}

export async function claimScrapeJob({
  scrapeRunId,
  scrapeJobId,
}: ScrapeJobInput) {
  return db.transaction(async (transaction) => {
    const [run] = await transaction
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.id, scrapeRunId))
      .for("update")

    if (!run) {
      return null
    }

    const [job] = await transaction
      .select()
      .from(scrapeJobs)
      .where(
        and(
          eq(scrapeJobs.id, scrapeJobId),
          eq(scrapeJobs.scrapeRunId, scrapeRunId),
        ),
      )

    if (!job || !["pending", "in_progress"].includes(job.status)) {
      return job ?? null
    }

    if (run.status !== "in_progress" || run.cancellationRequestedAt) {
      return null
    }

    const [scraping] = await transaction
      .select({ status: scrapeRunStages.status })
      .from(scrapeRunStages)
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.stage, "scraping"),
        ),
      )

    if (scraping?.status !== "in_progress") {
      return null
    }

    const attemptedAt = new Date()
    const [claimed] = await transaction
      .update(scrapeJobs)
      .set({
        status: "in_progress",
        attemptCount: sql`${scrapeJobs.attemptCount} + 1`,
        startedAt: job.startedAt ?? attemptedAt,
        updatedAt: attemptedAt,
      })
      .where(
        and(
          eq(scrapeJobs.id, scrapeJobId),
          eq(scrapeJobs.scrapeRunId, scrapeRunId),
          inArray(scrapeJobs.status, ["pending", "in_progress"]),
        ),
      )
      .returning()

    return claimed ?? null
  })
}

export async function completeScrapeJob({
  scrapeRunId,
  scrapeJobId,
  result,
}: ScrapeJobInput & Readonly<{ result: ExtractionResult }>) {
  return settleScrapeJob({
    scrapeRunId,
    scrapeJobId,
    values: {
      status: "complete",
      result,
      missingRequiredFieldKeys: null,
      failureCode: null,
      failureMessage: null,
    },
  })
}

export async function failScrapeJob({
  scrapeRunId,
  scrapeJobId,
  failure,
  missingRequiredFieldKeys = null,
}: ScrapeJobInput &
  Readonly<{
    failure: ScrapeRunFailure
    missingRequiredFieldKeys?: readonly string[] | null
  }>) {
  const storedFailure = failureForStorage(failure)

  return settleScrapeJob({
    scrapeRunId,
    scrapeJobId,
    values: {
      status: "failed",
      result: null,
      missingRequiredFieldKeys: missingRequiredFieldKeys
        ? [...missingRequiredFieldKeys]
        : null,
      failureCode: storedFailure.code,
      failureMessage: storedFailure.message,
    },
  })
}

type JobSettlementValues = Readonly<{
  status: "complete" | "failed"
  result: ExtractionResult | null
  missingRequiredFieldKeys: string[] | null
  failureCode: ScrapeRunFailure["code"] | null
  failureMessage: string | null
}>

async function settleScrapeJob({
  scrapeRunId,
  scrapeJobId,
  values,
}: ScrapeJobInput & Readonly<{ values: JobSettlementValues }>) {
  return db.transaction(async (transaction) => {
    const run = await lockActiveScrapeRun(transaction, scrapeRunId)

    if (!run) {
      return null
    }

    const [scraping] = await transaction
      .select({ id: scrapeRunStages.id })
      .from(scrapeRunStages)
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.stage, "scraping"),
          eq(scrapeRunStages.status, "in_progress"),
        ),
      )

    if (!scraping) {
      return null
    }

    const finishedAt = new Date()
    const [settled] = await transaction
      .update(scrapeJobs)
      .set({ ...values, finishedAt, updatedAt: finishedAt })
      .where(
        and(
          eq(scrapeJobs.id, scrapeJobId),
          eq(scrapeJobs.scrapeRunId, scrapeRunId),
          eq(scrapeJobs.status, "in_progress"),
        ),
      )
      .returning()

    return settled ?? null
  })
}

export type ScrapeJobAggregates = Readonly<{
  total: number
  pending: number
  inProgress: number
  complete: number
  failed: number
  cancelled: number
}>

export async function getScrapeJobAggregates({
  scrapeRunId,
}: Readonly<{ scrapeRunId: number }>): Promise<ScrapeJobAggregates> {
  const rows = await db
    .select({ status: scrapeJobs.status, count: count() })
    .from(scrapeJobs)
    .where(eq(scrapeJobs.scrapeRunId, scrapeRunId))
    .groupBy(scrapeJobs.status)

  return aggregatesFromRows(rows)
}

export async function finalizeScraping({
  scrapeRunId,
}: Readonly<{ scrapeRunId: number }>) {
  return db.transaction(async (transaction) => {
    const [run] = await transaction
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.id, scrapeRunId))
      .for("update")

    if (!run) {
      return null
    }

    if (isTerminalScrapeRunStatus(run.status)) {
      return run.status
    }

    if (run.cancellationRequestedAt) {
      await cancelScrapeRunInTransaction(transaction, scrapeRunId, new Date())
      return "cancelled"
    }

    if (run.status !== "in_progress") {
      return run.status
    }

    const [scraping] = await transaction
      .select()
      .from(scrapeRunStages)
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.stage, "scraping"),
        ),
      )

    if (scraping?.status !== "in_progress") {
      return run.status
    }

    const rows = await transaction
      .select({ status: scrapeJobs.status, count: count() })
      .from(scrapeJobs)
      .where(eq(scrapeJobs.scrapeRunId, scrapeRunId))
      .groupBy(scrapeJobs.status)
    const aggregates = aggregatesFromRows(rows)

    if (aggregates.pending > 0 || aggregates.inProgress > 0) {
      return run.status
    }

    if (aggregates.total < 2 || aggregates.cancelled > 0) {
      throw new Error(
        "Scraping cannot finalize without a valid terminal job set.",
      )
    }

    const finishedAt = new Date()
    const hasSuccessfulJob = aggregates.complete > 0
    const status = hasSuccessfulJob ? "complete" : "failed"
    const failure = hasSuccessfulJob
      ? { code: null, message: null }
      : {
          code: "scrape_failed" as const,
          message: "Every scrape job failed.",
        }

    const [finishedStage] = await transaction
      .update(scrapeRunStages)
      .set({
        status,
        failureCode: failure.code,
        failureMessage: failure.message,
        finishedAt,
        updatedAt: finishedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.id, scraping.id),
          eq(scrapeRunStages.status, "in_progress"),
        ),
      )
      .returning({ id: scrapeRunStages.id })
    const [finishedRun] = await transaction
      .update(scrapeRuns)
      .set({
        status,
        failureCode: failure.code,
        failureMessage: failure.message,
        finishedAt,
        updatedAt: finishedAt,
      })
      .where(
        and(
          eq(scrapeRuns.id, scrapeRunId),
          eq(scrapeRuns.status, "in_progress"),
          sql`${scrapeRuns.cancellationRequestedAt} IS NULL`,
        ),
      )
      .returning({ id: scrapeRuns.id })

    if (!finishedStage || !finishedRun) {
      throw new Error("Could not atomically finalize Scraping.")
    }

    return status
  })
}

function aggregatesFromRows(
  rows: ReadonlyArray<{ status: ScrapeJobStatus; count: number }>,
): ScrapeJobAggregates {
  const counts: Record<ScrapeJobStatus, number> = {
    pending: 0,
    in_progress: 0,
    complete: 0,
    failed: 0,
    cancelled: 0,
  }

  for (const row of rows) {
    counts[row.status] = Number(row.count)
  }

  return {
    total: Object.values(counts).reduce((total, value) => total + value, 0),
    pending: counts.pending,
    inProgress: counts.in_progress,
    complete: counts.complete,
    failed: counts.failed,
    cancelled: counts.cancelled,
  }
}
