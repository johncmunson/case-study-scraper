import "server-only"

import { getDatabaseUrl } from "@/db/databaseUrl"

export class DeploymentConfigurationError extends Error {
  readonly status = 503

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "DeploymentConfigurationError"
  }
}

export class DatabaseConfigurationError extends DeploymentConfigurationError {
  constructor(options?: ErrorOptions) {
    super("Database configuration is unavailable.", options)
    this.name = "DatabaseConfigurationError"
  }
}

export class FirecrawlConfigurationError extends DeploymentConfigurationError {
  constructor() {
    super("FIRECRAWL_API_KEY must be configured for Firecrawl.")
    this.name = "FirecrawlConfigurationError"
  }
}

export class AiGatewayConfigurationError extends DeploymentConfigurationError {
  constructor() {
    super(
      "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN must be configured for AI Gateway.",
    )
    this.name = "AiGatewayConfigurationError"
  }
}

export class UrlFilterModelConfigurationError extends DeploymentConfigurationError {
  constructor() {
    super("URL_FILTER_MODEL must be configured for URL filtering.")
    this.name = "UrlFilterModelConfigurationError"
  }
}

type ScrapeRunDeploymentEnvironment = Readonly<
  Partial<
    Record<
      | "FIRECRAWL_API_KEY"
      | "AI_GATEWAY_API_KEY"
      | "VERCEL_OIDC_TOKEN"
      | "URL_FILTER_MODEL",
      string | undefined
    >
  >
>

type AiGatewayEnvironment = Omit<
  ScrapeRunDeploymentEnvironment,
  "FIRECRAWL_API_KEY"
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

export function validateDatabaseDeploymentConfiguration() {
  try {
    getDatabaseUrl()
  } catch (error) {
    throw new DatabaseConfigurationError({ cause: error })
  }
}

export function validateScrapeRunDeploymentConfiguration(
  environment: ScrapeRunDeploymentEnvironment,
) {
  if (!environment.FIRECRAWL_API_KEY?.trim()) {
    throw new FirecrawlConfigurationError()
  }

  return {
    filteringModel: validateUrlFilterConfiguration(environment),
  } as const
}
