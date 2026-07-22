import "server-only"

import Firecrawl from "firecrawl"

import { normalizePageUrl } from "@/lib/scrape-runs/urls"
import {
  MalformedProviderOutputError,
  toProviderWorkflowError,
} from "@/lib/server/scrape-runs/providers/errors"

const MAP_OPTIONS = {
  sitemap: "include",
  includeSubdomains: false,
  ignoreQueryParameters: true,
  limit: 100_000,
} as const

export type MapTargetSiteInput = Readonly<{
  targetUrl: string
  apiKey: string
}>

export async function mapTargetSite({
  targetUrl,
  apiKey,
}: MapTargetSiteInput): Promise<string[]> {
  try {
    if (!apiKey.trim()) {
      throw new TypeError("A Firecrawl API key is required.")
    }

    const targetHostname = new URL(targetUrl).hostname
    // The installed SDK counts maxRetries as total attempts. One disables its
    // hidden retry loop so Workflow remains the sole retry authority.
    const firecrawl = new Firecrawl({ apiKey, maxRetries: 1 })
    let response: Awaited<ReturnType<typeof firecrawl.map>>

    try {
      response = await firecrawl.map(targetUrl, MAP_OPTIONS)
    } catch (error) {
      // The SDK throws a TypeError while iterating a non-array `links` value.
      // At this point all adapter inputs are known-valid, so that shape means
      // the provider response itself was malformed.
      if (
        error instanceof TypeError &&
        error.message.includes("linksIn is not iterable")
      ) {
        throw new MalformedProviderOutputError()
      }

      throw error
    }

    if (!Array.isArray(response.links)) {
      throw new MalformedProviderOutputError()
    }

    const canonicalUrls: string[] = []
    const seenUrls = new Set<string>()

    for (const link of response.links) {
      if (typeof link.url !== "string") {
        continue
      }

      const normalized = normalizePageUrl(link.url)

      if (
        !normalized.success ||
        normalized.hostname !== targetHostname ||
        seenUrls.has(normalized.url)
      ) {
        continue
      }

      seenUrls.add(normalized.url)
      canonicalUrls.push(normalized.url)
    }

    return canonicalUrls
  } catch (error) {
    throw toProviderWorkflowError("mapping", error)
  }
}
