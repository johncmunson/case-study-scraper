import { isPublicDnsHostname } from "@/lib/scrape-runs/public-hostname"

export { isPublicDnsHostname } from "@/lib/scrape-runs/public-hostname"

export const MAX_SUBMITTED_URL_LENGTH = 2_048

export const URL_NORMALIZATION_ERROR_MESSAGES = {
  tooLong: `URLs must contain at most ${MAX_SUBMITTED_URL_LENGTH.toLocaleString("en-US")} characters.`,
  invalidProtocol: "Must be a valid HTTP or HTTPS URL.",
  credentials: "URLs must not include credentials.",
  nonPublicHostname: "URLs must use a public DNS hostname.",
} as const

export type UrlNormalizationError =
  keyof typeof URL_NORMALIZATION_ERROR_MESSAGES

type UrlNormalizationFailure = Readonly<{
  success: false
  error: UrlNormalizationError
  message: (typeof URL_NORMALIZATION_ERROR_MESSAGES)[UrlNormalizationError]
}>

type UrlNormalizationResult =
  | Readonly<{
      success: true
      url: string
      hostname: string
    }>
  | UrlNormalizationFailure

function failure(error: UrlNormalizationError): UrlNormalizationFailure {
  return {
    success: false,
    error,
    message: URL_NORMALIZATION_ERROR_MESSAGES[error],
  }
}

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "")
}

function parseSubmittedUrl(
  value: string,
):
  | Readonly<{ success: true; url: URL; hostname: string }>
  | UrlNormalizationFailure {
  if (value.length > MAX_SUBMITTED_URL_LENGTH) {
    return failure("tooLong")
  }

  const trimmedValue = value.trim()

  let parsedUrl: URL

  try {
    parsedUrl = new URL(trimmedValue)
  } catch {
    return failure("invalidProtocol")
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return failure("invalidProtocol")
  }

  if (parsedUrl.username || parsedUrl.password) {
    return failure("credentials")
  }

  const hostname = normalizeHostname(parsedUrl.hostname)

  if (!isPublicDnsHostname(hostname)) {
    return failure("nonPublicHostname")
  }

  parsedUrl.hostname = hostname

  return { success: true, url: parsedUrl, hostname }
}

export function normalizeTargetUrl(value: string): UrlNormalizationResult {
  const parsed = parseSubmittedUrl(value)

  if (!parsed.success) {
    return parsed
  }

  return {
    success: true,
    url: `${parsed.url.origin}/`,
    hostname: parsed.hostname,
  }
}

function normalizePathname(pathname: string) {
  const normalizedPercentEncoding = pathname.replace(
    /%[0-9a-f]{2}/gi,
    (encodedCharacter) => {
      const decodedCharacter = String.fromCharCode(
        Number.parseInt(encodedCharacter.slice(1), 16),
      )

      return /^[A-Za-z0-9._~-]$/.test(decodedCharacter)
        ? decodedCharacter
        : encodedCharacter.toUpperCase()
    },
  )

  return normalizedPercentEncoding.replace(/\/+$/, "") || "/"
}

export function normalizePageUrl(value: string): UrlNormalizationResult {
  const parsed = parseSubmittedUrl(value)

  if (!parsed.success) {
    return parsed
  }

  const pathname = normalizePathname(parsed.url.pathname)

  return {
    success: true,
    url: `${parsed.url.origin}${pathname}`,
    hostname: parsed.hostname,
  }
}
