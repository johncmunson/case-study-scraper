import "server-only"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth, type AuthSession } from "./auth"

function toNumericUserId(id: string | number) {
  const userId = Number(id)

  if (!Number.isSafeInteger(userId)) {
    throw new Error("Expected the authenticated user id to be a numeric value.")
  }

  return userId
}

export async function getCurrentSession() {
  return auth.api.getSession({
    headers: await headers(),
  })
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getCurrentSession()

  if (!session) {
    redirect("/sign-in")
  }

  return session
}

export async function getCurrentUserId() {
  const session = await requireSession()

  return toNumericUserId(session.user.id)
}
