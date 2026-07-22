import "server-only"

import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/db"
import { scrapeRuns } from "@/db/schema"

export type LifecycleTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

/**
 * Locks the parent run before a lifecycle mutation and admits work only while
 * the run is active and cancellation has not won the race.
 */
export async function lockActiveScrapeRun(
  transaction: LifecycleTransaction,
  scrapeRunId: number,
) {
  const [run] = await transaction
    .select({ id: scrapeRuns.id })
    .from(scrapeRuns)
    .where(
      and(
        eq(scrapeRuns.id, scrapeRunId),
        eq(scrapeRuns.status, "in_progress"),
        isNull(scrapeRuns.cancellationRequestedAt),
      ),
    )
    .for("update")

  return run ?? null
}
