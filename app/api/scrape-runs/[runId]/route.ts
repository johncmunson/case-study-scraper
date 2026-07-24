import { getCurrentSession } from "@/auth/session"
import {
  numericSessionUserId,
  positiveIntegerRouteId,
  scrapeRunNotFoundResponse,
  unauthorizedResponse,
} from "@/app/api/scrape-runs/_route-helpers"
import { findOwnedScrapeRunDetail } from "@/lib/server/scrape-runs/read-repository"
import { deleteOwnedTerminalScrapeRun } from "@/lib/server/scrape-runs/repository"

type ScrapeRunRouteContext = {
  params: Promise<{ runId: string }>
}

export async function DELETE(
  _request: Request,
  { params }: ScrapeRunRouteContext,
) {
  const session = await getCurrentSession()

  if (!session) {
    return unauthorizedResponse()
  }

  const { runId } = await params
  const scrapeRunId = positiveIntegerRouteId(runId)

  if (scrapeRunId === null) {
    return scrapeRunNotFoundResponse()
  }

  const result = await deleteOwnedTerminalScrapeRun({
    userId: numericSessionUserId(session.user.id),
    scrapeRunId,
  })

  if (result.outcome === "not_found") {
    return scrapeRunNotFoundResponse()
  }

  if (result.outcome === "active_conflict") {
    return Response.json(
      { error: "An active scrape run cannot be deleted." },
      { status: 409 },
    )
  }

  return new Response(null, { status: 204 })
}

export async function GET(
  _request: Request,
  { params }: ScrapeRunRouteContext,
) {
  const session = await getCurrentSession()

  if (!session) {
    return unauthorizedResponse()
  }

  const { runId } = await params
  const scrapeRunId = positiveIntegerRouteId(runId)

  if (scrapeRunId === null) {
    return scrapeRunNotFoundResponse()
  }

  const run = await findOwnedScrapeRunDetail({
    userId: numericSessionUserId(session.user.id),
    scrapeRunId,
  })

  return run ? Response.json(run) : scrapeRunNotFoundResponse()
}
