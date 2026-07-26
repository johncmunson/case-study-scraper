import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it } from "vitest"
import { toast } from "sonner"

import { ScrapeRunCardActions } from "@/components/scrape-runs/scrape-run-card-actions"
import { ScrapeRunsView } from "@/components/scrape-runs/scrape-runs-view"
import { Toaster } from "@/components/ui/sonner"
import type { ScrapeRunSummary } from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunSummary } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

const listUrl = "http://localhost/api/scrape-runs"
const detailUrl = `${listUrl}/17`

function summary(
  replacement: Partial<ScrapeRunSummary> = {},
): ScrapeRunSummary {
  return {
    ...validScrapeRunSummary,
    ...replacement,
    jobCounts: {
      ...validScrapeRunSummary.jobCounts,
      ...replacement.jobCounts,
    },
  }
}

function renderActions(run: ScrapeRunSummary) {
  return renderWithSwr(<ScrapeRunCardActions run={run} />)
}

async function openMenu() {
  const trigger = screen.getByRole("button", {
    name: "Actions for Customer stories",
  })
  await userEvent.click(trigger)
  return { trigger, menu: await screen.findByRole("menu") }
}

afterEach(() => {
  toast.dismiss()
})

describe("Scrape Run card actions", () => {
  it.each([
    ["pending", "Cancel"],
    ["in_progress", "Cancel"],
    ["complete", "Delete"],
    ["failed", "Delete"],
    ["cancelled", "Delete"],
  ] as const)("offers only %s's %s action", async (status, actionLabel) => {
    renderActions(summary({ status }))

    const { trigger, menu } = await openMenu()

    expect(trigger.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1)
    expect(
      within(menu).getByRole("menuitem", { name: actionLabel }),
    ).toHaveAttribute("data-variant", "destructive")
  })

  it("opens with Enter and Space, then Escape restores menu-trigger focus", async () => {
    renderActions(summary())
    const trigger = screen.getByRole("button", {
      name: "Actions for Customer stories",
    })

    trigger.focus()
    await userEvent.keyboard("{Enter}")
    expect(await screen.findByRole("menu")).toBeVisible()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await userEvent.keyboard(" ")
    expect(await screen.findByRole("menu")).toBeVisible()
  })

  it("keeps ordinary Cancel behavior for a Run displayed as Cancelling", async () => {
    renderActions(
      summary({
        status: "in_progress",
        cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      }),
    )

    const { menu } = await openMenu()

    expect(within(menu).getByRole("menuitem", { name: "Cancel" })).toBeVisible()
    expect(screen.queryByText("Retry cancellation")).not.toBeInTheDocument()
    expect(screen.queryByText("Delete")).not.toBeInTheDocument()
  })

  it("keeps the selected action stable when polling changes the Run status", async () => {
    const view = renderActions(summary({ status: "pending" }))
    const { menu } = await openMenu()
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Cancel" }),
    )
    await screen.findByRole("alertdialog", { name: "Cancel Scrape Run?" })

    view.rerender(
      <ScrapeRunCardActions run={summary({ status: "complete" })} />,
    )

    expect(
      screen.getByRole("alertdialog", { name: "Cancel Scrape Run?" }),
    ).toBeVisible()
    expect(
      screen.queryByRole("alertdialog", { name: "Delete Scrape Run?" }),
    ).not.toBeInTheDocument()
  })

  it("opens an identified Cancel confirmation and restores trigger focus", async () => {
    renderActions(summary())
    const { trigger, menu } = await openMenu()

    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Cancel" }),
    )

    const dialog = await screen.findByRole("alertdialog", {
      name: "Cancel Scrape Run?",
    })
    expect(dialog).toHaveAccessibleDescription(
      "Unfinished work for “Customer stories” will stop, while Scrape Jobs that already finished will retain their outcomes.",
    )
    const neutral = within(dialog).getByRole("button", {
      name: "Keep running",
    })
    await waitFor(() => expect(neutral).toHaveFocus())

    await userEvent.click(neutral)

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("cancels once, projects the confirmed status, toasts, and revalidates", async () => {
    let getCount = 0
    let postCount = 0
    server.use(
      http.get(listUrl, () => {
        getCount += 1
        return HttpResponse.json([
          summary({ status: getCount === 1 ? "pending" : "cancelled" }),
        ])
      }),
      http.post(`${detailUrl}/cancel`, () => {
        postCount += 1
        return HttpResponse.json(
          { id: 17, status: "cancelled" },
          { status: 202 },
        )
      }),
    )
    renderWithSwr(
      <>
        <ScrapeRunsView />
        <Toaster />
      </>,
    )

    await screen.findByLabelText("Status: Pending")
    const { menu } = await openMenu()
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Cancel" }),
    )
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel Scrape Run" }),
    )

    expect(await screen.findByLabelText("Status: Cancelled")).toBeVisible()
    expect(await screen.findByText("Scrape Run cancelled")).toBeVisible()
    expect(postCount).toBe(1)
    await waitFor(() => expect(getCount).toBeGreaterThan(1))
  })

  it("retains a card and blocks duplicate dismissal while deletion is pending", async () => {
    let deleted = false
    let deleteCount = 0
    let releaseDeletion: (() => void) | undefined
    const deletionGate = new Promise<void>((resolve) => {
      releaseDeletion = resolve
    })
    server.use(
      http.get(listUrl, () =>
        HttpResponse.json(deleted ? [] : [summary({ status: "complete" })]),
      ),
      http.delete(detailUrl, async () => {
        deleteCount += 1
        await deletionGate
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderWithSwr(
      <>
        <ScrapeRunsView />
        <Toaster />
      </>,
    )

    await screen.findByLabelText("Status: Complete")
    const { trigger, menu } = await openMenu()
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Delete" }),
    )
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete Scrape Run?",
    })
    expect(dialog).toHaveAccessibleDescription(
      "The Scrape Run “Customer stories” and its associated configuration, stages, Scrape Jobs, results, and datasets will be permanently removed. This action cannot be undone.",
    )
    const confirmation = within(dialog).getByRole("button", {
      name: "Delete Scrape Run",
    })
    fireEvent.click(confirmation)
    fireEvent.click(confirmation)

    expect(
      screen.getByText("Customer stories", { selector: "h2" }),
    ).toBeInTheDocument()
    expect(trigger).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: "Keep Scrape Run" }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole("button", { name: "Deleting…" }),
    ).toBeDisabled()
    await userEvent.keyboard("{Escape}{Enter}")
    expect(screen.getByRole("alertdialog")).toBeVisible()
    expect(deleteCount).toBe(1)

    releaseDeletion?.()

    expect(await screen.findByText("No scrape runs yet")).toBeVisible()
    expect(await screen.findByText("Scrape Run deleted")).toBeVisible()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("closes on a safe deletion conflict, retains the card, warns, and revalidates", async () => {
    let getCount = 0
    server.use(
      http.get(listUrl, () => {
        getCount += 1
        return HttpResponse.json([summary({ status: "complete" })])
      }),
      http.delete(detailUrl, () =>
        HttpResponse.json(
          { error: "An active scrape run cannot be deleted." },
          { status: 409 },
        ),
      ),
    )
    renderWithSwr(
      <>
        <ScrapeRunsView />
        <Toaster />
      </>,
    )

    await screen.findByLabelText("Status: Complete")
    const { menu } = await openMenu()
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Delete" }),
    )
    await userEvent.click(
      await screen.findByRole("button", { name: "Delete Scrape Run" }),
    )

    expect(
      await screen.findByText("Error: An active scrape run cannot be deleted."),
    ).toBeVisible()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    expect(
      screen.getByRole("heading", { name: "Customer stories" }),
    ).toBeVisible()
    await waitFor(() => expect(getCount).toBeGreaterThan(1))
  })
})
