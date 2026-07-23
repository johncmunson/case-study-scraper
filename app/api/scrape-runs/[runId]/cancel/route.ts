import { getCurrentSession } from "@/auth/session"
import {
  completeScrapeRunCancellation,
  requestScrapeRunCancellation,
} from "@/lib/server/scrape-runs/lifecycle-repository"
import { getRun } from "workflow/api"

function numericUserId(id: string | number) {
  const userId = Number(id)

  if (!Number.isSafeInteger(userId)) {
    throw new Error("Expected the authenticated user id to be a numeric value.")
  }

  return userId
}

function scrapeRunIdFromRoute(value: string) {
  const scrapeRunId = Number(value)

  return Number.isSafeInteger(scrapeRunId) && scrapeRunId > 0
    ? scrapeRunId
    : null
}

function notFoundResponse() {
  return Response.json({ error: "Scrape run not found." }, { status: 404 })
}

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
    return Response.json({ error: "Unauthorized." }, { status: 401 })
  }

  const { runId } = await params
  const scrapeRunId = scrapeRunIdFromRoute(runId)

  if (scrapeRunId === null) {
    return notFoundResponse()
  }

  const cancellation = await requestScrapeRunCancellation({
    userId: numericUserId(session.user.id),
    scrapeRunId,
  })

  if (cancellation.outcome === "not_found") {
    return notFoundResponse()
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
    return notFoundResponse()
  }

  return cancelledResponse(scrapeRunId)
}
