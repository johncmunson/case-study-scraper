const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"] as const

/**
 * Better Auth validates request origins against the configured app URL.
 * In local development, developers may open the same app via different
 * loopback hostnames, so allow sibling loopback origins on the same port.
 */
export function getAdditionalTrustedOrigins(
  appURL: string | undefined,
): string[] {
  if (!appURL) {
    return []
  }

  let parsedURL: URL

  try {
    parsedURL = new URL(appURL)
  } catch {
    return []
  }

  if (
    !LOOPBACK_HOSTNAMES.includes(
      parsedURL.hostname as (typeof LOOPBACK_HOSTNAMES)[number],
    )
  ) {
    return []
  }

  const port = parsedURL.port ? `:${parsedURL.port}` : ""

  return LOOPBACK_HOSTNAMES.filter(
    (hostname) => hostname !== parsedURL.hostname,
  ).map((hostname) => `${parsedURL.protocol}//${hostname}${port}`)
}
