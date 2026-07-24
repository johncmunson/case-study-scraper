import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/db"
import { scrapeJobs, scrapeRunFields, scrapeRuns, users } from "@/db/schema"
import {
  buildExtractionDataset,
  type ExtractionDatasetInvalidReason,
} from "@/lib/scrape-runs/extraction-dataset"
import type {
  ExtractionResult,
  ScrapeRunStatus,
} from "@/lib/scrape-runs/contracts"
import { findOwnedScrapeRunExtractionDatasetSource } from "@/lib/server/scrape-runs/extraction-dataset-repository"

let userSequence = 0

async function createUser(label: string) {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: label,
      email: `extraction-dataset-${userSequence}@example.com`,
    })
    .returning()

  return user
}

async function createRun({
  userId,
  name = "Customer stories",
  status = "complete",
}: {
  userId: number
  name?: string
  status?: ScrapeRunStatus
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
      status,
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

  return run
}

beforeEach(async () => {
  await db.delete(users)
})

describe("Extraction Dataset repository", () => {
  it("loads only an owned Run's complete Jobs with ordered fields and Canonical Page URLs", async () => {
    const owner = await createUser("Owner")
    const otherUser = await createUser("Other User")
    const run = await createRun({ userId: owner.id })
    const otherRun = await createRun({
      userId: otherUser.id,
      name: "Private customer stories",
    })

    await db.insert(scrapeJobs).values([
      {
        scrapeRunId: run.id,
        url: "https://example.com/customers/zeta",
        status: "complete",
        result: { client_name: "Zeta", industry: null },
      },
      {
        scrapeRunId: run.id,
        url: "https://example.com/customers/acme",
        status: "complete",
        result: { client_name: "Acme", industry: "Software" },
      },
      {
        scrapeRunId: run.id,
        url: "https://example.com/customers/pending",
        status: "pending",
      },
      {
        scrapeRunId: run.id,
        url: "https://example.com/customers/in-progress",
        status: "in_progress",
      },
      {
        scrapeRunId: run.id,
        url: "https://example.com/customers/failed",
        status: "failed",
        failureCode: "scrape_failed",
        failureMessage: "Sensitive provider failure",
      },
      {
        scrapeRunId: run.id,
        url: "https://example.com/customers/cancelled",
        status: "cancelled",
      },
      {
        scrapeRunId: otherRun.id,
        url: "https://example.com/customers/private",
        status: "complete",
        result: { client_name: "Private", industry: "Private" },
      },
    ])

    const source = await findOwnedScrapeRunExtractionDatasetSource({
      userId: owner.id,
      scrapeRunId: run.id,
    })

    expect(source).toEqual({
      id: run.id,
      name: "Customer stories",
      status: "complete",
      fields: [
        {
          position: 0,
          label: "Client Name",
          key: "client_name",
          required: true,
        },
        {
          position: 1,
          label: "Industry",
          key: "industry",
          required: false,
        },
      ],
      successfulJobs: [
        {
          canonicalPageUrl: "https://example.com/customers/acme",
          result: { client_name: "Acme", industry: "Software" },
        },
        {
          canonicalPageUrl: "https://example.com/customers/zeta",
          result: { client_name: "Zeta", industry: null },
        },
      ],
    })
    expect(source).not.toHaveProperty("targetUrl")
    expect(source?.successfulJobs[0]).not.toHaveProperty("id")
    expect(source?.successfulJobs[0]).not.toHaveProperty("status")

    expect(source && buildExtractionDataset(source)).toEqual({
      status: "available",
      records: [
        {
          canonicalPageUrl: "https://example.com/customers/acme",
          fields: { client_name: "Acme", industry: "Software" },
        },
        {
          canonicalPageUrl: "https://example.com/customers/zeta",
          fields: { client_name: "Zeta", industry: null },
        },
      ],
    })
  })

  it("keeps missing and non-owned Runs indistinguishable", async () => {
    const owner = await createUser("Owner")
    const otherUser = await createUser("Other User")
    const run = await createRun({ userId: owner.id })

    await expect(
      findOwnedScrapeRunExtractionDatasetSource({
        userId: otherUser.id,
        scrapeRunId: run.id,
      }),
    ).resolves.toBeNull()
    await expect(
      findOwnedScrapeRunExtractionDatasetSource({
        userId: owner.id,
        scrapeRunId: run.id + 10_000,
      }),
    ).resolves.toBeNull()
  })

  it.each(["pending", "in_progress"] satisfies readonly ScrapeRunStatus[])(
    "returns the owned active %s Run state without loading Extraction Results from successful Jobs",
    async (status) => {
      const owner = await createUser(`Owner ${status}`)
      const run = await createRun({ userId: owner.id, status })
      await db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/customers/acme",
        status: "complete",
        result: { client_name: "Acme", industry: null },
      })

      await expect(
        findOwnedScrapeRunExtractionDatasetSource({
          userId: owner.id,
          scrapeRunId: run.id,
        }),
      ).resolves.toMatchObject({
        status,
        successfulJobs: [],
      })
    },
  )

  it.each([
    "complete",
    "failed",
    "cancelled",
  ] satisfies readonly ScrapeRunStatus[])(
    "returns the owned terminal %s Run state and its successful Jobs",
    async (status) => {
      const owner = await createUser(`Owner ${status}`)
      const run = await createRun({ userId: owner.id, status })
      await db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/customers/acme",
        status: "complete",
        result: { client_name: "Acme", industry: null },
      })

      await expect(
        findOwnedScrapeRunExtractionDatasetSource({
          userId: owner.id,
          scrapeRunId: run.id,
        }),
      ).resolves.toMatchObject({
        status,
        successfulJobs: [{ result: { client_name: "Acme", industry: null } }],
      })
    },
  )

  it.each([
    "complete",
    "failed",
    "cancelled",
  ] satisfies readonly ScrapeRunStatus[])(
    "represents a terminal %s Run without complete Jobs as unavailable",
    async (status) => {
      const owner = await createUser(`Owner ${status}`)
      const run = await createRun({ userId: owner.id, status })
      await db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/customers/failed",
        status: "failed",
        failureCode: "scrape_failed",
      })

      const source = await findOwnedScrapeRunExtractionDatasetSource({
        userId: owner.id,
        scrapeRunId: run.id,
      })

      expect(source?.successfulJobs).toEqual([])
      expect(source && buildExtractionDataset(source)).toEqual({
        status: "unavailable",
        reason: "no-successful-results",
      })
    },
  )

  it.each([
    [{ client_name: "Acme" }, "field-keys-mismatch"],
    [
      { client_name: "Acme", industry: null, extra: "unexpected" },
      "field-keys-mismatch",
    ],
    [{ client_name: "Acme", industry: 42 }, "field-value-invalid"],
    [{ client_name: null, industry: null }, "required-field-missing"],
  ] satisfies ReadonlyArray<readonly [unknown, ExtractionDatasetInvalidReason]>)(
    "passes corrupt successful JSONB to dataset validation without coercion: %s",
    async (storedResult, reason) => {
      const owner = await createUser(`Owner ${reason}`)
      const run = await createRun({ userId: owner.id })
      await db.insert(scrapeJobs).values({
        scrapeRunId: run.id,
        url: "https://example.com/customers/acme",
        status: "complete",
        result: storedResult as ExtractionResult,
      })

      const source = await findOwnedScrapeRunExtractionDatasetSource({
        userId: owner.id,
        scrapeRunId: run.id,
      })

      expect(source && buildExtractionDataset(source)).toEqual({
        status: "invalid",
        reason,
      })
    },
  )
})
