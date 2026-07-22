export class AiGatewayConfigurationError extends Error {
  readonly status = 503

  constructor() {
    super(
      "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN must be configured for AI Gateway.",
    )
    this.name = "AiGatewayConfigurationError"
  }
}

export class UrlFilterModelConfigurationError extends Error {
  readonly status = 503

  constructor() {
    super("URL_FILTER_MODEL must be configured for URL filtering.")
    this.name = "UrlFilterModelConfigurationError"
  }
}

type AiGatewayEnvironment = Readonly<
  Partial<
    Record<
      "AI_GATEWAY_API_KEY" | "VERCEL_OIDC_TOKEN" | "URL_FILTER_MODEL",
      string | undefined
    >
  >
>

export function validateAiGatewayConfig(
  environment: Pick<
    AiGatewayEnvironment,
    "AI_GATEWAY_API_KEY" | "VERCEL_OIDC_TOKEN"
  >,
) {
  if (
    environment.AI_GATEWAY_API_KEY?.trim() ||
    environment.VERCEL_OIDC_TOKEN?.trim()
  ) {
    return
  }
  throw new AiGatewayConfigurationError()
}

export function validateUrlFilterConfiguration(
  environment: AiGatewayEnvironment,
) {
  validateAiGatewayConfig(environment)

  const filteringModel = environment.URL_FILTER_MODEL?.trim()

  if (!filteringModel) {
    throw new UrlFilterModelConfigurationError()
  }

  return filteringModel
}
