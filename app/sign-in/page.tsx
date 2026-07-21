import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SocialSignInButton } from "@/components/auth/social-sign-in-button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { POST_SIGN_IN_URL } from "@/auth/routes"
import { getCurrentSession } from "@/auth/session"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function SignInPage() {
  const session = await getCurrentSession()

  if (session) {
    redirect(POST_SIGN_IN_URL)
  }

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-lg font-semibold tracking-tight">
            Sign in
          </CardTitle>
          <CardDescription>
            Continue with your Google account to open your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SocialSignInButton provider="google">
            Continue with Google
          </SocialSignInButton>
        </CardContent>
      </Card>
    </main>
  )
}
