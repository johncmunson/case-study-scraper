export class AiGatewayConfigurationError extends Error {
  readonly status = 401

  constructor() {
    super(
      "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN must be configured for AI Gateway.",
    )
    this.name = "AiGatewayConfigurationError"
  }
}

export function validateAiGatewayConfig(environment: NodeJS.ProcessEnv) {
  if (
    environment.AI_GATEWAY_API_KEY?.trim() ||
    environment.VERCEL_OIDC_TOKEN?.trim()
  ) {
    return
  }
  throw new AiGatewayConfigurationError()
}
