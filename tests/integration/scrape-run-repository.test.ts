import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/db"
import { users } from "@/db/schema"
import { newScrapeRunSchema } from "@/lib/scrape-runs/new-scrape-run"
import {
  ActiveScrapeRunConflictError,
  attachWorkflowRunId,
  claimScrapeRun,
  createScrapeRun,
  findOwnedScrapeRun,
  InvalidScrapeRunConfigurationError,
} from "@/lib/server/scrape-runs/repository"

let userSequence = 0

async function createUser(label = "Repository User") {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: `${label} ${userSequence}`,
      email: `repository-${userSequence}@example.com`,
    })
    .returning()

  return user
}

function runConfiguration() {
  return {
    ...newScrapeRunSchema.parse({
      name: " Customer stories ",
      url: "https://example.com/customers?source=nav",
      exampleUrls: [
        "https://example.com/customers/acme?ref=home",
        "https://example.com/customers/globex/",
      ],
      fields: [
        {
          label: "Client Name",
          description: "The customer name",
          required: true,
          primaryIdentifier: true,
        },
        {
          label: "Industry",
          description: "The customer industry",
          required: false,
          primaryIdentifier: false,
        },
      ],
    }),
    filteringModel: "anthropic/claude-sonnet-4.5",
  }
}

beforeEach(async () => {
  await db.delete(users)
})

describe("scrape-run repository", () => {
  it("transactionally creates an immutable run configuration and its pending stages", async () => {
    const user = await createUser()

    const created = await createScrapeRun({
      userId: user.id,
      configuration: runConfiguration(),
    })
    const found = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: created.id,
    })

    expect(found).toMatchObject({
      id: created.id,
      userId: user.id,
      name: "Customer stories",
      targetUrl: "https://example.com/",
      exampleUrls: [
        "https://example.com/customers/acme",
        "https://example.com/customers/globex",
      ],
      filteringModel: "anthropic/claude-sonnet-4.5",
      status: "pending",
    })
    expect(found?.fields).toMatchObject([
      {
        position: 0,
        label: "Client Name",
        key: "client_name",
        description: "The customer name",
        required: true,
        primaryIdentifier: true,
      },
      {
        position: 1,
        label: "Industry",
        key: "industry",
        description: "The customer industry",
        required: false,
        primaryIdentifier: false,
      },
    ])
    expect(
      found?.stages.map(({ stage, status, attemptCount }) => ({
        stage,
        status,
        attemptCount,
      })),
    ).toEqual([
      { stage: "mapping", status: "pending", attemptCount: 0 },
      { stage: "filtering", status: "pending", attemptCount: 0 },
      { stage: "scraping", status: "pending", attemptCount: 0 },
    ])
  })

  it("does not reveal runs or configuration across owners", async () => {
    const owner = await createUser("Owner")
    const otherUser = await createUser("Other User")
    const run = await createScrapeRun({
      userId: owner.id,
      configuration: runConfiguration(),
    })

    await expect(
      findOwnedScrapeRun({
        userId: otherUser.id,
        scrapeRunId: run.id,
      }),
    ).resolves.toBeNull()
    await expect(
      findOwnedScrapeRun({
        userId: owner.id,
        scrapeRunId: run.id,
      }),
    ).resolves.toMatchObject({ id: run.id, fields: run.fields })
  })

  it("attaches the same Workflow run ID idempotently without replacing it", async () => {
    const user = await createUser()
    const run = await createScrapeRun({
      userId: user.id,
      configuration: runConfiguration(),
    })

    await expect(
      attachWorkflowRunId({
        scrapeRunId: run.id,
        workflowRunId: "workflow-run-1",
      }),
    ).resolves.toBe(true)
    await expect(
      attachWorkflowRunId({
        scrapeRunId: run.id,
        workflowRunId: "workflow-run-1",
      }),
    ).resolves.toBe(true)
    await expect(
      attachWorkflowRunId({
        scrapeRunId: run.id,
        workflowRunId: "workflow-run-2",
      }),
    ).resolves.toBe(false)
    await expect(
      attachWorkflowRunId({
        scrapeRunId: run.id + 10_000,
        workflowRunId: "workflow-run-missing",
      }),
    ).resolves.toBe(false)

    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({ workflowRunId: "workflow-run-1" })
  })

  it("lets only one Workflow atomically claim the run and start Mapping", async () => {
    const user = await createUser()
    const run = await createScrapeRun({
      userId: user.id,
      configuration: runConfiguration(),
    })

    const claims = await Promise.all([
      claimScrapeRun({
        scrapeRunId: run.id,
        workflowRunId: "workflow-claim-a",
      }),
      claimScrapeRun({
        scrapeRunId: run.id,
        workflowRunId: "workflow-claim-b",
      }),
    ])
    const claimed = claims.find((claim) => claim !== null)

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1)
    expect(claimed).toMatchObject({
      id: run.id,
      status: "in_progress",
      fields: run.fields,
    })
    expect(claimed?.workflowRunId).toMatch(/^workflow-claim-[ab]$/)
    expect(claimed?.startedAt).toBeInstanceOf(Date)
    expect(
      claimed?.stages.map(({ stage, status, startedAt }) => ({
        stage,
        status,
        started: startedAt instanceof Date,
      })),
    ).toEqual([
      { stage: "mapping", status: "in_progress", started: true },
      { stage: "filtering", status: "pending", started: false },
      { stage: "scraping", status: "pending", started: false },
    ])

    await expect(
      claimScrapeRun({
        scrapeRunId: run.id,
        workflowRunId: claimed!.workflowRunId!,
      }),
    ).resolves.toMatchObject({
      id: run.id,
      status: "in_progress",
      workflowRunId: claimed!.workflowRunId,
    })
  })

  it("only claims a pending run for its already attached Workflow ID", async () => {
    const user = await createUser()
    const run = await createScrapeRun({
      userId: user.id,
      configuration: runConfiguration(),
    })
    await attachWorkflowRunId({
      scrapeRunId: run.id,
      workflowRunId: "attached-workflow",
    })

    await expect(
      claimScrapeRun({
        scrapeRunId: run.id,
        workflowRunId: "different-workflow",
      }),
    ).resolves.toBeNull()
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({ status: "pending", startedAt: null })
    await expect(
      claimScrapeRun({
        scrapeRunId: run.id,
        workflowRunId: "attached-workflow",
      }),
    ).resolves.toMatchObject({ status: "in_progress" })
  })

  it("atomically translates concurrent active-run conflicts", async () => {
    const user = await createUser()

    const results = await Promise.allSettled([
      createScrapeRun({ userId: user.id, configuration: runConfiguration() }),
      createScrapeRun({ userId: user.id, configuration: runConfiguration() }),
    ])

    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ])
    const rejected = results.find((result) => result.status === "rejected")
    expect(rejected?.reason).toBeInstanceOf(ActiveScrapeRunConflictError)
  })

  it("rejects a configuration without exactly one required Primary Identifier", async () => {
    const user = await createUser()
    const configuration = runConfiguration()
    const invalidConfiguration = {
      ...configuration,
      fields: configuration.fields.map((field) => ({
        ...field,
        primaryIdentifier: false,
      })),
    }

    await expect(
      createScrapeRun({ userId: user.id, configuration: invalidConfiguration }),
    ).rejects.toBeInstanceOf(InvalidScrapeRunConfigurationError)

    await expect(
      createScrapeRun({ userId: user.id, configuration }),
    ).resolves.toMatchObject({ userId: user.id, status: "pending" })
  })

  it("rolls back the run when configuration persistence fails", async () => {
    const user = await createUser()
    const configuration = runConfiguration()
    const invalidConfiguration = {
      ...configuration,
      fields: [configuration.fields[0], configuration.fields[0]],
    }

    await expect(
      createScrapeRun({ userId: user.id, configuration: invalidConfiguration }),
    ).rejects.toBeDefined()

    await expect(
      createScrapeRun({ userId: user.id, configuration }),
    ).resolves.toMatchObject({ userId: user.id, status: "pending" })
  })
})
