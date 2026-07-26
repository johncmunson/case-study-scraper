import { describe, expect, it } from "vitest"

import {
  AiGatewayConfigurationError,
  FirecrawlConfigurationError,
  UrlFilterModelConfigurationError,
  validateScrapeRunDeploymentConfiguration,
  validateUrlFilterConfiguration,
} from "@/lib/server/scrape-runs/deployment-configuration"

describe("URL filtering deployment configuration", () => {
  it.each([
    { AI_GATEWAY_API_KEY: "gateway-key" },
    { VERCEL_OIDC_TOKEN: "oidc-token" },
  ])(
    "returns the trimmed persisted model with supported Gateway auth",
    (auth) => {
      expect(
        validateUrlFilterConfiguration({
          ...auth,
          URL_FILTER_MODEL: "  anthropic/claude-sonnet-4.5  ",
        }),
      ).toBe("anthropic/claude-sonnet-4.5")
    },
  )

  it("rejects missing Gateway authentication as unavailable configuration", () => {
    let thrown: unknown

    try {
      validateUrlFilterConfiguration({
        URL_FILTER_MODEL: "anthropic/claude-sonnet-4.5",
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AiGatewayConfigurationError)
    expect(thrown).toMatchObject({ status: 503 })
  })

  it.each([undefined, "", "   "])("rejects missing model %s", (model) => {
    expect(() =>
      validateUrlFilterConfiguration({
        AI_GATEWAY_API_KEY: "gateway-key",
        URL_FILTER_MODEL: model,
      }),
    ).toThrow(UrlFilterModelConfigurationError)
  })

  it("preflights every provider while returning only the persisted model", () => {
    expect(
      validateScrapeRunDeploymentConfiguration({
        FIRECRAWL_API_KEY: "firecrawl-key",
        AI_GATEWAY_API_KEY: "gateway-key",
        URL_FILTER_MODEL: "  anthropic/claude-sonnet-4.5  ",
      }),
    ).toEqual({ filteringModel: "anthropic/claude-sonnet-4.5" })
  })

  it.each([undefined, "", "   "])(
    "rejects missing Firecrawl configuration %s",
    (apiKey) => {
      expect(() =>
        validateScrapeRunDeploymentConfiguration({
          FIRECRAWL_API_KEY: apiKey,
          AI_GATEWAY_API_KEY: "gateway-key",
          URL_FILTER_MODEL: "anthropic/claude-sonnet-4.5",
        }),
      ).toThrow(FirecrawlConfigurationError)
    },
  )
})
