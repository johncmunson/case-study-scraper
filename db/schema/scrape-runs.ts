import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"

import {
  SCRAPE_JOB_STATUSES,
  SCRAPE_RUN_ERROR_CODES,
  SCRAPE_RUN_STAGE_STATUSES,
  SCRAPE_RUN_STAGES,
  SCRAPE_RUN_STATUSES,
  type ExtractionResult,
} from "@/lib/scrape-runs/contracts"
import { createdAt, identityPrimaryKey, updatedAt } from "./_helpers"
import { users } from "./auth"

export const scrapeRunStatusEnum = pgEnum(
  "scrape_run_status",
  SCRAPE_RUN_STATUSES,
)
export const scrapeJobStatusEnum = pgEnum(
  "scrape_job_status",
  SCRAPE_JOB_STATUSES,
)
export const scrapeRunStageStatusEnum = pgEnum(
  "scrape_run_stage_status",
  SCRAPE_RUN_STAGE_STATUSES,
)
export const scrapeRunStageEnum = pgEnum("scrape_run_stage", SCRAPE_RUN_STAGES)
export const scrapeRunErrorCodeEnum = pgEnum(
  "scrape_run_error_code",
  SCRAPE_RUN_ERROR_CODES,
)

export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: identityPrimaryKey(),
    userId: integer()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar({ length: 100 }).notNull(),
    targetUrl: text().notNull(),
    exampleUrls: text().array().notNull(),
    filteringModel: text().notNull(),
    status: scrapeRunStatusEnum().default("pending").notNull(),
    workflowRunId: text(),
    cancellationRequestedAt: timestamp({ withTimezone: true }),
    failureCode: scrapeRunErrorCodeEnum(),
    failureMessage: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("scrape_runs_one_active_per_user_idx")
      .on(table.userId)
      .where(sql`${table.status} IN ('pending', 'in_progress')`),
    index("scrape_runs_user_created_at_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    uniqueIndex("scrape_runs_workflow_run_id_unique_idx")
      .on(table.workflowRunId)
      .where(sql`${table.workflowRunId} IS NOT NULL`),
    check("scrape_runs_name_not_blank", sql`BTRIM(${table.name}) <> ''`),
    check(
      "scrape_runs_example_url_count",
      sql`CARDINALITY(${table.exampleUrls}) BETWEEN 2 AND 5`,
    ),
    check(
      "scrape_runs_example_urls_have_no_nulls",
      sql`ARRAY_POSITION(${table.exampleUrls}, NULL) IS NULL`,
    ),
    check(
      "scrape_runs_filtering_model_not_blank",
      sql`BTRIM(${table.filteringModel}) <> ''`,
    ),
  ],
)

export const scrapeRunFields = pgTable(
  "scrape_run_fields",
  {
    id: identityPrimaryKey(),
    scrapeRunId: integer()
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    label: varchar({ length: 30 }).notNull(),
    key: varchar({ length: 30 }).notNull(),
    description: varchar({ length: 100 }).notNull(),
    required: boolean().notNull(),
    primaryIdentifier: boolean().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("scrape_run_fields_run_position_unique_idx").on(
      table.scrapeRunId,
      table.position,
    ),
    uniqueIndex("scrape_run_fields_run_key_unique_idx").on(
      table.scrapeRunId,
      table.key,
    ),
    uniqueIndex("scrape_run_fields_one_primary_per_run_idx")
      .on(table.scrapeRunId)
      .where(sql`${table.primaryIdentifier} = true`),
    check(
      "scrape_run_fields_primary_requires_required",
      sql`NOT ${table.primaryIdentifier} OR ${table.required}`,
    ),
    check(
      "scrape_run_fields_position_nonnegative",
      sql`${table.position} >= 0`,
    ),
  ],
)

export const scrapeRunStages = pgTable(
  "scrape_run_stages",
  {
    id: identityPrimaryKey(),
    scrapeRunId: integer()
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: "cascade" }),
    stage: scrapeRunStageEnum().notNull(),
    status: scrapeRunStageStatusEnum().default("pending").notNull(),
    attemptCount: integer().default(0).notNull(),
    failureCode: scrapeRunErrorCodeEnum(),
    failureMessage: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("scrape_run_stages_run_stage_unique_idx").on(
      table.scrapeRunId,
      table.stage,
    ),
    check(
      "scrape_run_stages_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
)

export const scrapeJobs = pgTable(
  "scrape_jobs",
  {
    id: identityPrimaryKey(),
    scrapeRunId: integer()
      .notNull()
      .references(() => scrapeRuns.id, { onDelete: "cascade" }),
    url: text().notNull(),
    status: scrapeJobStatusEnum().default("pending").notNull(),
    attemptCount: integer().default(0).notNull(),
    result: jsonb().$type<ExtractionResult>(),
    missingRequiredFieldKeys: text().array(),
    failureCode: scrapeRunErrorCodeEnum(),
    failureMessage: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("scrape_jobs_run_url_unique_idx").on(
      table.scrapeRunId,
      table.url,
    ),
    index("scrape_jobs_run_status_idx").on(table.scrapeRunId, table.status),
    check(
      "scrape_jobs_complete_result_consistency",
      sql`(
        (${table.status} = 'complete' AND ${table.result} IS NOT NULL AND JSONB_TYPEOF(${table.result}) = 'object')
        OR
        (${table.status} <> 'complete' AND ${table.result} IS NULL)
      )`,
    ),
    check(
      "scrape_jobs_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
)

export type ScrapeRun = typeof scrapeRuns.$inferSelect
export type NewScrapeRun = typeof scrapeRuns.$inferInsert
export type ScrapeRunField = typeof scrapeRunFields.$inferSelect
export type NewScrapeRunField = typeof scrapeRunFields.$inferInsert
export type ScrapeRunStageRecord = typeof scrapeRunStages.$inferSelect
export type NewScrapeRunStageRecord = typeof scrapeRunStages.$inferInsert
export type ScrapeJob = typeof scrapeJobs.$inferSelect
export type NewScrapeJob = typeof scrapeJobs.$inferInsert
