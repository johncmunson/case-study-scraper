import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ScrapeJobResult } from "@/components/scrape-runs/scrape-job-result"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"
import { validScrapeJobDetail } from "@/tests/frontend/scrape-run-fixtures"

function completeDetail(
  replacement: Partial<ScrapeJobDetail> = {},
): ScrapeJobDetail {
  return {
    ...validScrapeJobDetail,
    status: "complete",
    result: {
      industry: "Manufacturing",
      client_name: "Acme",
    },
    finishedAt: "2026-04-01T10:04:00.000Z",
    ...replacement,
    fields: replacement.fields ?? validScrapeJobDetail.fields,
  }
}

describe("Scrape Job Extraction Result", () => {
  it("presents every value in configured field order with semantic field details", () => {
    const { container } = render(<ScrapeJobResult job={completeDetail()} />)

    const result = screen.getByRole("region", { name: "Extraction Result" })
    expect(
      within(result).getByRole("heading", { name: "Extraction Result" }),
    ).toBeInTheDocument()

    const terms = [...container.querySelectorAll("dt")]
    const definitions = [...container.querySelectorAll("dd")]
    expect(terms).toHaveLength(2)
    expect(definitions).toHaveLength(2)
    expect(terms[0]).toHaveTextContent("Client Name")
    expect(terms[0]).toHaveTextContent("The customer name")
    expect(terms[0]).toHaveTextContent("Required")
    expect(terms[0]).toHaveTextContent("Primary Identifier")
    expect(definitions[0]).toHaveTextContent("Acme")
    expect(terms[1]).toHaveTextContent("Industry")
    expect(terms[1]).toHaveTextContent("The customer industry")
    expect(terms[1]).toHaveTextContent("Optional")
    expect(definitions[1]).toHaveTextContent("Manufacturing")
    expect(result).not.toHaveTextContent("client_name")
  })

  it("shows an optional Missing Value as Not found", () => {
    render(
      <ScrapeJobResult
        job={completeDetail({
          result: { client_name: "Acme", industry: null },
        })}
      />,
    )

    const industry = screen.getByText("Industry").closest("dt")
    expect(industry?.nextElementSibling).toHaveTextContent("Not found")
  })

  it("keeps long labels, descriptions, and multiline values readable and plain", () => {
    const longLabel = "Industry Classification With A Very Long User Facing Name"
    const longDescription =
      "An intentionally long field description that remains readable on narrow layouts"
    const multilineValue =
      "First line with an intentionally long unbroken-value-for-responsive-layouts\nhttps://example.com/not-a-link"
    render(
      <ScrapeJobResult
        job={completeDetail({
          fields: [
            validScrapeJobDetail.fields[0],
            {
              ...validScrapeJobDetail.fields[1],
              label: longLabel,
              description: longDescription,
            },
          ],
          result: { client_name: "Acme", industry: multilineValue },
        })}
      />,
    )

    expect(screen.getByText(longLabel)).toHaveClass("wrap-break-word")
    expect(screen.getByText(longDescription)).toHaveClass("wrap-break-word")
    const value = screen.getByText(/First line with an intentionally long/)
    expect(value).toHaveTextContent(/First line.*not-a-link/)
    expect(value.textContent).toBe(multilineValue)
    expect(value).toHaveClass("wrap-anywhere", "whitespace-pre-wrap", "select-text")
    expect(within(value).queryByRole("link")).not.toBeInTheDocument()
  })
})
