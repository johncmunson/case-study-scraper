import { getCurrentSession } from "@/auth/session"
import {
  numericSessionUserId,
  unauthorizedResponse,
} from "@/app/api/scrape-runs/_route-helpers"
import { newScrapeRunSchema } from "@/lib/scrape-runs/new-scrape-run"
import {
  DeploymentConfigurationError,
  validateDatabaseDeploymentConfiguration,
  validateScrapeRunDeploymentConfiguration,
} from "@/lib/server/scrape-runs/deployment-configuration"
import { listOwnedScrapeRunSummaries } from "@/lib/server/scrape-runs/read-repository"
import { scrapeRunWorkflow } from "@/workflows/scrape-runs"
import { start } from "workflow/api"

const EMPTY_JOB_COUNTS = {
  total: 0,
  pending: 0,
  inProgress: 0,
  complete: 0,
  failed: 0,
  cancelled: 0,
} as const

export async function GET(_request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return unauthorizedResponse()
  }

  const runs = await listOwnedScrapeRunSummaries({
    userId: numericSessionUserId(session.user.id),
  })

  return Response.json(runs)
}

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return unauthorizedResponse()
  }

  let filteringModel: string

  try {
    validateDatabaseDeploymentConfiguration()
    filteringModel = validateScrapeRunDeploymentConfiguration({
      FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
      URL_FILTER_MODEL: process.env.URL_FILTER_MODEL,
    }).filteringModel
  } catch (error) {
    if (error instanceof DeploymentConfigurationError) {
      return Response.json({ error: error.message }, { status: error.status })
    }

    throw error
  }

  let payload: unknown

  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 })
  }

  const result = newScrapeRunSchema.safeParse(payload)

  if (!result.success) {
    return Response.json(
      {
        error: result.error.issues[0]?.message ?? "Invalid scrape run.",
        issues: result.error.issues,
      },
      { status: 400 },
    )
  }

  const [scrapeRunRepository, scrapeRunLifecycle] = await Promise.all([
    import("@/lib/server/scrape-runs/repository"),
    import("@/lib/server/scrape-runs/lifecycle-repository"),
  ])
  let createdRun

  try {
    createdRun = await scrapeRunRepository.createScrapeRun({
      userId: numericSessionUserId(session.user.id),
      configuration: {
        ...result.data,
        filteringModel,
      },
    })
  } catch (error) {
    if (error instanceof scrapeRunRepository.ActiveScrapeRunConflictError) {
      return Response.json(
        { error: "You already have an active scrape run." },
        { status: 409 },
      )
    }

    throw error
  }

  let workflowRunId: string

  try {
    const workflowRun = await start(scrapeRunWorkflow, [createdRun.id])
    workflowRunId = workflowRun.runId
  } catch {
    const message = "The scrape run could not be started."

    await scrapeRunLifecycle.failPendingWorkflowDispatch({
      scrapeRunId: createdRun.id,
      failure: {
        code: "workflow_dispatch_failed",
        message,
      },
    })

    return Response.json(
      { error: message, scrapeRunId: createdRun.id },
      { status: 503 },
    )
  }

  let workflowRunIdAttached = false

  try {
    workflowRunIdAttached = await scrapeRunRepository.attachWorkflowRunId({
      scrapeRunId: createdRun.id,
      workflowRunId,
    })
  } catch {
    // The Workflow claim step may still self-attach after this response.
  }

  if (!workflowRunIdAttached) {
    return Response.json(
      {
        error: "The Workflow run ID could not be saved.",
        scrapeRunId: createdRun.id,
      },
      { status: 503 },
    )
  }

  return Response.json(
    {
      id: createdRun.id,
      name: createdRun.name,
      targetUrl: createdRun.targetUrl,
      status: createdRun.status,
      cancellationRequestedAt: createdRun.cancellationRequestedAt,
      jobCounts: EMPTY_JOB_COUNTS,
      createdAt: createdRun.createdAt,
      startedAt: createdRun.startedAt,
      finishedAt: createdRun.finishedAt,
    },
    { status: 201 },
  )
}
