export function positiveIntegerRouteId(value: string) {
  const id = Number(value)

  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function numericSessionUserId(id: string | number) {
  const userId = Number(id)

  if (!Number.isSafeInteger(userId)) {
    throw new Error("Expected the authenticated user id to be a numeric value.")
  }

  return userId
}

export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized." }, { status: 401 })
}

export function scrapeRunNotFoundResponse() {
  return Response.json({ error: "Scrape run not found." }, { status: 404 })
}
