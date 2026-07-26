"use client"

import { Code2Icon, EyeIcon } from "lucide-react"
import { type ComponentProps, useState } from "react"
import ReactMarkdown, {
  defaultUrlTransform,
  type ExtraProps,
} from "react-markdown"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
    ((value.length > 350 && /[\r\n]/.test(value)) ||
      fieldKey.includes("markdown"))
  )
}

function resolveMarkdownUrl(url: string, canonicalPageUrl: string) {
  const safeUrl = defaultUrlTransform(url)

  if (safeUrl === "") return undefined

  try {
    return new URL(safeUrl, canonicalPageUrl).href
  } catch {
    return undefined
  }
}

function MarkdownLink({ href, ...props }: ComponentProps<"a">) {
  const opensNewTab =
    href?.startsWith("http://") || href?.startsWith("https://")

  return (
    <a
      {...props}
      className="wrap-anywhere text-foreground underline underline-offset-4 hover:text-primary hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      href={href}
      rel={opensNewTab ? "noopener noreferrer" : undefined}
      target={opensNewTab ? "_blank" : undefined}
    />
  )
}

function CompactMarkdownHeading({
  node: _node,
  ...props
}: ComponentProps<"h6"> & ExtraProps) {
  return (
    <h6
      className="mt-2 wrap-anywhere text-sm font-semibold first:mt-0"
      {...props}
    />
  )
}

function MarkdownAction({
  candidate,
  renderMarkdown,
  onToggle,
}: {
  candidate: boolean
  renderMarkdown: boolean
  onToggle: () => void
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

  const label = renderMarkdown ? "Show raw text" : "Render Markdown"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            className="cursor-pointer"
            onClick={onToggle}
            size="icon-sm"
            type="button"
            variant={renderMarkdown ? "secondary" : "outline"}
          />
        }
      >
        {renderMarkdown ? (
          <Code2Icon aria-hidden="true" />
        ) : (
          <EyeIcon aria-hidden="true" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ExtractionResultField({
  canonicalPageUrl,
  field,
  value,
}: {
  canonicalPageUrl: string
  field: ExtractionField
  value: string | null
}) {
  const candidate = isMarkdownCandidate(field.key, value)
  const [renderMarkdown, setRenderMarkdown] = useState(true)
  const shouldRenderMarkdown = candidate && renderMarkdown

  return (
    <div className="grid min-w-0 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5">
      <dt className="min-w-0">
        <span className="block wrap-break-word text-base font-medium">
          {field.label}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant={field.required ? "secondary" : "outline"}>
            {field.required ? "Required" : "Optional"}
          </Badge>
          {field.primaryIdentifier && (
            <Badge variant="outline">Primary Identifier</Badge>
          )}
          <span
            className="flex size-7 shrink-0 items-center"
            data-slot="markdown-action"
          >
            <MarkdownAction
              candidate={candidate}
              renderMarkdown={shouldRenderMarkdown}
              onToggle={() =>
                setRenderMarkdown((renderMarkdown) => !renderMarkdown)
              }
            />
          </span>
        </span>
        <span className="mt-2 block wrap-break-word text-sm text-muted-foreground">
          {field.description}
        </span>
      </dt>
      <dd
        className={
          shouldRenderMarkdown
            ? "min-w-0 select-text sm:pt-0.5"
            : "min-w-0 wrap-anywhere whitespace-pre-wrap select-text sm:pt-0.5"
        }
      >
        {value === null ? (
          <span className="text-muted-foreground">Not found</span>
        ) : shouldRenderMarkdown ? (
          <ReactMarkdown
            urlTransform={(url) => resolveMarkdownUrl(url, canonicalPageUrl)}
            components={{
              a: ({ node: _node, ...props }) => <MarkdownLink {...props} />,
              img: ({ node: _node, alt, src, title }) => {
                const source = typeof src === "string" ? src : undefined

                return (
                  <span className="wrap-anywhere">
                    <span>{alt || "Image"}</span>
                    {source && (
                      <>
                        {" ("}
                        <MarkdownLink href={source} title={title}>
                          {source}
                        </MarkdownLink>
                        {")"}
                      </>
                    )}
                  </span>
                )
              },
              h1: ({ node: _node, ...props }) => (
                <h3
                  className="mt-3 wrap-anywhere text-lg font-semibold first:mt-0"
                  {...props}
                />
              ),
              h2: ({ node: _node, ...props }) => (
                <h4
                  className="mt-3 wrap-anywhere text-base font-semibold first:mt-0"
                  {...props}
                />
              ),
              h3: ({ node: _node, ...props }) => (
                <h5
                  className="mt-2 wrap-anywhere text-sm font-semibold first:mt-0"
                  {...props}
                />
              ),
              h4: CompactMarkdownHeading,
              h5: CompactMarkdownHeading,
              h6: CompactMarkdownHeading,
              p: ({ node: _node, ...props }) => (
                <p
                  className="my-2 wrap-anywhere leading-relaxed first:mt-0 last:mb-0"
                  {...props}
                />
              ),
              ul: ({ node: _node, ...props }) => (
                <ul
                  className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0"
                  {...props}
                />
              ),
              ol: ({ node: _node, ...props }) => (
                <ol
                  className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0"
                  {...props}
                />
              ),
              li: ({ node: _node, ...props }) => (
                <li className="wrap-anywhere pl-0.5" {...props} />
              ),
              blockquote: ({ node: _node, ...props }) => (
                <blockquote
                  className="my-2 border-l-2 border-border pl-3 text-muted-foreground first:mt-0 last:mb-0"
                  {...props}
                />
              ),
              hr: ({ node: _node, ...props }) => (
                <hr className="my-3 border-border" {...props} />
              ),
              code: ({ node: _node, className, ...props }) => (
                <code
                  className={`wrap-anywhere rounded bg-muted px-1 py-0.5 font-mono text-[0.875em] ${className ?? ""}`}
                  {...props}
                />
              ),
              pre: ({ node: _node, ...props }) => (
                <pre
                  className="my-2 max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs first:mt-0 last:mb-0 [&>code]:wrap-normal [&>code]:whitespace-pre [&>code]:bg-transparent [&>code]:p-0"
                  {...props}
                />
              ),
            }}
          >
            {value}
          </ReactMarkdown>
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
    <section aria-label="Extraction Result">
      <dl className="space-y-6">
        {job.fields.map((field) => (
          <ExtractionResultField
            key={field.key}
            canonicalPageUrl={job.url}
            field={field}
            value={result[field.key]}
          />
        ))}
      </dl>
    </section>
  )
}
