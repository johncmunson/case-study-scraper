import "server-only"

import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/db"
import { scrapeJobs, scrapeRuns, scrapeRunStages } from "@/db/schema"
import {
  isTerminalScrapeRunStatus,
  type ScrapeRunFailure,
} from "@/lib/scrape-runs/contracts"
import { cancelScrapeRunInTransaction } from "./cancellation"
import { failureForStorage } from "./stored-failure"

export async function handleUnexpectedWorkflowFailure({
  scrapeRunId,
  failure,
}: Readonly<{
  scrapeRunId: number
  failure: ScrapeRunFailure & { code: "unexpected_workflow_failure" }
}>) {
  const storedFailure = failureForStorage(failure)

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

    const stages = await transaction
      .select()
      .from(scrapeRunStages)
      .where(eq(scrapeRunStages.scrapeRunId, scrapeRunId))
    const scrapingStarted = stages.some(
      (stage) => stage.stage === "scraping" && stage.startedAt !== null,
    )
    const failedAt = new Date()

    await transaction
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
          eq(scrapeRunStages.status, "in_progress"),
        ),
      )

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

    if (scrapingStarted) {
      await transaction
        .update(scrapeJobs)
        .set({
          status: "failed",
          result: null,
          missingRequiredFieldKeys: null,
          failureCode: storedFailure.code,
          failureMessage: storedFailure.message,
          finishedAt: failedAt,
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(scrapeJobs.scrapeRunId, scrapeRunId),
            inArray(scrapeJobs.status, ["pending", "in_progress"]),
          ),
        )
    }

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
          inArray(scrapeRuns.status, ["pending", "in_progress"]),
          sql`${scrapeRuns.cancellationRequestedAt} IS NULL`,
        ),
      )
      .returning({ id: scrapeRuns.id })

    if (!failedRun) {
      throw new Error("Could not atomically clean up the Workflow failure.")
    }

    return "failed"
  })
}
