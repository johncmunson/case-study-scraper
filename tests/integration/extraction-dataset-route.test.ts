import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { GET as getExtractionDataset } from "@/app/api/scrape-runs/[runId]/extraction-dataset/route"
import { db } from "@/db"
import { scrapeJobs, scrapeRunFields, scrapeRuns, users } from "@/db/schema"
import type { ExtractionDatasetFormat } from "@/lib/scrape-runs/extraction-dataset"

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

let userSequence = 0

async function createEligibleRunWithMixedJobs() {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: "Dataset owner",
      email: `dataset-route-${userSequence}@example.com`,
    })
    .returning()
  const [run] = await db
    .insert(scrapeRuns)
    .values({
      userId: user.id,
      name: "Mixed customer stories",
      targetUrl: "https://example.com/",
      exampleUrls: [
        "https://example.com/customers/acme",
        "https://example.com/customers/zeta",
      ],
      filteringModel: "anthropic/claude-sonnet-4.5",
      status: "complete",
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
      label: "Client",
      key: "client",
      description: "The customer name",
      required: true,
      primaryIdentifier: true,
    },
  ])

  await db.insert(scrapeJobs).values([
    {
      scrapeRunId: run.id,
      url: "https://example.com/customers/zeta",
      status: "complete",
      result: { client: "Zeta", industry: null },
    },
    {
      scrapeRunId: run.id,
      url: "https://example.com/customers/acme",
      status: "complete",
      result: { client: "Acme", industry: "Software" },
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
      failureMessage: "Private provider failure",
    },
    {
      scrapeRunId: run.id,
      url: "https://example.com/customers/cancelled",
      status: "cancelled",
    },
  ])

  vi.mocked(getCurrentSession).mockResolvedValue({
    user: { id: String(user.id) },
  } as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>)

  return run
}

beforeEach(async () => {
  await db.delete(users)
})

describe("Extraction Dataset route with persisted mixed Job statuses", () => {
  it.each(["csv", "json"] satisfies readonly ExtractionDatasetFormat[])(
    "includes every complete Job and excludes every unsuccessful Job from %s",
    async (format) => {
      const run = await createEligibleRunWithMixedJobs()
      const response = await getExtractionDataset(
        new Request(
          `http://localhost/api/scrape-runs/${run.id}/extraction-dataset?format=${format}`,
        ),
        { params: Promise.resolve({ runId: String(run.id) }) },
      )

      expect(response.status).toBe(200)
      const body = Buffer.from(await response.arrayBuffer()).toString("utf8")
      expect(body.indexOf("/customers/acme")).toBeLessThan(
        body.indexOf("/customers/zeta"),
      )
      expect(body).toContain("/customers/acme")
      expect(body).toContain("/customers/zeta")
      expect(body).not.toContain("/customers/pending")
      expect(body).not.toContain("/customers/in-progress")
      expect(body).not.toContain("/customers/failed")
      expect(body).not.toContain("/customers/cancelled")
      expect(body).not.toContain("Private provider failure")
    },
  )
})
