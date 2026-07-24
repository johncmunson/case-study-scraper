import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileJson2,
  FileSpreadsheet,
} from "lucide-react"

import { POST_SIGN_IN_URL } from "@/auth/routes"
import { getCurrentSession } from "@/auth/session"
import { landingExtractionResults } from "@/components/landing/example-data"
import { ProductPreview } from "@/components/landing/product-preview"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Case Study Scraper — Turn Case Studies into Structured Data",
  description:
    "Find matching case studies, customer stories, and project pages, extract the fields you need, and download a sourced CSV or JSON dataset.",
}

const workflows = [
  {
    number: "01",
    title: "Show what matches",
    description:
      "Provide the Target Site and a few Example Pages that demonstrate the relevant URL structure.",
  },
  {
    number: "02",
    title: "Choose what to collect",
    description:
      "Define the Extraction Fields you want from each Matching Page, such as client, industry, services, and outcome.",
  },
  {
    number: "03",
    title: "Review and download",
    description:
      "Inspect successful or failed Scrape Jobs, then download the successful Extraction Results as CSV or JSON.",
  },
]

const useCases = [
  {
    title: "Customer stories",
    fields: "client, industry, services, outcomes",
  },
  {
    title: "Project portfolios",
    fields: "client, location, project type, scope",
  },
  {
    title: "Team profiles",
    fields: "name, role, specialties",
  },
  {
    title: "Location pages",
    fields: "address, region, contact details",
  },
]

const focusLink =
  "rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"

function getOptionalLegalUrl(value: string | undefined, label: string) {
  if (!value) {
    return null
  }

  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must use an HTTP or HTTPS URL.`)
  }

  return url.toString()
}

const privacyPolicyUrl = getOptionalLegalUrl(
  process.env.PRIVACY_POLICY_URL,
  "PRIVACY_POLICY_URL",
)
const termsOfServiceUrl = getOptionalLegalUrl(
  process.env.TERMS_OF_SERVICE_URL,
  "TERMS_OF_SERVICE_URL",
)

function AccountActions({ isSignedIn }: { isSignedIn: boolean }) {
  if (isSignedIn) {
    return (
      <Link
        href={POST_SIGN_IN_URL}
        className={cn(
          buttonVariants({ size: "lg" }),
          "h-10 bg-primary px-4 text-primary-foreground hover:bg-brand-hover focus-visible:ring-ring/40 motion-reduce:transform-none motion-reduce:transition-none",
        )}
      >
        Open app
        <ArrowRight aria-hidden="true" />
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Link
        href="/sign-in"
        className={cn(
          buttonVariants({ variant: "ghost", size: "lg" }),
          "h-10 px-2.5 motion-reduce:transform-none motion-reduce:transition-none sm:px-3",
        )}
      >
        Sign in
      </Link>
      <Link
        href="/sign-in"
        className={cn(
          buttonVariants({ size: "lg" }),
          "h-10 bg-primary px-3 text-primary-foreground hover:bg-brand-hover focus-visible:ring-ring/40 motion-reduce:transform-none motion-reduce:transition-none sm:px-4",
        )}
      >
        Get started
      </Link>
    </div>
  )
}

function PrimaryCta({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <Link
      href={isSignedIn ? POST_SIGN_IN_URL : "/sign-in"}
      className={cn(
        buttonVariants({ size: "lg" }),
        "h-11 bg-primary px-5 text-primary-foreground shadow-sm hover:bg-brand-hover focus-visible:ring-ring/40 motion-reduce:transform-none motion-reduce:transition-none",
      )}
    >
      {isSignedIn ? "Open app" : "Get started"}
      <ArrowRight aria-hidden="true" />
    </Link>
  )
}

export default async function LandingPage() {
  const session = await getCurrentSession()
  const isSignedIn = Boolean(session)

  return (
    <div className="min-h-full overflow-x-clip bg-background text-foreground">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className={cn(
              focusLink,
              "shrink-0 text-sm font-semibold tracking-tight sm:text-base",
            )}
          >
            Case Study Scraper
          </Link>
          <nav
            aria-label="Landing page sections"
            className="ml-auto hidden items-center gap-6 md:flex"
          >
            <Link
              href="#how-it-works"
              className={cn(
                focusLink,
                "text-sm text-muted-foreground hover:text-foreground",
              )}
            >
              How it works
            </Link>
            <Link
              href="#output"
              className={cn(
                focusLink,
                "text-sm text-muted-foreground hover:text-foreground",
              )}
            >
              Output
            </Link>
            <Link
              href="#use-cases"
              className={cn(
                focusLink,
                "text-sm text-muted-foreground hover:text-foreground",
              )}
            >
              Use cases
            </Link>
          </nav>
          <div className="ml-auto md:ml-2">
            <AccountActions isSignedIn={isSignedIn} />
          </div>
        </div>
      </header>

      <main className="relative isolate">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        />
        <section className="relative border-b px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:px-8 lg:pt-28 lg:pb-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Research-ready extraction
            </p>
            <h1 className="mt-5 text-balance text-4xl leading-[1.05] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Turn case studies into structured datasets.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Provide a few example pages and the fields you need. Case Study
              Scraper finds pages with matching URL patterns and extracts the
              information into CSV or JSON. It is designed for case studies,
              customer stories, and recent-project pages.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <PrimaryCta isSignedIn={isSignedIn} />
              <Link
                href="#how-it-works"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 px-5 motion-reduce:transform-none motion-reduce:transition-none",
                )}
              >
                See how it works
              </Link>
            </div>
          </div>
          <div className="mx-auto mt-14 max-w-7xl sm:mt-16 lg:mt-20">
            <ProductPreview />
          </div>
        </section>

        <section
          id="how-it-works"
          aria-labelledby="how-it-works-title"
          tabIndex={-1}
          className="scroll-mt-8 border-b px-4 py-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6 sm:py-24 lg:px-8 lg:py-28"
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                  How it works
                </p>
                <h2
                  id="how-it-works-title"
                  className="mt-4 max-w-md text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl"
                >
                  From a few examples to a reviewable dataset.
                </h2>
                <p className="mt-5 max-w-md leading-7 text-muted-foreground">
                  Configure the page pattern and fields once. AI-assisted
                  matching and extraction help turn repeated project pages into
                  consistent Extraction Results.
                </p>
              </div>
              <ol className="divide-y border-y">
                {workflows.map((workflow) => (
                  <li
                    key={workflow.number}
                    className="grid gap-3 py-7 sm:grid-cols-[3rem_1fr] sm:gap-5"
                  >
                    <span className="font-mono text-xs font-semibold text-primary">
                      {workflow.number}
                    </span>
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight">
                        {workflow.title}
                      </h3>
                      <p className="mt-2 max-w-2xl leading-7 text-muted-foreground">
                        {workflow.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="output"
          aria-labelledby="output-title"
          tabIndex={-1}
          className="scroll-mt-8 border-b bg-muted/25 px-4 py-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6 sm:py-24 lg:px-8 lg:py-28"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                Output
              </p>
              <h2
                id="output-title"
                className="mt-4 text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl"
              >
                A sourced Extraction Dataset, ready for analysis.
              </h2>
              <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
                Each successful Extraction Result keeps the structured values you chose
                alongside its Canonical Page URL, so the result remains easy to
                trace and review.
              </p>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-[1.45fr_0.55fr]">
              <Card className="border bg-card shadow-sm ring-0">
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>Successful Extraction Results</CardTitle>
                      <CardDescription className="mt-1">
                        Structured values under your chosen fields
                      </CardDescription>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-surface px-2.5 py-1 text-xs font-medium text-brand-surface-foreground">
                      <CheckCircle2 aria-hidden="true" className="size-3.5" />
                      Source linked
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="hidden overflow-hidden rounded-lg border md:block">
                    <table className="w-full table-fixed border-collapse text-left text-xs">
                      <caption className="sr-only">
                        Example successful extraction results with chosen fields
                        and Canonical Page URLs
                      </caption>
                      <thead className="bg-muted/60 text-muted-foreground">
                        <tr>
                          <th scope="col" className="w-[16%] px-3 py-2.5 font-medium">
                            Client
                          </th>
                          <th scope="col" className="w-[14%] px-3 py-2.5 font-medium">
                            Industry
                          </th>
                          <th scope="col" className="w-[22%] px-3 py-2.5 font-medium">
                            Services
                          </th>
                          <th scope="col" className="w-[20%] px-3 py-2.5 font-medium">
                            Outcome
                          </th>
                          <th scope="col" className="w-[28%] px-3 py-2.5 font-medium">
                            Canonical Page URL
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {landingExtractionResults.map((result) => (
                          <tr key={result.canonicalPageUrl}>
                            <td className="break-words px-3 py-3 font-medium">
                              {result.client}
                            </td>
                            <td className="break-words px-3 py-3">
                              {result.industry}
                            </td>
                            <td className="break-words px-3 py-3">
                              {result.services}
                            </td>
                            <td className="break-words px-3 py-3">
                              {result.outcome}
                            </td>
                            <td className="break-all px-3 py-3 font-mono text-[0.68rem] text-muted-foreground">
                              {result.canonicalPageUrl}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ul
                    className="space-y-3 md:hidden"
                    aria-label="Example successful Extraction Results"
                  >
                    {landingExtractionResults.map((result) => (
                      <li
                        key={result.canonicalPageUrl}
                        className="rounded-lg border p-3"
                      >
                        <p className="font-medium">{result.client}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {result.industry} · {result.services} · {result.outcome}
                        </p>
                        <p className="mt-3 break-all border-t pt-2 font-mono text-[0.68rem] leading-5 text-muted-foreground">
                          {result.canonicalPageUrl}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
                <Card className="border bg-card ring-0">
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-brand-surface text-brand-surface-foreground">
                        <FileSpreadsheet aria-hidden="true" className="size-4" />
                      </span>
                      <p className="font-semibold">CSV</p>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Columns use your user-facing Field Labels for familiar
                      spreadsheet analysis.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border bg-card ring-0">
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-lg bg-brand-surface text-brand-surface-foreground">
                        <FileJson2 aria-hidden="true" className="size-4" />
                      </span>
                      <p className="font-semibold">JSON</p>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Properties use stable Field Keys for reliable downstream
                      workflows.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="mt-5 grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
              <div>
                <h3 className="font-semibold">Review outcomes before download</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Inspect successful and failed Scrape Job outcomes first.
                  Downloads become available after the run is terminal and
                  contain successful Extraction Results.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs" aria-label="Example Scrape Job outcomes">
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-medium">
                  <CheckCircle2 aria-hidden="true" className="size-3.5 text-primary" />
                  Successful
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-medium">
                  <CircleAlert aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  Failed
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          id="use-cases"
          aria-labelledby="use-cases-title"
          tabIndex={-1}
          className="scroll-mt-8 border-b px-4 py-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6 sm:py-24 lg:px-8 lg:py-28"
        >
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
              <div>
                <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary uppercase">
                  Use cases
                </p>
                <h2
                  id="use-cases-title"
                  className="mt-4 max-w-lg text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl"
                >
                  Built for case studies. Flexible enough for other repeated
                  page types.
                </h2>
                <p className="mt-5 max-w-md leading-7 text-muted-foreground">
                  Apply the same example-led workflow when a site publishes
                  structured information across a consistent family of pages.
                </p>
              </div>
              <div className="grid border-t sm:grid-cols-2">
                {useCases.map((useCase, index) => (
                  <article
                    key={useCase.title}
                    className={cn(
                      "border-b py-6 sm:p-6",
                      index % 2 === 0 && "sm:border-r",
                    )}
                  >
                    <p className="font-mono text-[0.68rem] font-semibold text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="mt-4 text-lg font-semibold tracking-tight">
                      {useCase.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {useCase.fields}.
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-brand-border bg-brand-surface/60 px-6 py-12 text-center shadow-sm sm:px-10 sm:py-16">
            <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary uppercase">
              Build the dataset you need
            </p>
            <h2 className="mx-auto mt-4 max-w-2xl text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
              Turn repeated project pages into structured, source-linked data.
            </h2>
            <p className="mx-auto mt-5 max-w-xl leading-7 text-muted-foreground">
              Start with a few examples, choose your fields, and review the
              results before downloading CSV or JSON.
            </p>
            <div className="mt-8">
              <PrimaryCta isSignedIn={isSignedIn} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-7 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <p className="text-sm font-semibold tracking-tight">
            Case Study Scraper
          </p>
          {(privacyPolicyUrl || termsOfServiceUrl) && (
            <nav aria-label="Legal" className="flex items-center gap-5">
              {privacyPolicyUrl && (
                <Link
                  href={privacyPolicyUrl}
                  className={cn(
                    focusLink,
                    "text-sm text-muted-foreground hover:text-foreground",
                  )}
                >
                  Privacy
                </Link>
              )}
              {termsOfServiceUrl && (
                <Link
                  href={termsOfServiceUrl}
                  className={cn(
                    focusLink,
                    "text-sm text-muted-foreground hover:text-foreground",
                  )}
                >
                  Terms
                </Link>
              )}
            </nav>
          )}
        </div>
      </footer>
    </div>
  )
}
