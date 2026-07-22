import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import { scrapeJobs, scrapeRuns, scrapeRunStages } from "@/db/schema"
import type { LifecycleTransaction } from "./transaction"

export type CancellationRequestResult =
  | Readonly<{
      outcome: "requested" | "already_requested"
      workflowRunId: string | null
      cancellationRequestedAt: Date
    }>
  | Readonly<{ outcome: "cancelled" }>
  | Readonly<{
      outcome: "terminal_conflict"
      status: "complete" | "failed"
    }>
  | Readonly<{ outcome: "not_found" }>

export async function requestScrapeRunCancellation({
  userId,
  scrapeRunId,
}: Readonly<{
  userId: number
  scrapeRunId: number
}>): Promise<CancellationRequestResult> {
  return db.transaction(async (transaction) => {
    const [run] = await transaction
      .select()
      .from(scrapeRuns)
      .where(and(eq(scrapeRuns.id, scrapeRunId), eq(scrapeRuns.userId, userId)))
      .for("update")

    if (!run) {
      return { outcome: "not_found" }
    }

    if (run.status === "cancelled") {
      return { outcome: "cancelled" }
    }

    if (run.status === "complete" || run.status === "failed") {
      return { outcome: "terminal_conflict", status: run.status }
    }

    if (run.cancellationRequestedAt) {
      return {
        outcome: "already_requested",
        workflowRunId: run.workflowRunId,
        cancellationRequestedAt: run.cancellationRequestedAt,
      }
    }

    const cancellationRequestedAt = new Date()
    const [requested] = await transaction
      .update(scrapeRuns)
      .set({
        status: "in_progress",
        cancellationRequestedAt,
        updatedAt: cancellationRequestedAt,
      })
      .where(
        and(
          eq(scrapeRuns.id, scrapeRunId),
          inArray(scrapeRuns.status, ["pending", "in_progress"]),
          sql`${scrapeRuns.cancellationRequestedAt} IS NULL`,
        ),
      )
      .returning({ workflowRunId: scrapeRuns.workflowRunId })

    if (!requested) {
      throw new Error("Could not atomically request scrape-run cancellation.")
    }

    return {
      outcome: "requested",
      workflowRunId: requested.workflowRunId,
      cancellationRequestedAt,
    }
  })
}

export async function completeScrapeRunCancellation({
  scrapeRunId,
}: Readonly<{ scrapeRunId: number }>) {
  return db.transaction(async (transaction) => {
    const [run] = await transaction
      .select()
      .from(scrapeRuns)
      .where(eq(scrapeRuns.id, scrapeRunId))
      .for("update")

    if (!run) {
      return false
    }

    if (run.status === "cancelled") {
      return true
    }

    if (
      (run.status !== "pending" && run.status !== "in_progress") ||
      !run.cancellationRequestedAt
    ) {
      return false
    }

    await cancelScrapeRunInTransaction(transaction, scrapeRunId, new Date())
    return true
  })
}

export async function cancelScrapeRunInTransaction(
  transaction: LifecycleTransaction,
  scrapeRunId: number,
  cancelledAt: Date,
) {
  await transaction
    .update(scrapeRunStages)
    .set({
      status: "cancelled",
      finishedAt: cancelledAt,
      updatedAt: cancelledAt,
    })
    .where(
      and(
        eq(scrapeRunStages.scrapeRunId, scrapeRunId),
        inArray(scrapeRunStages.status, ["pending", "in_progress"]),
      ),
    )

  await transaction
    .update(scrapeJobs)
    .set({
      status: "cancelled",
      result: null,
      finishedAt: cancelledAt,
      updatedAt: cancelledAt,
    })
    .where(
      and(
        eq(scrapeJobs.scrapeRunId, scrapeRunId),
        inArray(scrapeJobs.status, ["pending", "in_progress"]),
      ),
    )

  const [cancelled] = await transaction
    .update(scrapeRuns)
    .set({
      status: "cancelled",
      finishedAt: cancelledAt,
      updatedAt: cancelledAt,
    })
    .where(
      and(
        eq(scrapeRuns.id, scrapeRunId),
        inArray(scrapeRuns.status, ["pending", "in_progress"]),
        sql`${scrapeRuns.cancellationRequestedAt} IS NOT NULL`,
      ),
    )
    .returning({ id: scrapeRuns.id })

  if (!cancelled) {
    throw new Error("Could not atomically complete scrape-run cancellation.")
  }
}
