import { eq } from "drizzle-orm"
import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/db"
import {
  scrapeJobs,
  scrapeRunFields,
  scrapeRuns,
  scrapeRunStages,
  users,
} from "@/db/schema"
import {
  findOwnedScrapeJobDetail,
  findOwnedScrapeRunDetail,
  listOwnedScrapeRunSummaries,
} from "@/lib/server/scrape-runs/read-repository"

let userSequence = 0

async function createUser(label: string) {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: label,
      email: `read-repository-${userSequence}@example.com`,
    })
    .returning()

  return user
}

async function createRun({
  userId,
  name,
  createdAt,
}: {
  userId: number
  name: string
  createdAt: Date
}) {
  const [run] = await db
    .insert(scrapeRuns)
    .values({
      userId,
      name,
      targetUrl: "https://example.com/",
      exampleUrls: [
        "https://example.com/customers/acme",
        "https://example.com/customers/globex",
      ],
      filteringModel: "anthropic/claude-sonnet-4.5",
      status: "complete",
      createdAt,
      startedAt: new Date(createdAt.getTime() + 1_000),
      finishedAt: new Date(createdAt.getTime() + 5_000),
    })
    .returning()

  await db.insert(scrapeRunFields).values([
    {
      scrapeRunId: run.id,
      position: 1,
      label: "Industry",
      key: "industry",
      description: "The customer industry",
      required: false,
      primaryIdentifier: false,
    },
    {
      scrapeRunId: run.id,
      position: 0,
      label: "Client Name",
      key: "client_name",
      description: "The customer name",
      required: true,
      primaryIdentifier: true,
    },
  ])
  await db.insert(scrapeRunStages).values([
    { scrapeRunId: run.id, stage: "scraping", status: "complete" },
    { scrapeRunId: run.id, stage: "mapping", status: "complete" },
    { scrapeRunId: run.id, stage: "filtering", status: "complete" },
  ])

  return run
}

beforeEach(async () => {
  await db.delete(users)
})

describe("scrape-run polling read repository", () => {
  it("lists every owned run newest-first with aggregate counts and no hidden limit", async () => {
    const owner = await createUser("Owner")
    const otherUser = await createUser("Other User")
    const oldest = await createRun({
      userId: owner.id,
      name: "Oldest",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    })
    const middle = await createRun({
      userId: owner.id,
      name: "Middle",
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
    })
    const newest = await createRun({
      userId: owner.id,
      name: "Newest",
      createdAt: new Date("2026-04-03T10:00:00.000Z"),
    })
    await createRun({
      userId: otherUser.id,
      name: "Other user's run",
      createdAt: new Date("2026-04-04T10:00:00.000Z"),
    })

    await db.insert(scrapeJobs).values([
      {
        scrapeRunId: newest.id,
        url: "https://example.com/customers/acme",
        status: "complete",
        result: { client_name: "Acme", industry: "Software" },
      },
      {
        scrapeRunId: newest.id,
        url: "https://example.com/customers/globex",
        status: "failed",
        failureCode: "scrape_failed",
        failureMessage: "Extraction failed.",
      },
      {
        scrapeRunId: middle.id,
        url: "https://example.com/customers/one",
        status: "cancelled",
      },
      {
        scrapeRunId: middle.id,
        url: "https://example.com/customers/two",
        status: "cancelled",
      },
    ])

    const summaries = await listOwnedScrapeRunSummaries({ userId: owner.id })

    expect(summaries.map(({ id }) => id)).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ])
    expect(summaries[0].jobCounts).toEqual({
      total: 2,
      pending: 0,
      inProgress: 0,
      complete: 1,
      failed: 1,
      cancelled: 0,
    })
    expect(summaries[1].jobCounts).toEqual({
      total: 2,
      pending: 0,
      inProgress: 0,
      complete: 0,
      failed: 0,
      cancelled: 2,
    })
    expect(summaries[2].jobCounts).toEqual({
      total: 0,
      pending: 0,
      inProgress: 0,
      complete: 0,
      failed: 0,
      cancelled: 0,
    })
  })

  it("returns ordered configuration and stages, aggregate counts, and only the Primary Identifier from job results", async () => {
    const owner = await createUser("Owner")
    const run = await createRun({
      userId: owner.id,
      name: "Customer stories",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    })
    const [completeJob, failedJob] = await db
      .insert(scrapeJobs)
      .values([
        {
          scrapeRunId: run.id,
          url: "https://example.com/customers/acme",
          status: "complete",
          attemptCount: 1,
          result: {
            client_name: "Acme",
            industry: "A heavyweight value for job detail only",
          },
        },
        {
          scrapeRunId: run.id,
          url: "https://example.com/customers/globex",
          status: "failed",
          attemptCount: 3,
          failureCode: "scrape_failed",
          failureMessage: "Extraction failed.",
        },
      ])
      .returning()

    const detail = await findOwnedScrapeRunDetail({
      userId: owner.id,
      scrapeRunId: run.id,
    })

    expect(detail).toMatchObject({
      id: run.id,
      failureCode: null,
      failureMessage: null,
      exampleUrls: [
        "https://example.com/customers/acme",
        "https://example.com/customers/globex",
      ],
      filteringModel: "anthropic/claude-sonnet-4.5",
      jobCounts: {
        total: 2,
        pending: 0,
        inProgress: 0,
        complete: 1,
        failed: 1,
        cancelled: 0,
      },
    })
    expect(detail?.fields.map(({ key }) => key)).toEqual([
      "client_name",
      "industry",
    ])
    expect(detail?.stages.map(({ stage }) => stage)).toEqual([
      "mapping",
      "filtering",
      "scraping",
    ])
    expect(detail?.jobs).toMatchObject([
      {
        id: completeJob.id,
        status: "complete",
        primaryIdentifier: "Acme",
        failureCode: null,
      },
      {
        id: failedJob.id,
        status: "failed",
        primaryIdentifier: null,
        failureCode: "scrape_failed",
      },
    ])
    expect(detail).not.toHaveProperty("workflowRunId")
    expect(detail?.jobs[0]).not.toHaveProperty("result")
    expect(detail?.jobs[1]).not.toHaveProperty("failureMessage")
  })

  it("returns sanitized Run-level failure fields only to the owner", async () => {
    const owner = await createUser("Owner")
    const otherUser = await createUser("Other User")
    const run = await createRun({
      userId: owner.id,
      name: "Failed preparation",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    })

    await db
      .update(scrapeRuns)
      .set({
        status: "failed",
        failureCode: "workflow_dispatch_failed",
        failureMessage: "The scrape run could not be started.",
      })
      .where(eq(scrapeRuns.id, run.id))

    await expect(
      findOwnedScrapeRunDetail({
        userId: owner.id,
        scrapeRunId: run.id,
      }),
    ).resolves.toMatchObject({
      failureCode: "workflow_dispatch_failed",
      failureMessage: "The scrape run could not be started.",
    })
    await expect(
      findOwnedScrapeRunDetail({
        userId: otherUser.id,
        scrapeRunId: run.id,
      }),
    ).resolves.toBeNull()
  })

  it("enforces ownership and nested run membership while returning full job detail", async () => {
    const owner = await createUser("Owner")
    const otherUser = await createUser("Other User")
    const run = await createRun({
      userId: owner.id,
      name: "Customer stories",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    })
    const otherRun = await createRun({
      userId: owner.id,
      name: "Other run",
      createdAt: new Date("2026-04-02T10:00:00.000Z"),
    })
    const [job] = await db
      .insert(scrapeJobs)
      .values({
        scrapeRunId: run.id,
        url: "https://example.com/customers/acme",
        status: "complete",
        attemptCount: 1,
        result: { client_name: "Acme", industry: "Software" },
      })
      .returning()

    await expect(
      findOwnedScrapeRunDetail({
        userId: otherUser.id,
        scrapeRunId: run.id,
      }),
    ).resolves.toBeNull()
    await expect(
      findOwnedScrapeJobDetail({
        userId: otherUser.id,
        scrapeRunId: run.id,
        scrapeJobId: job.id,
      }),
    ).resolves.toBeNull()
    await expect(
      findOwnedScrapeJobDetail({
        userId: owner.id,
        scrapeRunId: otherRun.id,
        scrapeJobId: job.id,
      }),
    ).resolves.toBeNull()
    await expect(
      findOwnedScrapeJobDetail({
        userId: owner.id,
        scrapeRunId: run.id,
        scrapeJobId: job.id,
      }),
    ).resolves.toMatchObject({
      id: job.id,
      result: { client_name: "Acme", industry: "Software" },
      missingRequiredFieldKeys: null,
      failureCode: null,
      failureMessage: null,
    })
  })
})
