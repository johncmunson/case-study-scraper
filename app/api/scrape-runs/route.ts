import { getCurrentSession } from "@/auth/session"
import { newScrapeRunSchema } from "@/lib/scrape-runs/new-scrape-run"

export async function POST(request: Request) {
  const session = await getCurrentSession()

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 })
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

  console.log("New scrape run payload:", result.data)

  return Response.json({ success: true }, { status: 201 })
}
