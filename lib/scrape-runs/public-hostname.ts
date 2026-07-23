const NON_PUBLIC_HOSTNAME_SUFFIXES = [
  "localhost",
  "local",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "localdomain",
  "home.arpa",
  "test",
  "invalid",
  "example",
  "onion",
  "alt",
] as const

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "")
}

function isIpAddress(hostname: string) {
  const unbracketedHostname = hostname.replace(/^\[(.*)\]$/, "$1")

  if (unbracketedHostname.includes(":")) {
    return true
  }

  const parts = unbracketedHostname.split(".")

  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) &&
        Number(part) >= 0 &&
        Number(part) <= 255,
    )
  )
}

export function isPublicDnsHostname(hostname: string) {
  const normalizedHostname = normalizeHostname(hostname)

  if (isIpAddress(normalizedHostname)) {
    return false
  }

  if (
    normalizedHostname.length === 0 ||
    normalizedHostname.length > 253 ||
    !normalizedHostname.includes(".")
  ) {
    return false
  }

  const labels = normalizedHostname.split(".")

  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
  ) {
    return false
  }

  return !NON_PUBLIC_HOSTNAME_SUFFIXES.some(
    (suffix) =>
      normalizedHostname === suffix ||
      normalizedHostname.endsWith(`.${suffix}`),
  )
}
