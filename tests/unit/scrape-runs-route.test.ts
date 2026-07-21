import { beforeEach, describe, expect, it, vi } from "vitest"

import { getCurrentSession } from "@/auth/session"
import { POST } from "@/app/api/scrape-runs/route"

vi.mock("@/auth/session", () => ({
  getCurrentSession: vi.fn(),
}))

const validPayload = {
  name: "Case studies",
  url: "https://example.com/case-studies",
  exampleUrls: [
    "https://example.com/case-studies/one",
    "https://example.com/case-studies/two",
  ],
  fields: [
    {
      label: "Company",
      description: "The company name",
      required: true,
      primaryIdentifier: true,
    },
  ],
}

function createRequest(body: unknown) {
  return new Request("http://localhost/api/scrape-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/scrape-runs", () => {
  beforeEach(() => {
    vi.mocked(getCurrentSession).mockResolvedValue(
      {} as NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>,
    )
  })

  it("rejects unauthenticated requests", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null)

    const response = await POST(createRequest(validPayload))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." })
  })

  it("returns the backend validation error", async () => {
    const response = await POST(
      createRequest({ ...validPayload, exampleUrls: [] }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "At least 2 example URLs are required.",
    })
  })

  it("logs and accepts a valid payload", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)

    const response = await POST(createRequest(validPayload))

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ success: true })
    expect(log).toHaveBeenCalledWith("New scrape run payload:", validPayload)
  })
})
