import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ScrapeJobFailure } from "@/components/scrape-runs/scrape-job-failure"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"
import { validScrapeJobDetail } from "@/tests/frontend/scrape-run-fixtures"

function failedDetail(
  replacement: Partial<ScrapeJobDetail> = {},
): ScrapeJobDetail {
  return {
    ...validScrapeJobDetail,
    status: "failed",
    finishedAt: "2026-04-01T10:04:00.000Z",
    ...replacement,
    result: null,
    fields: replacement.fields ?? validScrapeJobDetail.fields,
  }
}

describe("Scrape Job failure", () => {
  it.each([null, "", "   "])(
    "uses a safe generic explanation when retained diagnostics are %s",
    (failureMessage) => {
      render(<ScrapeJobFailure job={failedDetail({ failureMessage })} />)

      const alert = screen.getByRole("alert")
      expect(
        within(alert).getByRole("heading", { name: "Scrape Job failed" }),
      ).toBeInTheDocument()
      expect(alert).toHaveTextContent(
        "Extraction could not be completed for this page.",
      )
      expect(alert).not.toHaveTextContent("Failure code")
    },
  )

  it("shows sanitized diagnostics and labels missing Required Extraction Fields", () => {
    const failureMessage =
      "The required customer name was not found despite an unusually long diagnostic explanation."
    render(
      <ScrapeJobFailure
        job={failedDetail({
          failureCode: "missing_required_fields",
          failureMessage,
          missingRequiredFieldKeys: ["client_name"],
        })}
      />,
    )

    const alert = screen.getByRole("alert")
    expect(screen.getByText(failureMessage)).toHaveClass("wrap-anywhere")
    const failureCode = screen.getByText("missing_required_fields")
    expect(failureCode.closest("p")).toHaveClass("wrap-anywhere")
    expect(
      within(alert).getByRole("heading", {
        name: "Missing Required Extraction Fields",
      }),
    ).toBeInTheDocument()
    const missingField = within(alert).getByRole("listitem")
    expect(missingField).toHaveTextContent("Client Name")
    expect(missingField).toHaveClass("wrap-break-word")
    expect(alert).not.toHaveTextContent("client_name")
  })
})
