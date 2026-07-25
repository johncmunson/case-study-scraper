import Link from "next/link"

import { SignOutButton } from "@/components/auth/sign-out-button"
import { ModeToggle } from "@/components/mode-toggle"

export function AppHeader() {
  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b">
      <h1 className="text-lg font-semibold tracking-tight">
        <Link
          href="/app/scrape-runs"
          className="rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Case Study Scraper
        </Link>
      </h1>
      <div className="flex shrink-0 items-center gap-2">
        <ModeToggle />
        <SignOutButton />
      </div>
    </header>
  )
}
