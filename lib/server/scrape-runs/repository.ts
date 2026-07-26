import "server-only"

import { and, asc, eq, isNull, or } from "drizzle-orm"

import { db } from "@/db"
import {
  scrapeJobs,
  scrapeRunFields,
  scrapeRuns,
  scrapeRunStages,
} from "@/db/schema"
import {
  SCRAPE_RUN_STAGES,
  isActiveScrapeRunStatus,
  type PersistedRunConfiguration,
} from "@/lib/scrape-runs/contracts"

export type ScrapeRunWithConfiguration = NonNullable<
  Awaited<ReturnType<typeof findOwnedScrapeRun>>
>

const ACTIVE_RUN_CONSTRAINT = "scrape_runs_one_active_per_user_idx"

export class ActiveScrapeRunConflictError extends Error {
  constructor(options?: ErrorOptions) {
    super("The user already has an active scrape run.", options)
    this.name = "ActiveScrapeRunConflictError"
  }
}

export class InvalidScrapeRunConfigurationError extends Error {
  constructor() {
    super("A scrape run must have exactly one required Primary Identifier.")
    this.name = "InvalidScrapeRunConfigurationError"
  }
}

type CreateScrapeRunInput = Readonly<{
  userId: number
  configuration: PersistedRunConfiguration
}>

type OwnedScrapeRunInput = Readonly<{
  userId: number
  scrapeRunId: number
}>

type OwnedScrapeJobInput = OwnedScrapeRunInput &
  Readonly<{
    scrapeJobId: number
  }>

export type DeleteOwnedTerminalScrapeRunResult =
  | Readonly<{ outcome: "deleted" }>
  | Readonly<{ outcome: "active_conflict" }>
  | Readonly<{ outcome: "not_found" }>

export type DeleteOwnedTerminalScrapeJobResult =
  DeleteOwnedTerminalScrapeRunResult

type WorkflowRunInput = Readonly<{
  scrapeRunId: number
  workflowRunId: string
}>

export async function createScrapeRun({
  userId,
  configuration,
}: CreateScrapeRunInput) {
  try {
    return await db.transaction(async (transaction) => {
      const primaryFields = configuration.fields.filter(
        (field) => field.primaryIdentifier,
      )

      if (primaryFields.length !== 1 || !primaryFields[0].required) {
        throw new InvalidScrapeRunConfigurationError()
      }

      const [run] = await transaction
        .insert(scrapeRuns)
        .values({
          userId,
          name: configuration.name,
          targetUrl: configuration.url,
          exampleUrls: [...configuration.exampleUrls],
          filteringModel: configuration.filteringModel,
        })
        .returning()

      const fields = await transaction
        .insert(scrapeRunFields)
        .values(
          configuration.fields.map((field, position) => ({
            scrapeRunId: run.id,
            position,
            label: field.label,
            key: field.key,
            description: field.description,
            required: field.required,
            primaryIdentifier: field.primaryIdentifier,
          })),
        )
        .returning()

      const stages = await transaction
        .insert(scrapeRunStages)
        .values(
          SCRAPE_RUN_STAGES.map((stage) => ({
            scrapeRunId: run.id,
            stage,
          })),
        )
        .returning()

      return { ...run, fields, stages }
    })
  } catch (error) {
    if (isPostgresConstraintError(error, "23505", ACTIVE_RUN_CONSTRAINT)) {
      throw new ActiveScrapeRunConflictError({ cause: error })
    }

    throw error
  }
}

function isPostgresConstraintError(
  error: unknown,
  code: string,
  constraint: string,
) {
  const seen = new Set<unknown>()
  let current = error

  while (
    typeof current === "object" &&
    current !== null &&
    !seen.has(current)
  ) {
    seen.add(current)

    if (
      "code" in current &&
      current.code === code &&
      "constraint" in current &&
      current.constraint === constraint
    ) {
      return true
    }

    current = "cause" in current ? current.cause : undefined
  }

  return false
}

export async function claimScrapeRun({
  scrapeRunId,
  workflowRunId,
}: WorkflowRunInput) {
  return db.transaction(async (transaction) => {
    const startedAt = new Date()
    const [claimed] = await transaction
      .update(scrapeRuns)
      .set({
        status: "in_progress",
        workflowRunId,
        startedAt,
        updatedAt: startedAt,
      })
      .where(
        and(
          eq(scrapeRuns.id, scrapeRunId),
          eq(scrapeRuns.status, "pending"),
          isNull(scrapeRuns.cancellationRequestedAt),
          or(
            isNull(scrapeRuns.workflowRunId),
            eq(scrapeRuns.workflowRunId, workflowRunId),
          ),
        ),
      )
      .returning({ id: scrapeRuns.id })

    if (!claimed) {
      const replayedClaim = await transaction.query.scrapeRuns.findFirst({
        where: and(
          eq(scrapeRuns.id, scrapeRunId),
          eq(scrapeRuns.status, "in_progress"),
          eq(scrapeRuns.workflowRunId, workflowRunId),
          isNull(scrapeRuns.cancellationRequestedAt),
        ),
        with: {
          fields: { orderBy: asc(scrapeRunFields.position) },
          stages: true,
        },
      })

      return replayedClaim ? orderRunStages(replayedClaim) : null
    }

    const [mappingStage] = await transaction
      .update(scrapeRunStages)
      .set({
        status: "in_progress",
        startedAt,
        updatedAt: startedAt,
      })
      .where(
        and(
          eq(scrapeRunStages.scrapeRunId, scrapeRunId),
          eq(scrapeRunStages.stage, "mapping"),
          eq(scrapeRunStages.status, "pending"),
        ),
      )
      .returning({ id: scrapeRunStages.id })

    if (!mappingStage) {
      throw new Error("The claimed scrape run has no pending Mapping stage.")
    }

    const run = await transaction.query.scrapeRuns.findFirst({
      where: eq(scrapeRuns.id, scrapeRunId),
      with: {
        fields: { orderBy: asc(scrapeRunFields.position) },
        stages: true,
      },
    })

    if (!run) {
      throw new Error("The claimed scrape run could not be loaded.")
    }

    return orderRunStages(run)
  })
}

export async function attachWorkflowRunId({
  scrapeRunId,
  workflowRunId,
}: WorkflowRunInput) {
  const [attached] = await db
    .update(scrapeRuns)
    .set({ workflowRunId })
    .where(
      and(eq(scrapeRuns.id, scrapeRunId), isNull(scrapeRuns.workflowRunId)),
    )
    .returning({ id: scrapeRuns.id })

  if (attached) {
    return true
  }

  const existing = await db.query.scrapeRuns.findFirst({
    columns: { workflowRunId: true },
    where: eq(scrapeRuns.id, scrapeRunId),
  })

  return existing?.workflowRunId === workflowRunId
}

export async function deleteOwnedTerminalScrapeRun({
  userId,
  scrapeRunId,
}: OwnedScrapeRunInput): Promise<DeleteOwnedTerminalScrapeRunResult> {
  return db.transaction(async (transaction) => {
    const [run] = await transaction
      .select({ id: scrapeRuns.id, status: scrapeRuns.status })
      .from(scrapeRuns)
      .where(
        and(eq(scrapeRuns.id, scrapeRunId), eq(scrapeRuns.userId, userId)),
      )
      .for("update")

    if (!run) {
      return { outcome: "not_found" }
    }

    if (isActiveScrapeRunStatus(run.status)) {
      return { outcome: "active_conflict" }
    }

    const [deleted] = await transaction
      .delete(scrapeRuns)
      .where(eq(scrapeRuns.id, run.id))
      .returning({ id: scrapeRuns.id })

    if (!deleted) {
      throw new Error("The locked terminal scrape run could not be deleted.")
    }

    return { outcome: "deleted" }
  })
}

export async function deleteOwnedTerminalScrapeJob({
  userId,
  scrapeRunId,
  scrapeJobId,
}: OwnedScrapeJobInput): Promise<DeleteOwnedTerminalScrapeJobResult> {
  return db.transaction(async (transaction) => {
    const [run] = await transaction
      .select({ id: scrapeRuns.id, status: scrapeRuns.status })
      .from(scrapeRuns)
      .where(
        and(eq(scrapeRuns.id, scrapeRunId), eq(scrapeRuns.userId, userId)),
      )
      .for("update")

    if (!run) {
      return { outcome: "not_found" }
    }

    const [job] = await transaction
      .select({ id: scrapeJobs.id })
      .from(scrapeJobs)
      .where(
        and(
          eq(scrapeJobs.scrapeRunId, scrapeRunId),
          eq(scrapeJobs.id, scrapeJobId),
        ),
      )
      .for("update")

    if (!job) {
      return { outcome: "not_found" }
    }

    if (isActiveScrapeRunStatus(run.status)) {
      return { outcome: "active_conflict" }
    }

    const [deleted] = await transaction
      .delete(scrapeJobs)
      .where(
        and(
          eq(scrapeJobs.scrapeRunId, scrapeRunId),
          eq(scrapeJobs.id, scrapeJobId),
        ),
      )
      .returning({ id: scrapeJobs.id })

    if (!deleted) {
      throw new Error("The locked Scrape Job could not be deleted.")
    }

    return { outcome: "deleted" }
  })
}

export async function findOwnedScrapeRun({
  userId,
  scrapeRunId,
}: OwnedScrapeRunInput) {
  const run = await db.query.scrapeRuns.findFirst({
    where: and(eq(scrapeRuns.id, scrapeRunId), eq(scrapeRuns.userId, userId)),
    with: {
      fields: { orderBy: asc(scrapeRunFields.position) },
      stages: true,
    },
  })

  if (!run) {
    return null
  }

  return orderRunStages(run)
}

function orderRunStages<
  T extends { stages: Array<{ stage: (typeof SCRAPE_RUN_STAGES)[number] }> },
>(run: T) {
  return {
    ...run,
    stages: SCRAPE_RUN_STAGES.map((stage) =>
      run.stages.find((record) => record.stage === stage),
    ).filter((stage) => stage !== undefined),
  }
}
