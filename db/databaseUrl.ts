const databaseUrlEnvVars = {
  development: ["DATABASE_URL", "DATABASE_URL_UNPOOLED"],
  test: ["TEST_DATABASE_URL", "TEST_DATABASE_URL_UNPOOLED"],
  production: ["PRODUCTION_DATABASE_URL", "PRODUCTION_DATABASE_URL_UNPOOLED"],
  staging: ["STAGING_DATABASE_URL", "STAGING_DATABASE_URL_UNPOOLED"],
} as const

type DatabaseEnvironment = keyof typeof databaseUrlEnvVars

export function getDatabaseUrl({
  preferUnpooled = false,
}: { preferUnpooled?: boolean } = {}) {
  const environment =
    process.env.APP_ENV === "staging" ? "staging" : process.env.NODE_ENV

  if (environment === "staging" && process.env.NODE_ENV !== "production") {
    throw new Error('APP_ENV="staging" requires NODE_ENV="production".')
  }

  for (const [expectedEnvironment, envVars] of Object.entries(
    databaseUrlEnvVars,
  )) {
    const mismatchedEnvVar = envVars.find(
      (envVar) => process.env[envVar] !== undefined,
    )

    if (mismatchedEnvVar && environment !== expectedEnvironment) {
      throw new Error(
        `${mismatchedEnvVar} may only be set in the ${expectedEnvironment} environment.`,
      )
    }
  }

  const envVars = databaseUrlEnvVars[environment as DatabaseEnvironment]

  if (!envVars) {
    throw new Error(
      `Unsupported database environment: NODE_ENV=${JSON.stringify(process.env.NODE_ENV)}, APP_ENV=${JSON.stringify(process.env.APP_ENV)}.`,
    )
  }

  const candidates = preferUnpooled ? [envVars[1], envVars[0]] : [envVars[0]]
  const databaseUrl = candidates
    .map((envVar) => process.env[envVar])
    .find(Boolean)

  if (!databaseUrl) {
    throw new Error(
      `${candidates.join(" or ")} must be set in the ${environment} environment.`,
    )
  }

  return databaseUrl
}
