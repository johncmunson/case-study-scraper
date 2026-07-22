import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import { scrapeRuns, scrapeRunStages } from "@/db/schema"
import type {
  ScrapeRunFailure,
  ScrapeRunStage,
} from "@/lib/scrape-runs/contracts"
import { failureForStorage } from "./stored-failure"
import { lockActiveScrapeRun } from "./transaction"

type StageInput = Readonly<{
  scrapeRunId: number
  stage: ScrapeRunStage
}>

/**
 * Admits one provider attempt for an active stage. The counter is incremented
 * immediately before the external call, so a crash can count an admitted call
 * that never reached the provider but can never undercount one that did.
 */
export async function recordStageAttempt({ scrapeRunId, stage }: StageInput) {
  return db.transaction(async (transaction) => {
    const run = await lockActiveScrapeRun(transaction, scrapeRunId)

    if (!run) {
      return null
    }

    const updatedAt = new Date()
    const [updated] = await transaction
      .update(scrapeRunStages)
      .set({
        attemptCount: sql`${scrapeRunStages.attemptCount} + 1`,
        updatedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.stage, stage),
          eq(scrapeRunStages.status, "in_progress"),
        ),
      )
      .returning()

    return updated ?? null
  })
}

export async function failPendingWorkflowDispatch({
  scrapeRunId,
  failure,
}: Readonly<{
  scrapeRunId: number
  failure: ScrapeRunFailure & { code: "workflow_dispatch_failed" }
}>) {
  const storedFailure = failureForStorage(failure)

  return db.transaction(async (transaction) => {
    const [run] = await transaction
      .select({ id: scrapeRuns.id })
      .from(scrapeRuns)
      .where(
        and(
          eq(scrapeRuns.id, scrapeRunId),
          eq(scrapeRuns.status, "pending"),
          sql`${scrapeRuns.cancellationRequestedAt} IS NULL`,
        ),
      )
      .for("update")

    if (!run) {
      return false
    }

    const failedAt = new Date()
    await transaction
      .update(scrapeRunStages)
      .set({
        status: "skipped",
        finishedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.status, "pending"),
        ),
      )

    const [failedRun] = await transaction
      .update(scrapeRuns)
      .set({
        status: "failed",
        failureCode: storedFailure.code,
        failureMessage: storedFailure.message,
        finishedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(scrapeRuns.id, scrapeRunId),
          eq(scrapeRuns.status, "pending"),
          sql`${scrapeRuns.cancellationRequestedAt} IS NULL`,
        ),
      )
      .returning({ id: scrapeRuns.id })

    if (!failedRun) {
      throw new Error(
        "Could not atomically compensate Workflow dispatch failure.",
      )
    }

    return true
  })
}

export async function failPreparationStage({
  scrapeRunId,
  stage,
  failure,
}: Readonly<{
  scrapeRunId: number
  stage: "mapping" | "filtering"
  failure: ScrapeRunFailure
}>) {
  const storedFailure = failureForStorage(failure)

  return db.transaction(async (transaction) => {
    const run = await lockActiveScrapeRun(transaction, scrapeRunId)

    if (!run) {
      return false
    }

    const failedAt = new Date()
    const [failedStage] = await transaction
      .update(scrapeRunStages)
      .set({
        status: "failed",
        failureCode: storedFailure.code,
        failureMessage: storedFailure.message,
        finishedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.stage, stage),
          eq(scrapeRunStages.status, "in_progress"),
        ),
      )
      .returning({ id: scrapeRunStages.id })

    if (!failedStage) {
      return false
    }

    const laterStages =
      stage === "mapping"
        ? (["filtering", "scraping"] as const)
        : (["scraping"] as const)

    await transaction
      .update(scrapeRunStages)
      .set({
        status: "skipped",
        finishedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          inArray(scrapeRunStages.stage, laterStages),
          eq(scrapeRunStages.status, "pending"),
        ),
      )

    const [failedRun] = await transaction
      .update(scrapeRuns)
      .set({
        status: "failed",
        failureCode: storedFailure.code,
        failureMessage: storedFailure.message,
        finishedAt: failedAt,
        updatedAt: failedAt,
      })
      .where(
        and(
          eq(scrapeRuns.id, scrapeRunId),
          eq(scrapeRuns.status, "in_progress"),
          sql`${scrapeRuns.cancellationRequestedAt} IS NULL`,
        ),
      )
      .returning({ id: scrapeRuns.id })

    if (!failedRun) {
      throw new Error("Could not atomically fail the preparation stage.")
    }

    return true
  })
}

export async function completeMappingAndStartFiltering({
  scrapeRunId,
}: Readonly<{ scrapeRunId: number }>) {
  return db.transaction(async (transaction) => {
    const run = await lockActiveScrapeRun(transaction, scrapeRunId)

    if (!run) {
      return false
    }

    const stages = await transaction
      .select()
      .from(scrapeRunStages)
      .where(eq(scrapeRunStages.scrapeRunId, scrapeRunId))

    const mapping = stages.find((record) => record.stage === "mapping")
    const filtering = stages.find((record) => record.stage === "filtering")

    if (
      mapping?.status === "complete" &&
      filtering?.status !== "pending" &&
      filtering !== undefined
    ) {
      return true
    }

    if (mapping?.status !== "in_progress" || filtering?.status !== "pending") {
      return false
    }

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
          eq(scrapeRunStages.id, mapping.id),
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
          eq(scrapeRunStages.id, filtering.id),
          eq(scrapeRunStages.status, "pending"),
        ),
      )
      .returning({ id: scrapeRunStages.id })

    if (!completed || !started) {
      throw new Error("Could not atomically advance Mapping to Filtering.")
    }

    return true
  })
}
