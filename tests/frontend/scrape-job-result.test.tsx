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

function fieldItem(label: string) {
  const term = screen.getByText(label).closest("dt")
  const item = term?.parentElement

  if (!term || !item) throw new Error(`Could not find field item for ${label}`)

  return { item, term }
}

function extractionField(
  key: string,
  label: string,
  position: number,
  replacement: Partial<ScrapeJobDetail["fields"][number]> = {},
): ScrapeJobDetail["fields"][number] {
  return {
    position,
    key,
    label,
    description: `Description for ${label}`,
    required: position === 0,
    primaryIdentifier: position === 0,
    ...replacement,
  }
}

describe("Scrape Job Extraction Result", () => {
  it("presents every value in Extraction Field order with semantic field details", () => {
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

    const clientNameLabel = within(terms[0]).getByText("Client Name")
    const requiredBadge = within(terms[0]).getByText("Required")
    expect(requiredBadge.parentElement?.previousElementSibling).toBe(
      clientNameLabel,
    )
    expect(clientNameLabel.compareDocumentPosition(requiredBadge)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(terms[0].parentElement).toHaveClass(
      "grid",
      "sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]",
    )
  })

  it("qualifies only multiline values longer than 250 characters by content", () => {
    const values = {
      line_feed: `${"a".repeat(249)}\nb`,
      carriage_return: `${"a".repeat(249)}\rb`,
      crlf: `${"a".repeat(248)}\r\nb`,
      exact_boundary: `${"a".repeat(248)}\nb`,
      long_single_line: "a".repeat(251),
    }
    const labels = {
      line_feed: "Line Feed",
      carriage_return: "Carriage Return",
      crlf: "CRLF",
      exact_boundary: "Exact Boundary",
      long_single_line: "Long Single Line",
    }
    const fields = Object.keys(values).map((key, position) =>
      extractionField(key, labels[key as keyof typeof labels], position),
    )

    render(
      <ScrapeJobResult
        job={completeDetail({
          fields,
          result: values,
        })}
      />,
    )

    for (const label of ["Line Feed", "Carriage Return", "CRLF"]) {
      expect(
        within(fieldItem(label).item).getByRole("button", {
          name: "Render Markdown",
        }),
      ).toBeInTheDocument()
    }

    for (const label of ["Exact Boundary", "Long Single Line"]) {
      const { item } = fieldItem(label)
      expect(
        within(item).queryByRole("button", { name: "Render Markdown" }),
      ).not.toBeInTheDocument()
      expect(item.querySelector("button")).toHaveAttribute("aria-hidden", "true")
    }
  })

  it("uses the Field Key rather than the Field Label for short candidates", () => {
    render(
      <ScrapeJobResult
        job={completeDetail({
          fields: [
            extractionField("summary_markdown", "Summary", 0),
            extractionField("notes", "Markdown Notes", 1),
          ],
          result: {
            summary_markdown: "Short candidate",
            notes: "Short plain value",
          },
        })}
      />,
    )

    expect(
      within(fieldItem("Summary").item).getByRole("button", {
        name: "Render Markdown",
      }),
    ).toBeInTheDocument()
    const labelMatchItem = fieldItem("Markdown Notes").item
    expect(
      within(labelMatchItem).queryByRole("button", {
        name: "Render Markdown",
      }),
    ).not.toBeInTheDocument()
    expect(labelMatchItem.querySelector("button")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
  })

  it("shows an optional Missing Value as Not found with only a placeholder action", () => {
    render(
      <ScrapeJobResult
        job={completeDetail({
          result: { client_name: "Acme", industry: null },
        })}
      />,
    )

    const { item, term: industry } = fieldItem("Industry")
    expect(industry.nextElementSibling).toHaveTextContent("Not found")
    expect(within(item).queryByRole("button")).not.toBeInTheDocument()

    const placeholder = item.querySelector("button")
    expect(placeholder).toBeInTheDocument()
    expect(placeholder).toHaveAttribute("aria-hidden", "true")
    expect(placeholder).toHaveAttribute("tabindex", "-1")
    expect(placeholder).toBeDisabled()
    expect(placeholder).toHaveClass("invisible")
  })

  it("keeps accessible candidate actions and inert placeholders structurally aligned", () => {
    render(
      <ScrapeJobResult
        job={completeDetail({
          fields: [
            extractionField("client_markdown", "Candidate", 0),
            extractionField("industry", "Plain", 1),
          ],
          result: {
            client_markdown: "Candidate value",
            industry: "Plain value",
          },
        })}
      />,
    )

    const candidateAction = fieldItem("Candidate").item.querySelector(
      '[data-slot="markdown-action"]',
    )
    const placeholderAction = fieldItem("Plain").item.querySelector(
      '[data-slot="markdown-action"]',
    )
    const candidateButton = within(candidateAction as HTMLElement).getByRole(
      "button",
      { name: "Render Markdown" },
    )
    const placeholderButton = placeholderAction?.querySelector("button")

    expect(candidateAction).toHaveClass("shrink-0")
    expect(placeholderAction).toHaveClass("shrink-0")
    expect(candidateButton).not.toBeDisabled()
    expect(candidateButton).not.toHaveAttribute("tabindex", "-1")
    expect(candidateButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
    expect(placeholderButton).toHaveAttribute("aria-hidden", "true")
    expect(placeholderButton).toHaveAttribute("tabindex", "-1")
  })

  it("keeps long labels, descriptions, and candidate raw text readable and exact", () => {
    const longLabel = "Industry Classification With A Very Long User Facing Name"
    const longDescription =
      "An intentionally long field description that remains readable on narrow layouts"
    const multilineValue = `${"First line with an intentionally long unbroken-value-for-responsive-layouts".padEnd(249, ".")}\r\nhttps://example.com/not-a-link`
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
