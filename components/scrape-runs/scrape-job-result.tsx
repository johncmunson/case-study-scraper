import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"

export function ScrapeJobResult({ job }: { job: ScrapeJobDetail }) {
  if (job.status !== "complete" || job.result === null) return null

  const result = job.result

  return (
    <section aria-labelledby="extraction-result-heading">
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 id="extraction-result-heading">Extraction Result</h3>
          </CardTitle>
          <CardDescription>
            The values extracted from this Canonical Page URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            {job.fields.map((field) => {
              const value = result[field.key]

              return (
                <div
                  key={field.key}
                  className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5"
                >
                  <dt className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="wrap-break-word font-medium">
                        {field.label}
                      </span>
                      <Badge variant={field.required ? "secondary" : "outline"}>
                        {field.required ? "Required" : "Optional"}
                      </Badge>
                      {field.primaryIdentifier && (
                        <Badge variant="outline">Primary Identifier</Badge>
                      )}
                    </span>
                    <span className="mt-1 block wrap-break-word text-sm text-muted-foreground">
                      {field.description}
                    </span>
                  </dt>
                  <dd className="min-w-0 wrap-anywhere whitespace-pre-wrap select-text sm:pt-0.5">
                    {value === null ? (
                      <span className="text-muted-foreground">Not found</span>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              )
            })}
          </dl>
        </CardContent>
      </Card>
    </section>
  )
}
