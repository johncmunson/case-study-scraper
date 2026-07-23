import { getCurrentSession } from "@/auth/session"
import {
  numericSessionUserId,
  positiveIntegerRouteId,
  scrapeRunNotFoundResponse,
  unauthorizedResponse,
} from "@/app/api/scrape-runs/_route-helpers"
import { findOwnedScrapeRunDetail } from "@/lib/server/scrape-runs/read-repository"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
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
