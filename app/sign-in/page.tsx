import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Check, FileSpreadsheet } from "lucide-react"
import { redirect } from "next/navigation"

import { POST_SIGN_IN_URL } from "@/auth/routes"
import { getCurrentSession } from "@/auth/session"
import { SocialSignInButton } from "@/components/auth/social-sign-in-button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Sign in — Case Study Scraper",
  description: "Sign in to Case Study Scraper with your Google account.",
}

const capabilities = [
  "Find matching pages",
  "Extract chosen fields",
  "Download CSV or JSON",
]

const focusLink =
  "rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4">
      <path
        fill="currentColor"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z"
      />
      <path
        fill="currentColor"
        d="M12 22c2.7 0 4.98-.9 6.63-2.35l-3.24-2.55c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.77-5.61-4.14H3.04v2.62A10 10 0 0 0 12 22Z"
        opacity=".75"
      />
      <path
        fill="currentColor"
        d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.54l3.35-2.62Z"
        opacity=".55"
      />
      <path
        fill="currentColor"
        d="M12 5.94c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.94 12 5.94Z"
        opacity=".9"
      />
    </svg>
  )
}

export default async function SignInPage() {
  const session = await getCurrentSession()

  if (session) {
    redirect(POST_SIGN_IN_URL)
  }

  return (
    <div className="min-h-full overflow-x-clip bg-background text-foreground">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className={cn(
              focusLink,
              "text-sm font-semibold tracking-tight sm:text-base",
            )}
          >
            Case Study Scraper
          </Link>
          <Link
            href="/"
            className={cn(
              focusLink,
              "inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="relative isolate flex min-h-[calc(100vh-4rem)] items-center px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-25 mask-[linear-gradient(to_bottom,black,transparent_72%)]"
        />

        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end lg:gap-20">
          <section aria-labelledby="sign-in-heading" className="max-w-2xl">
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Research-ready extraction
            </p>
            <h1
              id="sign-in-heading"
              className="mt-5 text-balance text-4xl leading-[1.08] font-semibold tracking-[-0.04em] sm:text-5xl lg:text-6xl"
            >
              Sign in to Case Study Scraper.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Turn matching case studies and project pages into sourced,
              structured Extraction Results—ready for analysis.
            </p>

            <ul
              aria-label="Three-step workflow"
              className="mt-7 grid grid-cols-3 gap-2 lg:mt-9 lg:gap-3"
            >
              {capabilities.map((capability, index) => (
                <li
                  key={capability}
                  className="rounded-xl border bg-background/80 p-2.5 shadow-xs sm:p-4"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-brand-surface text-brand-surface-foreground">
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                  <p className="mt-3 text-xs leading-4 font-medium sm:mt-4 sm:text-sm sm:leading-5">
                    {capability}
                  </p>
                  <p className="mt-1 font-mono text-[0.65rem] tracking-[0.14em] text-muted-foreground uppercase">
                    Step 0{index + 1}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="workspace-sign-in-title"
            className="relative"
          >
            <Card className="gap-0 border border-brand-border/80 bg-card py-0 shadow-sm ring-0">
              <CardHeader className="border-b bg-brand-surface/50 p-6 sm:p-7">
                <span className="mb-3 grid size-10 place-items-center rounded-lg border border-brand-border bg-background text-brand-surface-foreground shadow-xs">
                  <FileSpreadsheet aria-hidden="true" className="size-4" />
                </span>
                <p className="font-mono text-[0.68rem] font-semibold tracking-[0.16em] text-primary uppercase">
                  Workspace access
                </p>
                <h2
                  id="workspace-sign-in-title"
                  className="mt-2 text-xl font-semibold tracking-tight"
                >
                  Continue to your workspace
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Use your Google account to securely sign in.
                </p>
              </CardHeader>
              <CardContent className="p-6 sm:p-7">
                <SocialSignInButton
                  provider="google"
                  className="h-11 w-full bg-primary px-4 text-primary-foreground shadow-sm hover:bg-brand-hover focus-visible:ring-ring/40 motion-reduce:transform-none motion-reduce:transition-none"
                >
                  <GoogleMark />
                  Continue with Google
                </SocialSignInButton>
                <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
                  You&apos;ll return to your Scrape Runs after signing in.
                </p>
              </CardContent>
            </Card>
            <p className="mt-4 text-center font-mono text-[0.65rem] tracking-[0.12em] text-muted-foreground uppercase lg:absolute lg:top-full lg:left-0 lg:w-full">
              Sourced records · Stable fields · Exportable data
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
