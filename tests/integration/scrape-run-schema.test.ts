import { count, eq } from "drizzle-orm"
import { beforeEach, describe, expect, expectTypeOf, it } from "vitest"

import { db } from "@/db"
import {
  scrapeJobs,
  scrapeJobStatusEnum,
  scrapeRunErrorCodeEnum,
  scrapeRunFields,
  scrapeRuns,
  scrapeRunStageEnum,
  scrapeRunStages,
  scrapeRunStageStatusEnum,
  scrapeRunStatusEnum,
  users,
  type NewScrapeJob,
  type NewScrapeRun,
  type ScrapeJob,
  type ScrapeRun,
} from "@/db/schema"
import type {
  ExtractionResult,
  ScrapeJobStatus,
  ScrapeRunStatus,
} from "@/lib/scrape-runs/contracts"

let userSequence = 0

async function createUser() {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: `Schema User ${userSequence}`,
      email: `schema-${userSequence}@example.com`,
    })
    .returning()

  return user
}

async function createRun(
  userId: number,
  overrides: Partial<NewScrapeRun> = {},
) {
  const [run] = await db
    .insert(scrapeRuns)
    .values({
      userId,
      name: "Case studies",
      targetUrl: "https://example.com/",
      exampleUrls: [
        "https://example.com/cases/one",
        "https://example.com/cases/two",
      ],
      filteringModel: "anthropic/claude-sonnet-4.5",
      ...overrides,
    })
    .returning()

  return run
}

function expectConstraintViolation(
  promise: PromiseLike<unknown>,
  code: "23505" | "23514" = "23505",
) {
  return expect(promise).rejects.toMatchObject({ cause: { code } })
}

beforeEach(async () => {
  await db.delete(users)
})

describe("scrape-run schema", () => {
  it("exports the lifecycle enums and strongly inferred record types", () => {
    expect(scrapeRunStatusEnum.enumValues).toEqual([
      "pending",
      "in_progress",
      "complete",
      "failed",
      "cancelled",
    ])
    expect(scrapeJobStatusEnum.enumValues).toEqual(
      scrapeRunStatusEnum.enumValues,
    )
    expect(scrapeRunStageStatusEnum.enumValues).toContain("skipped")
    expect(scrapeRunStageEnum.enumValues).toEqual([
      "mapping",
      "filtering",
      "scraping",
    ])
    expect(scrapeRunErrorCodeEnum.enumValues).toContain(
      "unexpected_workflow_failure",
    )

    expectTypeOf<ScrapeRun["status"]>().toEqualTypeOf<ScrapeRunStatus>()
    expectTypeOf<ScrapeJob["status"]>().toEqualTypeOf<ScrapeJobStatus>()
    expectTypeOf<ScrapeJob["result"]>().toEqualTypeOf<ExtractionResult | null>()
    expectTypeOf<NewScrapeRun["status"]>().toEqualTypeOf<
      ScrapeRunStatus | undefined
    >()
    expectTypeOf<NewScrapeJob["result"]>().toEqualTypeOf<
      ExtractionResult | null | undefined
    >()
  })

  it("applies lifecycle defaults and rejects negative positions and attempts", async () => {
    const user = await createUser()
    const run = await createRun(user.id)
    const [stage] = await db
      .insert(scrapeRunStages)
      .values({ scrapeRunId: run.id, stage: "mapping" })
      .returning()
    const [job] = await db
      .insert(scrapeJobs)
      .values({
        scrapeRunId: run.id,
        url: "https://example.com/cases/one",
      })
      .returning()

    expect(run).toMatchObject({ status: "pending" })
    expect(run.createdAt).toBeInstanceOf(Date)
    expect(run.updatedAt).toBeInstanceOf(Date)
    expect(stage).toMatchObject({ status: "pending", attemptCount: 0 })
    expect(job).toMatchObject({ status: "pending", attemptCount: 0 })

    await expectConstraintViolation(
      db.insert(scrapeRunFields).values({
        scrapeRunId: run.id,
        position: -1,
        label: "Client",
        key: "client",
        description: "The client name",
        required: true,
        primaryIdentifier: true,
      }),
      "23514",
    )
    await expectConstraintViolation(
      db.insert(scrapeRunStages).values({
        scrapeRunId: run.id,
        stage: "filtering",
        attemptCount: -1,
      }),
      "23514",
    )
    await expectConstraintViolation(
      db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/cases/two",
        attemptCount: -1,
      }),
      "23514",
    )
  })

  it("allows only one active run per user while allowing terminal history", async () => {
    const user = await createUser()
    await createRun(user.id, { status: "pending" })

    await expectConstraintViolation(
      db.insert(scrapeRuns).values({
        userId: user.id,
        name: "A second active run",
        targetUrl: "https://example.net/",
        exampleUrls: [
          "https://example.net/cases/one",
          "https://example.net/cases/two",
        ],
        filteringModel: "anthropic/claude-sonnet-4.5",
        status: "in_progress",
      }),
    )

    await expect(
      createRun(user.id, { name: "Terminal run", status: "complete" }),
    ).resolves.toMatchObject({ status: "complete" })

    const otherUser = await createUser()
    await expect(createRun(otherUser.id)).resolves.toMatchObject({
      status: "pending",
    })
  })

  it("enforces field position, key, primary, and stage uniqueness per run", async () => {
    const user = await createUser()
    const run = await createRun(user.id)

    await db.insert(scrapeRunFields).values({
      scrapeRunId: run.id,
      position: 0,
      label: "Client",
      key: "client",
      description: "The client name",
      required: true,
      primaryIdentifier: true,
    })

    await expectConstraintViolation(
      db.insert(scrapeRunFields).values({
        scrapeRunId: run.id,
        position: 0,
        label: "Industry",
        key: "industry",
        description: "The client industry",
        required: false,
        primaryIdentifier: false,
      }),
    )
    await expectConstraintViolation(
      db.insert(scrapeRunFields).values({
        scrapeRunId: run.id,
        position: 1,
        label: "Client duplicate",
        key: "client",
        description: "Another client value",
        required: false,
        primaryIdentifier: false,
      }),
    )
    await expectConstraintViolation(
      db.insert(scrapeRunFields).values({
        scrapeRunId: run.id,
        position: 1,
        label: "Project",
        key: "project",
        description: "The project name",
        required: true,
        primaryIdentifier: true,
      }),
    )

    await db.insert(scrapeRunStages).values({
      scrapeRunId: run.id,
      stage: "mapping",
    })
    await expectConstraintViolation(
      db.insert(scrapeRunStages).values({
        scrapeRunId: run.id,
        stage: "mapping",
      }),
    )
  })

  it("enforces unique job URLs per run and unique attached Workflow run IDs", async () => {
    const firstUser = await createUser()
    const secondUser = await createUser()
    const firstRun = await createRun(firstUser.id, {
      workflowRunId: "workflow-run-1",
    })
    const secondRun = await createRun(secondUser.id)

    await db.insert(scrapeJobs).values({
      scrapeRunId: firstRun.id,
      url: "https://example.com/cases/one",
    })
    await expectConstraintViolation(
      db.insert(scrapeJobs).values({
        scrapeRunId: firstRun.id,
        url: "https://example.com/cases/one",
      }),
    )

    await expect(
      db.insert(scrapeJobs).values({
        scrapeRunId: secondRun.id,
        url: "https://example.com/cases/one",
      }),
    ).resolves.toBeDefined()

    await expectConstraintViolation(
      db
        .update(scrapeRuns)
        .set({ workflowRunId: "workflow-run-1" })
        .where(eq(scrapeRuns.id, secondRun.id)),
    )
  })

  it("requires a primary field to be application-required", async () => {
    const user = await createUser()
    const run = await createRun(user.id)

    await expectConstraintViolation(
      db.insert(scrapeRunFields).values({
        scrapeRunId: run.id,
        position: 0,
        label: "Client",
        key: "client",
        description: "The client name",
        required: false,
        primaryIdentifier: true,
      }),
      "23514",
    )
  })

  it("requires successful jobs to have object results and unfinished jobs to have none", async () => {
    const user = await createUser()
    const run = await createRun(user.id)

    await expectConstraintViolation(
      db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/cases/one",
        status: "complete",
      }),
      "23514",
    )
    await expectConstraintViolation(
      db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/cases/two",
        result: { client: "Acme" },
      }),
      "23514",
    )

    await expect(
      db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/cases/three",
        status: "complete",
        result: { client: "Acme", industry: null },
      }),
    ).resolves.toBeDefined()
  })

  it("cascades direct Run Deletion through fields, stages, jobs, and results only", async () => {
    const user = await createUser()
    const selectedRun = await createRun(user.id, { status: "complete" })
    const unrelatedRun = await createRun(user.id, { status: "complete" })

    for (const run of [selectedRun, unrelatedRun]) {
      await db.insert(scrapeRunFields).values({
        scrapeRunId: run.id,
        position: 0,
        label: "Client",
        key: "client",
        description: "The client name",
        required: true,
        primaryIdentifier: true,
      })
      await db.insert(scrapeRunStages).values([
        { scrapeRunId: run.id, stage: "mapping" },
        { scrapeRunId: run.id, stage: "filtering" },
        { scrapeRunId: run.id, stage: "scraping" },
      ])
      await db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: `https://example.com/cases/${run.id}`,
        status: "complete",
        result: { client: `Client ${run.id}` },
      })
    }

    await db.delete(scrapeRuns).where(eq(scrapeRuns.id, selectedRun.id))

    const [selectedRuns, selectedFields, selectedStages, selectedJobs] =
      await Promise.all([
        db.select().from(scrapeRuns).where(eq(scrapeRuns.id, selectedRun.id)),
        db
          .select()
          .from(scrapeRunFields)
          .where(eq(scrapeRunFields.scrapeRunId, selectedRun.id)),
        db
          .select()
          .from(scrapeRunStages)
          .where(eq(scrapeRunStages.scrapeRunId, selectedRun.id)),
        db
          .select()
          .from(scrapeJobs)
          .where(eq(scrapeJobs.scrapeRunId, selectedRun.id)),
      ])

    expect(selectedRuns).toHaveLength(0)
    expect(selectedFields).toHaveLength(0)
    expect(selectedStages).toHaveLength(0)
    expect(selectedJobs).toHaveLength(0)
    await expect(
      db.select().from(users).where(eq(users.id, user.id)),
    ).resolves.toHaveLength(1)
    await expect(
      db.select().from(scrapeRuns).where(eq(scrapeRuns.id, unrelatedRun.id)),
    ).resolves.toHaveLength(1)
    await expect(
      db
        .select()
        .from(scrapeRunFields)
        .where(eq(scrapeRunFields.scrapeRunId, unrelatedRun.id)),
    ).resolves.toHaveLength(1)
    await expect(
      db
        .select()
        .from(scrapeRunStages)
        .where(eq(scrapeRunStages.scrapeRunId, unrelatedRun.id)),
    ).resolves.toHaveLength(3)
    await expect(
      db
        .select()
        .from(scrapeJobs)
        .where(eq(scrapeJobs.scrapeRunId, unrelatedRun.id)),
    ).resolves.toMatchObject([{ result: { client: `Client ${unrelatedRun.id}` } }])
  })

  it("cascades user deletion through runs, fields, stages, jobs, and results", async () => {
    const user = await createUser()
    const run = await createRun(user.id)

    await db.insert(scrapeRunFields).values({
      scrapeRunId: run.id,
      position: 0,
      label: "Client",
      key: "client",
      description: "The client name",
      required: true,
      primaryIdentifier: true,
    })
    await db.insert(scrapeRunStages).values([
      { scrapeRunId: run.id, stage: "mapping" },
      { scrapeRunId: run.id, stage: "filtering" },
      { scrapeRunId: run.id, stage: "scraping" },
    ])
    await db.insert(scrapeJobs).values({
      scrapeRunId: run.id,
      url: "https://example.com/cases/one",
      status: "complete",
      result: { client: "Acme" },
    })

    await db.delete(users).where(eq(users.id, user.id))

    const [runCount, fieldCount, stageCount, jobCount] = await Promise.all([
      db.select({ count: count() }).from(scrapeRuns),
      db.select({ count: count() }).from(scrapeRunFields),
      db.select({ count: count() }).from(scrapeRunStages),
      db.select({ count: count() }).from(scrapeJobs),
    ])

    expect(runCount[0].count).toBe(0)
    expect(fieldCount[0].count).toBe(0)
    expect(stageCount[0].count).toBe(0)
    expect(jobCount[0].count).toBe(0)
  })
})
