"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { authClient } from "@/auth/auth-client"
import { POST_SIGN_IN_URL } from "@/auth/routes"

type SocialProvider = Parameters<typeof authClient.signIn.social>[0]["provider"]

type SocialSignInButtonProps = {
  children: ReactNode
  className?: string
  provider: SocialProvider
}

export function SocialSignInButton({
  children,
  className,
  provider,
}: SocialSignInButtonProps) {
  const [isPending, setIsPending] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSignIn() {
    setIsPending(true)
    setErrorMessage(null)

    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: POST_SIGN_IN_URL,
    })

    if (error) {
      setErrorMessage(error.message ?? "Unable to start social sign-in.")
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        className={className}
        onClick={handleSignIn}
        disabled={isPending}
      >
        {isPending ? "Redirecting..." : children}
      </Button>
      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
