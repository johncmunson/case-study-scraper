import { describe, expect, it } from "vitest"

import {
  AiGatewayConfigurationError,
  UrlFilterModelConfigurationError,
  validateUrlFilterConfiguration,
} from "@/lib/validate-ai-gateway-config"

describe("URL filtering deployment configuration", () => {
  it.each([
    { AI_GATEWAY_API_KEY: "gateway-key" },
    { VERCEL_OIDC_TOKEN: "oidc-token" },
  ])("returns the trimmed persisted model with supported Gateway auth", (auth) => {
    expect(
      validateUrlFilterConfiguration({
        ...auth,
        URL_FILTER_MODEL: "  anthropic/claude-sonnet-4.5  ",
      }),
    ).toBe("anthropic/claude-sonnet-4.5")
  })

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
})
