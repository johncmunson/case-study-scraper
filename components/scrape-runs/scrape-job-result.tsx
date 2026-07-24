"use client"

import { EyeIcon } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"

type ExtractionField = ScrapeJobDetail["fields"][number]

function isMarkdownCandidate(fieldKey: string, value: string | null) {
  return (
    value !== null &&
    ((value.length > 250 && /[\r\n]/.test(value)) ||
      fieldKey.includes("markdown"))
  )
}

function MarkdownAction({
  candidate,
  onRender,
}: {
  candidate: boolean
  onRender: () => void
}) {
  if (!candidate) {
    return (
      <Button
        aria-hidden="true"
        className="invisible"
        disabled
        size="icon-sm"
        tabIndex={-1}
        type="button"
        variant="outline"
      >
        <EyeIcon aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Render Markdown"
            onClick={onRender}
            size="icon-sm"
            type="button"
            variant="outline"
          />
        }
      >
        <EyeIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>Render Markdown</TooltipContent>
    </Tooltip>
  )
}

function ExtractionResultField({
  field,
  value,
}: {
  field: ExtractionField
  value: string | null
}) {
  const [, setRenderMarkdown] = useState(false)
  const candidate = isMarkdownCandidate(field.key, value)

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5">
      <dt className="min-w-0">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block wrap-break-word font-medium">
              {field.label}
            </span>
            <span className="mt-1 flex flex-wrap gap-2">
              <Badge variant={field.required ? "secondary" : "outline"}>
                {field.required ? "Required" : "Optional"}
              </Badge>
              {field.primaryIdentifier && (
                <Badge variant="outline">Primary Identifier</Badge>
              )}
            </span>
          </span>
          <span
            className="flex size-7 shrink-0 items-start justify-end"
            data-slot="markdown-action"
          >
            <MarkdownAction
              candidate={candidate}
              onRender={() =>
                setRenderMarkdown((renderMarkdown) => !renderMarkdown)
              }
            />
          </span>
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
}

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
            {job.fields.map((field) => (
              <ExtractionResultField
                key={field.key}
                field={field}
                value={result[field.key]}
              />
            ))}
          </dl>
        </CardContent>
      </Card>
    </section>
  )
}
