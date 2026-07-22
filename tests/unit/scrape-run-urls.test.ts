import { describe, expect, it } from "vitest"

import {
  isPublicDnsHostname,
  MAX_SUBMITTED_URL_LENGTH,
  normalizePageUrl,
  normalizeTargetUrl,
} from "@/lib/scrape-runs/urls"

function expectNormalized(
  result: ReturnType<typeof normalizeTargetUrl>,
  expectedUrl: string,
) {
  expect(result).toMatchObject({ success: true, url: expectedUrl })
}

describe("public DNS hostname validation", () => {
  it.each([
    "example.com",
    "www.example.com",
    "EXAMPLE.COM.",
    "xn--bcher-kva.de",
  ])("accepts %s", (hostname) => {
    expect(isPublicDnsHostname(hostname)).toBe(true)
  })

  it.each([
    "localhost",
    "api.localhost",
    "intranet",
    "service.internal",
    "printer.local",
    "router.lan",
    "service.home.arpa",
    "service.test",
    "example.invalid",
    "hidden.onion",
    "private.alt",
    "127.0.0.1",
    "192.168.1.1",
    "[::1]",
    "bad_host.example.com",
    "-bad.example.com",
    "bad-.example.com",
  ])("rejects non-public hostname %s", (hostname) => {
    expect(isPublicDnsHostname(hostname)).toBe(false)
  })
})

describe("normalizeTargetUrl", () => {
  it.each([
    [
      " https://EXAMPLE.com:443/case-studies?source=test#top ",
      "https://example.com/",
    ],
    ["http://example.com:80/a/b", "http://example.com/"],
    ["https://example.com:8443/a/b", "https://example.com:8443/"],
    ["https://example.com./a/b", "https://example.com/"],
  ])("normalizes %s to its origin", (input, expected) => {
    expectNormalized(normalizeTargetUrl(input), expected)
  })

  it("accepts a URL at the length limit and rejects one beyond it", () => {
    const prefix = "https://example.com/"
    const atLimit = `${prefix}${"a".repeat(MAX_SUBMITTED_URL_LENGTH - prefix.length)}`
    const overLimit = `${atLimit}a`

    expect(normalizeTargetUrl(atLimit).success).toBe(true)
    expect(normalizeTargetUrl(overLimit)).toMatchObject({
      success: false,
      error: "tooLong",
    })
    expect(normalizeTargetUrl(` ${atLimit}`)).toMatchObject({
      success: false,
      error: "tooLong",
    })
  })

  it.each([
    ["ftp://example.com", "invalidProtocol"],
    ["not a URL", "invalidProtocol"],
    ["https://user:secret@example.com", "credentials"],
    ["https://localhost/path", "nonPublicHostname"],
    ["https://127.0.0.1/path", "nonPublicHostname"],
    ["https://[::1]/path", "nonPublicHostname"],
    ["https://internal/path", "nonPublicHostname"],
  ])("rejects %s with %s", (input, error) => {
    expect(normalizeTargetUrl(input)).toMatchObject({ success: false, error })
  })
})

describe("normalizePageUrl", () => {
  it.each([
    [
      "https://EXAMPLE.com:443/case-studies/one/?source=test#top",
      "https://example.com/case-studies/one",
    ],
    ["http://example.com:80/path/", "http://example.com/path"],
    ["https://example.com/?query=yes#top", "https://example.com/"],
    ["https://example.com/a/../b/./", "https://example.com/b"],
    ["https://example.com/path////", "https://example.com/path"],
    ["https://example.com/%7eclient/%2f", "https://example.com/~client/%2F"],
  ])("canonicalizes %s", (input, expected) => {
    expectNormalized(normalizePageUrl(input), expected)
  })

  it("rejects credentials rather than silently removing them", () => {
    expect(normalizePageUrl("https://user@example.com/page")).toMatchObject({
      success: false,
      error: "credentials",
    })
  })
})
