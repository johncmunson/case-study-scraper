import "server-only"

import { generateText, type LanguageModel, Output } from "ai"
import { z } from "zod"

import { normalizePageUrl } from "@/lib/scrape-runs/urls"
import { toProviderWorkflowError } from "@/lib/server/scrape-runs/providers/errors"

const selectedUrlsSchema = z
  .object({
    urls: z.array(z.string()),
  })
  .strict()

export type UrlSelectionInput = Readonly<{
  targetUrl: string
  siteUrls: readonly string[]
  exampleUrls: readonly string[]
}>

export type SelectMatchingPageUrlsInput = UrlSelectionInput &
  Readonly<{
    filteringModel: LanguageModel
  }>

function canonicalExactHostUrl(value: string, targetHostname: string) {
  const normalized = normalizePageUrl(value)

  return normalized.success && normalized.hostname === targetHostname
    ? normalized.url
    : undefined
}

export function postProcessSelectedUrls({
  targetUrl,
  siteUrls,
  exampleUrls,
  returnedUrls,
}: UrlSelectionInput & Readonly<{ returnedUrls: readonly string[] }>) {
  const targetHostname = new URL(targetUrl).hostname
  const orderedSiteUrls: string[] = []
  const siteUrlSet = new Set<string>()

  for (const value of siteUrls) {
    const canonicalUrl = canonicalExactHostUrl(value, targetHostname)

    if (canonicalUrl && !siteUrlSet.has(canonicalUrl)) {
      siteUrlSet.add(canonicalUrl)
      orderedSiteUrls.push(canonicalUrl)
    }
  }

  const selectedUrlSet = new Set<string>()

  for (const value of returnedUrls) {
    const canonicalUrl = canonicalExactHostUrl(value, targetHostname)

    if (canonicalUrl && siteUrlSet.has(canonicalUrl)) {
      selectedUrlSet.add(canonicalUrl)
    }
  }

  const orderedExampleUrls: string[] = []
  const exampleUrlSet = new Set<string>()

  for (const value of exampleUrls) {
    const canonicalUrl = canonicalExactHostUrl(value, targetHostname)

    if (canonicalUrl && !exampleUrlSet.has(canonicalUrl)) {
      exampleUrlSet.add(canonicalUrl)
      orderedExampleUrls.push(canonicalUrl)
    }
  }

  const selectedUrls = orderedSiteUrls.filter(
    (url) => selectedUrlSet.has(url) || exampleUrlSet.has(url),
  )
  const includedUrls = new Set(selectedUrls)

  for (const exampleUrl of orderedExampleUrls) {
    if (!includedUrls.has(exampleUrl)) {
      includedUrls.add(exampleUrl)
      selectedUrls.push(exampleUrl)
    }
  }

  return selectedUrls
}

function filteringPrompt({ siteUrls, exampleUrls }: UrlSelectionInput) {
  return [
    "Select every candidate URL whose path structure matches the Example Pages.",
    "Return URLs only from candidateUrls and copy exact candidate URLs without rewriting them.",
    "Use one selection decision across the complete candidate list.",
    JSON.stringify({ exampleUrls, candidateUrls: siteUrls }),
  ].join("\n\n")
}

export async function selectMatchingPageUrls({
  targetUrl,
  siteUrls,
  exampleUrls,
  filteringModel,
}: SelectMatchingPageUrlsInput): Promise<string[]> {
  try {
    const { output } = await generateText({
      model: filteringModel,
      output: Output.object({
        name: "MatchingPageUrls",
        description:
          "Canonical candidate URLs whose path structure matches the Example Pages.",
        schema: selectedUrlsSchema,
      }),
      prompt: filteringPrompt({ targetUrl, siteUrls, exampleUrls }),
      maxRetries: 0,
    })

    return postProcessSelectedUrls({
      targetUrl,
      siteUrls,
      exampleUrls,
      returnedUrls: output.urls,
    })
  } catch (error) {
    throw toProviderWorkflowError("filtering", error)
  }
}
