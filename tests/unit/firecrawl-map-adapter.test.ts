import { http, HttpResponse } from "msw"
import { FatalError, RetryableError } from "workflow"
import { describe, expect, it, vi } from "vitest"

import { mapTargetSite } from "@/lib/server/scrape-runs/providers/firecrawl-map"
import { server } from "@/tests/mocks/server"

const targetUrl = "https://example.com/"

function mapHandler(
  resolver: Parameters<typeof http.post>[1],
) {
  return http.post("https://api.firecrawl.dev/v2/map", resolver)
}

describe("Firecrawl Map adapter", () => {
  it("uses the product Map options and returns only ordered, deduplicated exact-host Canonical Page URLs", async () => {
    let requestBody: unknown

    server.use(
      mapHandler(async ({ request }) => {
        requestBody = await request.json()

        return HttpResponse.json({
          success: true,
          links: [
            { url: "https://EXAMPLE.com:443/cases/one/?campaign=test#work" },
            { url: "https://example.com/cases/two" },
            { url: "https://example.com/cases/one" },
            { url: "https://sub.example.com/cases/three" },
            { url: "https://other.com/cases/four" },
            { url: "not a URL" },
            { title: "missing URL" },
            null,
            42,
            "malformed entry",
          ],
        })
      }),
    )

    await expect(
      mapTargetSite({ targetUrl, apiKey: "fc-test" }),
    ).resolves.toEqual([
      "https://example.com/cases/one",
      "https://example.com/cases/two",
    ])
    expect(requestBody).toMatchObject({
      url: targetUrl,
      sitemap: "include",
      includeSubdomains: false,
      ignoreQueryParameters: true,
      limit: 100_000,
    })
  })

  it("treats a structurally malformed Map response as retryable", async () => {
    server.use(
      mapHandler(() =>
        HttpResponse.json({ success: true, links: { url: "not-an-array" } }),
      ),
    )

    await expect(
      mapTargetSite({ targetUrl, apiKey: "fc-test" }),
    ).rejects.toMatchObject({
      constructor: RetryableError,
      message: "Mapping provider returned malformed output.",
    })
  })

  it("classifies transient failures for Workflow retry without the SDK making hidden retries", async () => {
    const requests = vi.fn()

    server.use(
      mapHandler(() => {
        requests()
        return HttpResponse.json({ success: false, error: "upstream" }, { status: 503 })
      }),
    )

    await expect(
      mapTargetSite({ targetUrl, apiKey: "fc-test" }),
    ).rejects.toBeInstanceOf(RetryableError)
    expect(requests).toHaveBeenCalledOnce()
  })

  it("classifies deterministic provider failures as fatal", async () => {
    server.use(
      mapHandler(() =>
        HttpResponse.json(
          { success: false, error: "invalid authentication" },
          { status: 401 },
        ),
      ),
    )

    await expect(
      mapTargetSite({ targetUrl, apiKey: "fc-invalid" }),
    ).rejects.toMatchObject({
      constructor: FatalError,
      message: "Mapping provider request cannot succeed without intervention.",
    })
  })

  it("does not log or persist the Site URL Set", async () => {
    const consoleSpies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ]
    const { databaseMock } = await import("@/tests/mocks/database")

    server.use(
      mapHandler(() =>
        HttpResponse.json({
          success: true,
          links: [{ url: "https://example.com/cases/one" }],
        }),
      ),
    )

    await mapTargetSite({ targetUrl, apiKey: "fc-test" })

    expect(consoleSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true)
    expect(databaseMock.insert).not.toHaveBeenCalled()
    expect(databaseMock.update).not.toHaveBeenCalled()
    expect(databaseMock.transaction).not.toHaveBeenCalled()
  })
})
