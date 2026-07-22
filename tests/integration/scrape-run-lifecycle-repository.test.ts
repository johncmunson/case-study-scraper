import { beforeEach, describe, expect, it } from "vitest"

import { db } from "@/db"
import { scrapeJobs, users } from "@/db/schema"
import { newScrapeRunSchema } from "@/lib/scrape-runs/new-scrape-run"
import {
  claimScrapeRun,
  createScrapeRun,
  findOwnedScrapeRun,
} from "@/lib/server/scrape-runs/repository"
import {
  claimScrapeJob,
  completeMappingAndStartFiltering,
  completeScrapeRunCancellation,
  completeScrapeJob,
  createScrapeJobsAndStartScraping,
  failPendingWorkflowDispatch,
  failPreparationStage,
  failScrapeJob,
  finalizeScraping,
  getScrapeJobAggregates,
  handleUnexpectedWorkflowFailure,
  InvalidScrapeJobSetError,
  recordStageAttempt,
  requestScrapeRunCancellation,
} from "@/lib/server/scrape-runs/lifecycle-repository"

let userSequence = 0

async function createUser() {
  userSequence += 1
  const [user] = await db
    .insert(users)
    .values({
      name: `Lifecycle User ${userSequence}`,
      email: `lifecycle-${userSequence}@example.com`,
    })
    .returning()

  return user
}

function runConfiguration() {
  return {
    ...newScrapeRunSchema.parse({
      name: "Customer stories",
      url: "https://example.com/",
      exampleUrls: [
        "https://example.com/customers/acme",
        "https://example.com/customers/globex",
      ],
      fields: [
        {
          label: "Client Name",
          description: "The customer name",
          required: true,
          primaryIdentifier: true,
        },
      ],
    }),
    filteringModel: "anthropic/claude-sonnet-4.5",
  }
}

const selectedUrls = [
  "https://example.com/customers/acme",
  "https://example.com/customers/globex",
  "https://example.com/customers/initech",
] as const

async function createClaimedRun() {
  const user = await createUser()
  const run = await createScrapeRun({
    userId: user.id,
    configuration: runConfiguration(),
  })
  const claimed = await claimScrapeRun({
    scrapeRunId: run.id,
    workflowRunId: `workflow-${run.id}`,
  })

  if (!claimed) {
    throw new Error("Expected the run to be claimed")
  }

  return { user, run: claimed }
}

async function createScrapingRun() {
  const created = await createClaimedRun()
  await completeMappingAndStartFiltering({ scrapeRunId: created.run.id })
  const jobs = await createScrapeJobsAndStartScraping({
    scrapeRunId: created.run.id,
    canonicalPageUrls: selectedUrls,
  })

  if (!jobs) {
    throw new Error("Expected Scraping to start")
  }

  return { ...created, jobs }
}

beforeEach(async () => {
  await db.delete(users)
})

describe("scrape-run lifecycle repository", () => {
  it("compensates a rejected Workflow dispatch while the run is pending", async () => {
    const user = await createUser()
    const run = await createScrapeRun({
      userId: user.id,
      configuration: runConfiguration(),
    })

    await expect(
      failPendingWorkflowDispatch({
        scrapeRunId: run.id,
        failure: {
          code: "workflow_dispatch_failed",
          message: "The scrape run could not be started.",
        },
      }),
    ).resolves.toBe(true)
    await expect(
      failPendingWorkflowDispatch({
        scrapeRunId: run.id,
        failure: {
          code: "workflow_dispatch_failed",
          message: "A replay must not overwrite the failure.",
        },
      }),
    ).resolves.toBe(false)
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "workflow_dispatch_failed",
      failureMessage: "The scrape run could not be started.",
      stages: [
        { stage: "mapping", status: "skipped" },
        { stage: "filtering", status: "skipped" },
        { stage: "scraping", status: "skipped" },
      ],
    })
  })

  it("records Mapping attempts and atomically advances to Filtering", async () => {
    const { user, run } = await createClaimedRun()

    await expect(
      recordStageAttempt({ scrapeRunId: run.id, stage: "mapping" }),
    ).resolves.toMatchObject({
      stage: "mapping",
      status: "in_progress",
      attemptCount: 1,
    })
    await expect(
      completeMappingAndStartFiltering({ scrapeRunId: run.id }),
    ).resolves.toBe(true)

    const found = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: run.id,
    })
    expect(
      found?.stages.map(
        ({ stage, status, attemptCount, startedAt, finishedAt }) => ({
          stage,
          status,
          attemptCount,
          started: startedAt instanceof Date,
          finished: finishedAt instanceof Date,
        }),
      ),
    ).toEqual([
      {
        stage: "mapping",
        status: "complete",
        attemptCount: 1,
        started: true,
        finished: true,
      },
      {
        stage: "filtering",
        status: "in_progress",
        attemptCount: 0,
        started: true,
        finished: false,
      },
      {
        stage: "scraping",
        status: "pending",
        attemptCount: 0,
        started: false,
        finished: false,
      },
    ])

    await expect(
      completeMappingAndStartFiltering({ scrapeRunId: run.id }),
    ).resolves.toBe(true)
    await expect(
      recordStageAttempt({ scrapeRunId: run.id, stage: "mapping" }),
    ).resolves.toBeNull()
  })

  it("creates every selected job idempotently before starting Scraping", async () => {
    const { user, run } = await createClaimedRun()
    await completeMappingAndStartFiltering({ scrapeRunId: run.id })

    const jobs = await createScrapeJobsAndStartScraping({
      scrapeRunId: run.id,
      canonicalPageUrls: [...selectedUrls, selectedUrls[0]],
    })
    const replayed = await createScrapeJobsAndStartScraping({
      scrapeRunId: run.id,
      canonicalPageUrls: ["https://example.com/customers/not-appended"],
    })

    expect(jobs?.map((job) => job.url)).toEqual(selectedUrls)
    expect(replayed?.map((job) => job.url)).toEqual(selectedUrls)
    await expect(
      getScrapeJobAggregates({ scrapeRunId: run.id }),
    ).resolves.toEqual({
      total: 3,
      pending: 3,
      inProgress: 0,
      complete: 0,
      failed: 0,
      cancelled: 0,
    })

    const invalidRun = await createClaimedRun()
    await completeMappingAndStartFiltering({ scrapeRunId: invalidRun.run.id })
    await expect(
      createScrapeJobsAndStartScraping({
        scrapeRunId: invalidRun.run.id,
        canonicalPageUrls: ["https://example.com/customers/only-one"],
      }),
    ).rejects.toBeInstanceOf(InvalidScrapeJobSetError)
    await expect(
      failPreparationStage({
        scrapeRunId: invalidRun.run.id,
        stage: "filtering",
        failure: {
          code: "job_creation_failed",
          message: "duplicate key details must not be stored",
        },
      }),
    ).resolves.toBe(true)
    await expect(
      findOwnedScrapeRun({
        userId: invalidRun.user.id,
        scrapeRunId: invalidRun.run.id,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "job_creation_failed",
      failureMessage: "Scrape jobs could not be created.",
      stages: [
        { stage: "mapping", status: "complete" },
        {
          stage: "filtering",
          status: "failed",
          failureCode: "job_creation_failed",
        },
        { stage: "scraping", status: "skipped" },
      ],
    })
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "in_progress",
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "complete" },
        { stage: "scraping", status: "in_progress" },
      ],
    })
  })

  it("claims and completes or fails jobs while protecting terminal results", async () => {
    const { run, jobs } = await createScrapingRun()
    const [successfulJob, failedJob] = jobs

    await expect(
      claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: successfulJob.id }),
    ).resolves.toMatchObject({ status: "in_progress", attemptCount: 1 })
    await expect(
      claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: successfulJob.id }),
    ).resolves.toMatchObject({ status: "in_progress", attemptCount: 2 })
    await expect(
      completeScrapeJob({
        scrapeRunId: run.id,
        scrapeJobId: successfulJob.id,
        result: { client_name: "Acme" },
      }),
    ).resolves.toMatchObject({
      status: "complete",
      attemptCount: 2,
      result: { client_name: "Acme" },
    })
    await expect(
      failScrapeJob({
        scrapeRunId: run.id,
        scrapeJobId: successfulJob.id,
        failure: { code: "scrape_failed", message: "Late response" },
      }),
    ).resolves.toBeNull()
    await expect(
      claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: successfulJob.id }),
    ).resolves.toMatchObject({
      status: "complete",
      attemptCount: 2,
      result: { client_name: "Acme" },
    })

    await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: failedJob.id })
    await expect(
      failScrapeJob({
        scrapeRunId: run.id,
        scrapeJobId: failedJob.id,
        failure: {
          code: "missing_required_fields",
          message: "raw provider payload\n    at internal stack",
        },
        missingRequiredFieldKeys: ["client_name"],
      }),
    ).resolves.toMatchObject({
      status: "failed",
      result: null,
      failureCode: "missing_required_fields",
      failureMessage: "Required fields were missing.",
      missingRequiredFieldKeys: ["client_name"],
    })

    await expect(
      getScrapeJobAggregates({ scrapeRunId: run.id }),
    ).resolves.toEqual({
      total: 3,
      pending: 1,
      inProgress: 0,
      complete: 1,
      failed: 1,
      cancelled: 0,
    })
    const persisted = await db.select().from(scrapeJobs)
    expect(
      persisted.find((job) => job.id === successfulJob.id)?.result,
    ).toEqual({
      client_name: "Acme",
    })
  })

  it("derives mixed job finalization from persisted state", async () => {
    const { user, run, jobs } = await createScrapingRun()

    await expect(finalizeScraping({ scrapeRunId: run.id })).resolves.toBe(
      "in_progress",
    )
    for (const [index, job] of jobs.entries()) {
      await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: job.id })
      if (index === 0) {
        await completeScrapeJob({
          scrapeRunId: run.id,
          scrapeJobId: job.id,
          result: { client_name: "Acme" },
        })
      } else {
        await failScrapeJob({
          scrapeRunId: run.id,
          scrapeJobId: job.id,
          failure: { code: "scrape_failed", message: "Extraction failed." },
        })
      }
    }

    await expect(finalizeScraping({ scrapeRunId: run.id })).resolves.toBe(
      "complete",
    )
    await expect(finalizeScraping({ scrapeRunId: run.id })).resolves.toBe(
      "complete",
    )
    await expect(
      claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: jobs[0].id }),
    ).resolves.toMatchObject({
      status: "complete",
      result: { client_name: "Acme" },
    })
    await expect(
      requestScrapeRunCancellation({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toEqual({ outcome: "terminal_conflict", status: "complete" })
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "complete",
      failureCode: null,
      finishedAt: expect.any(Date),
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "complete" },
        { stage: "scraping", status: "complete", failureCode: null },
      ],
    })
  })

  it("fails Scraping and the run when every persisted job failed", async () => {
    const { user, run, jobs } = await createScrapingRun()

    for (const job of jobs) {
      await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: job.id })
      await failScrapeJob({
        scrapeRunId: run.id,
        scrapeJobId: job.id,
        failure: { code: "scrape_failed", message: "Extraction failed." },
      })
    }

    await expect(finalizeScraping({ scrapeRunId: run.id })).resolves.toBe(
      "failed",
    )
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "scrape_failed",
      failureMessage: "Every scrape job failed.",
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "complete" },
        {
          stage: "scraping",
          status: "failed",
          failureCode: "scrape_failed",
          failureMessage: "Every scrape job failed.",
        },
      ],
    })
  })

  it("records and completes cancellation while preserving terminal job outcomes", async () => {
    const { user, run, jobs } = await createScrapingRun()
    const [completeJob, failedJob, unfinishedJob] = jobs

    await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: completeJob.id })
    await completeScrapeJob({
      scrapeRunId: run.id,
      scrapeJobId: completeJob.id,
      result: { client_name: "Acme" },
    })
    await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: failedJob.id })
    await failScrapeJob({
      scrapeRunId: run.id,
      scrapeJobId: failedJob.id,
      failure: { code: "scrape_failed", message: "Extraction failed." },
    })
    await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: unfinishedJob.id })

    await expect(
      requestScrapeRunCancellation({
        userId: user.id + 10_000,
        scrapeRunId: run.id,
      }),
    ).resolves.toEqual({ outcome: "not_found" })
    const requested = await requestScrapeRunCancellation({
      userId: user.id,
      scrapeRunId: run.id,
    })
    expect(requested).toMatchObject({
      outcome: "requested",
      workflowRunId: `workflow-${run.id}`,
      cancellationRequestedAt: expect.any(Date),
    })
    await expect(
      requestScrapeRunCancellation({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({ outcome: "already_requested" })
    await expect(
      completeScrapeJob({
        scrapeRunId: run.id,
        scrapeJobId: unfinishedJob.id,
        result: { client_name: "Too late" },
      }),
    ).resolves.toBeNull()

    await expect(
      completeScrapeRunCancellation({ scrapeRunId: run.id }),
    ).resolves.toBe(true)
    await expect(
      completeScrapeRunCancellation({ scrapeRunId: run.id }),
    ).resolves.toBe(true)
    await expect(
      requestScrapeRunCancellation({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toEqual({ outcome: "cancelled" })

    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "cancelled",
      cancellationRequestedAt: expect.any(Date),
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "complete" },
        { stage: "scraping", status: "cancelled" },
      ],
    })
    const persistedJobs = await db.select().from(scrapeJobs)
    expect(persistedJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completeJob.id,
          status: "complete",
          result: { client_name: "Acme" },
        }),
        expect.objectContaining({ id: failedJob.id, status: "failed" }),
        expect.objectContaining({
          id: unfinishedJob.id,
          status: "cancelled",
          result: null,
        }),
      ]),
    )
  })

  it("serializes finalization against cancellation so the first transition wins", async () => {
    const { user, run, jobs } = await createScrapingRun()

    for (const job of jobs) {
      await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: job.id })
      await completeScrapeJob({
        scrapeRunId: run.id,
        scrapeJobId: job.id,
        result: { client_name: `Client ${job.id}` },
      })
    }

    const [cancellation, finalization] = await Promise.all([
      requestScrapeRunCancellation({ userId: user.id, scrapeRunId: run.id }),
      finalizeScraping({ scrapeRunId: run.id }),
    ])
    const found = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: run.id,
    })

    if (cancellation.outcome === "terminal_conflict") {
      expect(finalization).toBe("complete")
      expect(found?.status).toBe("complete")
    } else {
      expect(cancellation.outcome).toBe("requested")
      expect(finalization).toBe("cancelled")
      expect(found?.status).toBe("cancelled")
    }
  })

  it("cleans up an unexpected Scraping failure without losing successful results", async () => {
    const { user, run, jobs } = await createScrapingRun()
    const [completeJob, activeJob, pendingJob] = jobs

    await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: completeJob.id })
    await completeScrapeJob({
      scrapeRunId: run.id,
      scrapeJobId: completeJob.id,
      result: { client_name: "Acme" },
    })
    await claimScrapeJob({ scrapeRunId: run.id, scrapeJobId: activeJob.id })

    await expect(
      handleUnexpectedWorkflowFailure({
        scrapeRunId: run.id,
        failure: {
          code: "unexpected_workflow_failure",
          message: "The workflow stopped unexpectedly.",
        },
      }),
    ).resolves.toBe("failed")
    await expect(
      handleUnexpectedWorkflowFailure({
        scrapeRunId: run.id,
        failure: {
          code: "unexpected_workflow_failure",
          message: "A replay must not overwrite terminal state.",
        },
      }),
    ).resolves.toBe("failed")

    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "unexpected_workflow_failure",
      failureMessage: "The workflow stopped unexpectedly.",
      stages: [
        { stage: "mapping", status: "complete" },
        { stage: "filtering", status: "complete" },
        {
          stage: "scraping",
          status: "failed",
          failureCode: "unexpected_workflow_failure",
        },
      ],
    })
    const persistedJobs = await db.select().from(scrapeJobs)
    expect(persistedJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: completeJob.id,
          status: "complete",
          result: { client_name: "Acme" },
        }),
        expect.objectContaining({
          id: activeJob.id,
          status: "failed",
          failureCode: "unexpected_workflow_failure",
          result: null,
        }),
        expect.objectContaining({
          id: pendingJob.id,
          status: "failed",
          failureCode: "unexpected_workflow_failure",
          result: null,
        }),
      ]),
    )
  })

  it("lets requested cancellation dominate unexpected failure cleanup", async () => {
    const { user, run } = await createClaimedRun()
    await requestScrapeRunCancellation({
      userId: user.id,
      scrapeRunId: run.id,
    })

    await expect(
      handleUnexpectedWorkflowFailure({
        scrapeRunId: run.id,
        failure: {
          code: "unexpected_workflow_failure",
          message: "Unexpected failure",
        },
      }),
    ).resolves.toBe("cancelled")
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "cancelled",
      failureCode: null,
      stages: [
        { stage: "mapping", status: "cancelled" },
        { stage: "filtering", status: "cancelled" },
        { stage: "scraping", status: "cancelled" },
      ],
    })
  })

  it("marks a pending run in progress while cancellation cleanup is pending", async () => {
    const user = await createUser()
    const run = await createScrapeRun({
      userId: user.id,
      configuration: runConfiguration(),
    })

    await expect(
      requestScrapeRunCancellation({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({ outcome: "requested" })
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "in_progress",
      startedAt: null,
      cancellationRequestedAt: expect.any(Date),
      stages: [
        { stage: "mapping", status: "pending" },
        { stage: "filtering", status: "pending" },
        { stage: "scraping", status: "pending" },
      ],
    })
  })

  it("fails Filtering and skips Scraping without rewriting completed Mapping", async () => {
    const { user, run } = await createClaimedRun()
    await completeMappingAndStartFiltering({ scrapeRunId: run.id })

    await expect(
      failPreparationStage({
        scrapeRunId: run.id,
        stage: "filtering",
        failure: {
          code: "filtering_failed",
          message: "Filtering could not be completed.",
        },
      }),
    ).resolves.toBe(true)
    await expect(
      findOwnedScrapeRun({ userId: user.id, scrapeRunId: run.id }),
    ).resolves.toMatchObject({
      status: "failed",
      failureCode: "filtering_failed",
      stages: [
        { stage: "mapping", status: "complete" },
        {
          stage: "filtering",
          status: "failed",
          failureCode: "filtering_failed",
        },
        { stage: "scraping", status: "skipped" },
      ],
    })
  })

  it("fails an active preparation stage, skips later stages, and protects terminal state", async () => {
    const { user, run } = await createClaimedRun()

    await expect(
      recordStageAttempt({ scrapeRunId: run.id, stage: "filtering" }),
    ).resolves.toBeNull()
    await expect(
      failPreparationStage({
        scrapeRunId: run.id,
        stage: "mapping",
        failure: {
          code: "mapping_failed",
          message: "Mapping could not be completed.",
        },
      }),
    ).resolves.toBe(true)
    await expect(
      failPreparationStage({
        scrapeRunId: run.id,
        stage: "mapping",
        failure: {
          code: "unexpected_workflow_failure",
          message: "A late failure must not replace the original.",
        },
      }),
    ).resolves.toBe(false)
    await expect(
      completeMappingAndStartFiltering({ scrapeRunId: run.id }),
    ).resolves.toBe(false)

    const found = await findOwnedScrapeRun({
      userId: user.id,
      scrapeRunId: run.id,
    })
    expect(found).toMatchObject({
      status: "failed",
      failureCode: "mapping_failed",
      failureMessage: "Mapping could not be completed.",
      finishedAt: expect.any(Date),
    })
    expect(
      found?.stages.map(
        ({ stage, status, failureCode, failureMessage, finishedAt }) => ({
          stage,
          status,
          failureCode,
          failureMessage,
          finished: finishedAt instanceof Date,
        }),
      ),
    ).toEqual([
      {
        stage: "mapping",
        status: "failed",
        failureCode: "mapping_failed",
        failureMessage: "Mapping could not be completed.",
        finished: true,
      },
      {
        stage: "filtering",
        status: "skipped",
        failureCode: null,
        failureMessage: null,
        finished: true,
      },
      {
        stage: "scraping",
        status: "skipped",
        failureCode: null,
        failureMessage: null,
        finished: true,
      },
    ])
  })
})
