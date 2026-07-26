"use client"

import { useState } from "react"
import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

import { authClient } from "@/auth/auth-client"
import { Button } from "@/components/ui/button"

export function SignOutButton() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleSignOut() {
    setIsSigningOut(true)

    try {
      const { error } = await authClient.signOut()

      if (error) {
        return
      }

      router.replace("/")
      router.refresh()
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="cursor-pointer"
      onClick={handleSignOut}
      disabled={isSigningOut}
      aria-label={isSigningOut ? "Signing out" : "Sign out"}
      title={isSigningOut ? "Signing out" : "Sign out"}
    >
      <LogOut aria-hidden="true" />
    </Button>
  )
}
