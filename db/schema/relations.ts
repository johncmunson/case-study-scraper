import { relations } from "drizzle-orm"

import { accounts, sessions, users } from "./auth"
import {
  scrapeJobs,
  scrapeRunFields,
  scrapeRuns,
  scrapeRunStages,
} from "./scrape-runs"

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  scrapeRuns: many(scrapeRuns),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}))

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}))

export const scrapeRunsRelations = relations(scrapeRuns, ({ many, one }) => ({
  user: one(users, {
    fields: [scrapeRuns.userId],
    references: [users.id],
  }),
  fields: many(scrapeRunFields),
  stages: many(scrapeRunStages),
  jobs: many(scrapeJobs),
}))

export const scrapeRunFieldsRelations = relations(
  scrapeRunFields,
  ({ one }) => ({
    run: one(scrapeRuns, {
      fields: [scrapeRunFields.scrapeRunId],
      references: [scrapeRuns.id],
    }),
  }),
)

export const scrapeRunStagesRelations = relations(
  scrapeRunStages,
  ({ one }) => ({
    run: one(scrapeRuns, {
      fields: [scrapeRunStages.scrapeRunId],
      references: [scrapeRuns.id],
    }),
  }),
)

export const scrapeJobsRelations = relations(scrapeJobs, ({ one }) => ({
  run: one(scrapeRuns, {
    fields: [scrapeJobs.scrapeRunId],
    references: [scrapeRuns.id],
  }),
}))
