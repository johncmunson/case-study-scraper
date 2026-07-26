import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
      within(result).queryByRole("heading", { name: "Extraction Result" }),
    ).not.toBeInTheDocument()
    expect(result.querySelector('[data-slot="card"]')).not.toBeInTheDocument()
    expect(result.querySelector("dl")).toHaveClass("space-y-6")
    expect(result.querySelector("dl")?.children).toHaveLength(2)

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
    expect(clientNameLabel).toHaveClass("text-base")
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

  it("qualifies only multiline values longer than 350 characters by content", () => {
    const values = {
      line_feed: `${"a".repeat(349)}\nb`,
      carriage_return: `${"a".repeat(349)}\rb`,
      crlf: `${"a".repeat(348)}\r\nb`,
      exact_boundary: `${"a".repeat(348)}\nb`,
      long_single_line: "a".repeat(351),
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
          name: "Show raw text",
        }),
      ).toBeInTheDocument()
    }

    for (const label of ["Exact Boundary", "Long Single Line"]) {
      const { item } = fieldItem(label)
      expect(
        within(item).queryByRole("button", { name: "Show raw text" }),
      ).not.toBeInTheDocument()
      expect(item.querySelector("button")).toHaveAttribute(
        "aria-hidden",
        "true",
      )
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
        name: "Show raw text",
      }),
    ).toBeInTheDocument()
    const labelMatchItem = fieldItem("Markdown Notes").item
    expect(
      within(labelMatchItem).queryByRole("button", {
        name: "Show raw text",
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
      { name: "Show raw text" },
    )
    const placeholderButton = placeholderAction?.querySelector("button")

    const candidateBadges = within(fieldItem("Candidate").term).getByText(
      "Primary Identifier",
    ).parentElement
    const candidateDescription = within(fieldItem("Candidate").term).getByText(
      "Description for Candidate",
    )

    expect(candidateAction).toHaveClass("shrink-0")
    expect(placeholderAction).toHaveClass("shrink-0")
    expect(candidateAction?.parentElement).toBe(candidateBadges)
    expect(candidateAction?.previousElementSibling).toHaveTextContent(
      "Primary Identifier",
    )
    expect(candidateBadges).toHaveClass("mt-2", "items-center")
    expect(candidateDescription).toHaveClass("mt-2")
    expect(candidateButton).not.toBeDisabled()
    expect(candidateButton).not.toHaveAttribute("tabindex", "-1")
    expect(candidateButton.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
    expect(placeholderButton).toHaveAttribute("aria-hidden", "true")
    expect(placeholderButton).toHaveAttribute("tabindex", "-1")
  })

  it("renders Markdown Candidates by default and toggles exact raw text independently", async () => {
    const user = userEvent.setup()
    const firstValue = "# Customer story\r\n\r\nThis is **important**."
    const secondValue = "# Second story\n\nStill rendered."

    render(
      <ScrapeJobResult
        job={completeDetail({
          fields: [
            extractionField("first_markdown", "First", 0),
            extractionField("second_markdown", "Second", 1),
          ],
          result: {
            first_markdown: firstValue,
            second_markdown: secondValue,
          },
        })}
      />,
    )

    const firstDefinition = fieldItem("First").term.nextElementSibling
    const secondDefinition = fieldItem("Second").term.nextElementSibling
    const showFirstRawButton = within(fieldItem("First").item).getByRole(
      "button",
      { name: "Show raw text" },
    )

    expect(
      within(firstDefinition as HTMLElement).getByRole("heading", {
        level: 3,
        name: "Customer story",
      }),
    ).toBeInTheDocument()
    expect(
      within(secondDefinition as HTMLElement).getByRole("heading", {
        level: 3,
        name: "Second story",
      }),
    ).toBeInTheDocument()
    expect(
      within(firstDefinition as HTMLElement).getByText("important").tagName,
    ).toBe("STRONG")
    expect(showFirstRawButton).toHaveClass("bg-secondary")
    expect(showFirstRawButton.querySelector("svg")).toHaveClass(
      "lucide-code-xml",
    )

    await user.click(showFirstRawButton)

    expect(firstDefinition?.textContent).toBe(firstValue)
    expect(
      within(firstDefinition as HTMLElement).queryByRole("heading"),
    ).not.toBeInTheDocument()
    const renderFirstButton = within(fieldItem("First").item).getByRole(
      "button",
      { name: "Render Markdown" },
    )
    expect(renderFirstButton).toHaveClass("bg-background")
    expect(renderFirstButton.querySelector("svg")).toHaveClass("lucide-eye")
    expect(
      within(fieldItem("Second").item).getByRole("button", {
        name: "Show raw text",
      }),
    ).toBeInTheDocument()
    expect(
      within(secondDefinition as HTMLElement).getByRole("heading", {
        name: "Second story",
      }),
    ).toBeInTheDocument()

    await user.click(renderFirstButton)

    expect(
      within(firstDefinition as HTMLElement).getByRole("heading", {
        name: "Customer story",
      }),
    ).toBeInTheDocument()
  })

  it("resolves safe links against the Canonical Page URL with protocol-specific behavior", () => {
    const markdown = [
      "[Relative](related?view=full#results)",
      "[Secure](https://docs.example.org/guide)",
      "[Email](mailto:researcher@example.com)",
      "[Unsafe](javascript:alert(1))",
    ].join(" ")

    render(
      <ScrapeJobResult
        job={completeDetail({
          fields: [extractionField("links_markdown", "Links", 0)],
          result: { links_markdown: markdown },
        })}
      />,
    )

    expect(screen.getByRole("link", { name: "Relative" })).toHaveAttribute(
      "href",
      "https://www.example.com/customers/related?view=full#results",
    )
    for (const name of ["Relative", "Secure"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute(
        "target",
        "_blank",
      )
      expect(screen.getByRole("link", { name })).toHaveAttribute(
        "rel",
        "noopener noreferrer",
      )
    }

    const email = screen.getByRole("link", { name: "Email" })
    expect(email).toHaveAttribute("href", "mailto:researcher@example.com")
    expect(email).not.toHaveAttribute("target")
    expect(email).not.toHaveAttribute("rel")

    const unsafe = screen.getByText("Unsafe").closest("a")
    expect(unsafe).toBeInTheDocument()
    expect(unsafe).not.toHaveAttribute("href")
  })

  it("renders image alt text with only safe source links and keeps embedded HTML inert", () => {
    const markdown = [
      "![Architecture diagram](assets/diagram.png)",
      "",
      "![Unsafe image](javascript:alert(1))",
      "",
      '<div data-live="yes">Embedded **HTML**</div>',
    ].join("\n")

    const { container } = render(
      <ScrapeJobResult
        job={completeDetail({
          fields: [extractionField("media_markdown", "Media", 0)],
          result: { media_markdown: markdown },
        })}
      />,
    )

    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(screen.getByText("Architecture diagram")).toBeInTheDocument()
    const source = screen.getByRole("link", {
      name: "https://www.example.com/customers/assets/diagram.png",
    })
    expect(source).toHaveAttribute(
      "href",
      "https://www.example.com/customers/assets/diagram.png",
    )
    expect(source).toHaveAttribute("target", "_blank")
    expect(source).toHaveAttribute("rel", "noopener noreferrer")

    expect(screen.getByText("Unsafe image")).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /javascript/i }),
    ).not.toBeInTheDocument()
    expect(container.querySelector('[data-live="yes"]')).not.toBeInTheDocument()
    expect(container.querySelector("script")).not.toBeInTheDocument()
    expect(screen.getByText(/<div data-live="yes">/)).toBeInTheDocument()
  })

  it("renders compact CommonMark prose and code with remapped headings and bounded overflow", () => {
    const markdown = [
      "## Secondary heading",
      "",
      "### Tertiary heading",
      "",
      "#### Quaternary heading",
      "",
      "##### Quinary heading",
      "",
      "###### Senary heading",
      "",
      "Paragraph with *emphasis*, `inline code`, and a",
      "single newline.",
      "",
      "- First item",
      "- Second item",
      "",
      "1. First step",
      "2. Second step",
      "",
      "> A compact quote",
      "",
      "---",
      "",
      "```ts",
      "const unbroken = 'abcdefghijklmnopqrstuvwxyz';",
      "  preserve indentation",
      "```",
    ].join("\n")

    render(
      <ScrapeJobResult
        job={completeDetail({
          fields: [extractionField("summary_markdown", "Summary", 0)],
          result: { summary_markdown: markdown },
        })}
      />,
    )

    const definition = fieldItem("Summary").term
      .nextElementSibling as HTMLElement
    expect(
      within(definition).getByRole("heading", {
        level: 4,
        name: "Secondary heading",
      }),
    ).toHaveClass("wrap-anywhere")
    expect(
      within(definition).getByRole("heading", {
        level: 5,
        name: "Tertiary heading",
      }),
    ).toBeInTheDocument()
    for (const name of [
      "Quaternary heading",
      "Quinary heading",
      "Senary heading",
    ]) {
      expect(
        within(definition).getByRole("heading", { level: 6, name }),
      ).toBeInTheDocument()
    }

    const paragraph = within(definition)
      .getByText(/Paragraph with/)
      .closest("p")
    expect(paragraph).toHaveClass("wrap-anywhere")
    expect(paragraph?.querySelector("em")).toHaveTextContent("emphasis")
    expect(paragraph?.querySelector("code")).toHaveClass("wrap-anywhere")
    expect(paragraph?.querySelector("br")).not.toBeInTheDocument()

    expect(definition.querySelector("ul")).toHaveClass("list-disc")
    expect(definition.querySelector("ol")).toHaveClass("list-decimal")
    expect(definition.querySelector("blockquote")).toHaveClass("border-l-2")
    expect(definition.querySelector("hr")).toHaveClass("border-border")

    const fencedCode = definition.querySelector("pre")
    expect(fencedCode).toHaveClass("max-w-full", "overflow-x-auto")
    expect(fencedCode?.querySelector("code")).toHaveClass("language-ts")
    expect(fencedCode?.querySelector("code")?.textContent).toBe(
      "const unbroken = 'abcdefghijklmnopqrstuvwxyz';\n  preserve indentation\n",
    )
  })

  it("keeps long labels, descriptions, and candidate raw text readable and exact", async () => {
    const user = userEvent.setup()
    const longLabel =
      "Industry Classification With A Very Long User Facing Name"
    const longDescription =
      "An intentionally long field description that remains readable on narrow layouts"
    const multilineValue = `${"First line with an intentionally long unbroken-value-for-responsive-layouts".padEnd(349, ".")}\r\nhttps://example.com/not-a-link`
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

    await user.click(
      within(fieldItem(longLabel).item).getByRole("button", {
        name: "Show raw text",
      }),
    )

    const value = screen.getByText(/First line with an intentionally long/)
    expect(value).toHaveTextContent(/First line.*not-a-link/)
    expect(value.textContent).toBe(multilineValue)
    expect(value).toHaveClass(
      "wrap-anywhere",
      "whitespace-pre-wrap",
      "select-text",
    )
    expect(within(value).queryByRole("link")).not.toBeInTheDocument()
  })
})
