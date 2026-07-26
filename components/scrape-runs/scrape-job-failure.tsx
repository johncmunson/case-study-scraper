import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"

const GENERIC_FAILURE_MESSAGE =
  "Extraction could not be completed for this page."

export function ScrapeJobFailure({ job }: { job: ScrapeJobDetail }) {
  if (job.status !== "failed") return null

  const failureMessage = job.failureMessage?.trim()
    ? job.failureMessage
    : GENERIC_FAILURE_MESSAGE
  const missingRequiredFieldKeys = new Set(
    job.failureCode === "missing_required_fields"
      ? (job.missingRequiredFieldKeys ?? [])
      : [],
  )
  const missingRequiredFields = job.fields.filter(
    (field) => field.required && missingRequiredFieldKeys.has(field.key),
  )

  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>
        <h3>Scrape Job failed</h3>
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="wrap-anywhere">{failureMessage}</p>
        {job.failureCode && (
          <p className="wrap-anywhere font-mono text-xs">
            Failure code: <code>{job.failureCode}</code>
          </p>
        )}
        {missingRequiredFields.length > 0 && (
          <section
            className="space-y-1.5"
            aria-labelledby="missing-required-fields-heading"
          >
            <h4 id="missing-required-fields-heading" className="font-medium">
              Missing Required Extraction Fields
            </h4>
            <ul className="list-disc space-y-1 pl-5">
              {missingRequiredFields.map((field) => (
                <li key={field.key} className="wrap-break-word">
                  {field.label}
                </li>
              ))}
            </ul>
          </section>
        )}
      </AlertDescription>
    </Alert>
  )
}
