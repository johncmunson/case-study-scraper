import { getCurrentSession } from "@/auth/session"
import {
  numericSessionUserId,
  positiveIntegerRouteId,
  scrapeRunNotFoundResponse,
  unauthorizedResponse,
} from "@/app/api/scrape-runs/_route-helpers"
import {
  completeScrapeRunCancellation,
  requestScrapeRunCancellation,
} from "@/lib/server/scrape-runs/lifecycle-repository"
import { getRun } from "workflow/api"

function cancelledResponse(scrapeRunId: number) {
  return Response.json(
    { id: scrapeRunId, status: "cancelled" },
    { status: 202 },
  )
}

export async function POST(
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

  const cancellation = await requestScrapeRunCancellation({
    userId: numericSessionUserId(session.user.id),
    scrapeRunId,
  })

  if (cancellation.outcome === "not_found") {
    return scrapeRunNotFoundResponse()
  }

  if (cancellation.outcome === "terminal_conflict") {
    return Response.json(
      {
        error: `A ${cancellation.status} scrape run cannot be cancelled.`,
      },
      { status: 409 },
    )
  }

  if (cancellation.outcome === "cancelled") {
    return cancelledResponse(scrapeRunId)
  }

  if (cancellation.workflowRunId) {
    try {
      await getRun(cancellation.workflowRunId).cancel()
    } catch {
      return Response.json(
        { error: "The scrape run could not be cancelled." },
        { status: 503 },
      )
    }
  }

  const completed = await completeScrapeRunCancellation({ scrapeRunId })

  if (!completed) {
    return scrapeRunNotFoundResponse()
  }

  return cancelledResponse(scrapeRunId)
}
