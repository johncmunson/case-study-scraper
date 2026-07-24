import {
  ArrowDown,
  ArrowRight,
  Check,
  FileJson2,
  FileSpreadsheet,
} from "lucide-react"

import { landingExtractionResults } from "@/components/landing/example-data"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

const fields = ["Client", "Industry", "Services", "Outcome"]

export function ProductPreview() {
  return (
    <figure
      aria-label="Example pages becoming a structured extraction dataset"
      className="relative mx-auto w-full max-w-7xl"
    >
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.92fr)_2.5rem_minmax(0,1.08fr)] lg:gap-3">
        <Card className="border border-border/80 bg-card shadow-sm ring-0">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[0.68rem] font-semibold tracking-[0.16em] text-primary uppercase">
                Run configuration
              </p>
              <span className="rounded-full bg-muted px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">
                Input
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Target Site
              </p>
              <p className="mt-1 break-all font-mono text-sm font-medium">
                northstar-studio.example
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Example Pages
              </p>
              <ul className="mt-2 space-y-2" aria-label="Example Pages">
                <li className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/35 px-3 py-2">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 break-all font-mono text-xs leading-5">
                    /work/luma-coffee
                  </span>
                </li>
                <li className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/35 px-3 py-2">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 break-all font-mono text-xs leading-5">
                    /work/fieldwork-health
                  </span>
                </li>
                <li className="flex min-w-0 items-start gap-2 rounded-lg border bg-muted/35 px-3 py-2">
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-primary"
                  />
                  <span className="min-w-0 break-all font-mono text-xs leading-5">
                    /work/orbit-logistics
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Extraction Fields
              </p>
              <ul className="mt-2 flex flex-wrap gap-2" aria-label="Extraction Fields">
                {fields.map((field) => (
                  <li
                    key={field}
                    className="rounded-md border border-brand-border bg-brand-surface px-2.5 py-1.5 text-xs font-medium text-brand-strong"
                  >
                    {field}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <div
          aria-hidden="true"
          className="flex items-center justify-center text-primary"
        >
          <ArrowDown className="size-5 lg:hidden" />
          <ArrowRight className="hidden size-5 lg:block" />
        </div>

        <Card className="gap-0 border border-brand-border/80 bg-card py-0 shadow-sm ring-0">
          <CardHeader className="border-b bg-brand-surface/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[0.68rem] font-semibold tracking-[0.16em] text-primary uppercase">
                  Extraction Dataset
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  2 of 3 Extraction Results shown
                </p>
              </div>
              <div className="flex gap-1.5" aria-label="Download formats">
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[0.68rem] font-medium">
                  <FileSpreadsheet aria-hidden="true" className="size-3" />
                  CSV
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[0.68rem] font-medium">
                  <FileJson2 aria-hidden="true" className="size-3" />
                  JSON
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <ol className="space-y-3" aria-label="Example structured records">
              {landingExtractionResults.map((result, index) => (
                <li
                  key={result.canonicalPageUrl}
                  className="overflow-hidden rounded-lg border bg-background"
                >
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/35 px-3 py-2">
                    <span className="font-mono text-[0.68rem] text-muted-foreground">
                      RECORD {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-brand-surface-foreground">
                      <Check aria-hidden="true" className="size-3" />
                      Successful
                    </span>
                  </div>
                  <dl className="grid gap-x-4 gap-y-2 px-3 py-3 sm:grid-cols-2">
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] text-muted-foreground">
                        Client
                      </dt>
                      <dd className="mt-0.5 break-words text-xs font-medium">
                        {result.client}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] text-muted-foreground">
                        Industry
                      </dt>
                      <dd className="mt-0.5 break-words text-xs font-medium">
                        {result.industry}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] text-muted-foreground">
                        Services
                      </dt>
                      <dd className="mt-0.5 break-words text-xs font-medium">
                        {result.services}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] text-muted-foreground">
                        Outcome
                      </dt>
                      <dd className="mt-0.5 break-words text-xs font-medium">
                        {result.outcome}
                      </dd>
                    </div>
                  </dl>
                  <p className="break-all border-t px-3 py-2 font-mono text-[0.68rem] leading-5 text-muted-foreground">
                    Canonical Page URL: {result.canonicalPageUrl}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      <figcaption className="sr-only">
        A fictional Northstar Studio run configuration with a Target Site,
        three Example Pages, and four Extraction Fields becomes source-linked
        Extraction Results, with two example results shown, available as CSV or
        JSON.
      </figcaption>
    </figure>
  )
}
