import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { ScrapeRunDetail } from "@/lib/scrape-runs/api-contracts"
import { cn } from "@/lib/utils"

function ExternalUrlLink({ url }: { url: string }) {
  return (
    <a
      className="inline-flex max-w-full items-center gap-1 wrap-anywhere text-foreground underline underline-offset-4 hover:text-primary hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>{url}</span>
      <ExternalLinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

export function ScrapeRunConfiguration({ run }: { run: ScrapeRunDetail }) {
  return (
    <section aria-labelledby="run-configuration-heading">
      <Collapsible>
        <h3 id="run-configuration-heading">
          <CollapsibleTrigger
            className={cn(
              buttonVariants({ variant: "outline" }),
              "group w-full cursor-pointer justify-between px-4",
            )}
          >
            <span className="font-semibold">Run Configuration</span>
            <ChevronDownIcon
              aria-hidden="true"
              className="transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent className="pt-3">
          <Card>
            <CardContent className="space-y-6">
              <section className="space-y-2" aria-labelledby="target-site-heading">
                <h4 id="target-site-heading" className="font-medium">
                  Target Site
                </h4>
                <ExternalUrlLink url={run.targetUrl} />
              </section>

              <section className="space-y-2" aria-labelledby="example-pages-heading">
                <h4 id="example-pages-heading" className="font-medium">
                  Example Pages
                </h4>
                <ol className="list-decimal space-y-2 pl-5">
                  {run.exampleUrls.map((url) => (
                    <li key={url} className="pl-1">
                      <ExternalUrlLink url={url} />
                    </li>
                  ))}
                </ol>
              </section>

              <section
                className="space-y-2"
                aria-labelledby="extraction-fields-heading"
              >
                <h4 id="extraction-fields-heading" className="font-medium">
                  Extraction Fields
                </h4>
                <ol className="space-y-3">
                  {run.fields.map((field) => (
                    <li key={field.position} className="rounded-lg border p-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h5 className="wrap-break-word font-medium">
                          {field.label}
                        </h5>
                        <Badge variant={field.required ? "secondary" : "outline"}>
                          {field.required ? "Required" : "Optional"}
                        </Badge>
                        {field.primaryIdentifier && (
                          <Badge variant="outline">Primary Identifier</Badge>
                        )}
                      </div>
                      <p className="mt-1 wrap-break-word text-sm text-muted-foreground">
                        {field.description}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </section>
  )
}
