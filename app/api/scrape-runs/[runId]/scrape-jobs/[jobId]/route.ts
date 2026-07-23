import { getCurrentSession } from "@/auth/session"
import {
  numericSessionUserId,
  positiveIntegerRouteId,
  unauthorizedResponse,
} from "@/app/api/scrape-runs/_route-helpers"
import { findOwnedScrapeJobDetail } from "@/lib/server/scrape-runs/read-repository"

function notFoundResponse() {
  return Response.json({ error: "Scrape job not found." }, { status: 404 })
}

export async function GET(
  _request: Request,
  {
    params,
  }: { params: Promise<{ runId: string; jobId: string }> },
) {
  const session = await getCurrentSession()

  if (!session) {
    return unauthorizedResponse()
  }

  const { runId, jobId } = await params
  const scrapeRunId = positiveIntegerRouteId(runId)
  const scrapeJobId = positiveIntegerRouteId(jobId)

  if (scrapeRunId === null || scrapeJobId === null) {
    return notFoundResponse()
  }

  const job = await findOwnedScrapeJobDetail({
    userId: numericSessionUserId(session.user.id),
    scrapeRunId,
    scrapeJobId,
  })

  return job ? Response.json(job) : notFoundResponse()
}
