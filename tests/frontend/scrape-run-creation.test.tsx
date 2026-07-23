import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { delay, http, HttpResponse } from "msw"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ScrapeRunsView } from "@/components/scrape-runs/scrape-runs-view"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ScrapeRunSummary } from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunSummary } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

const apiUrl = "http://localhost/api/scrape-runs"

afterEach(() => {
  toast.dismiss()
  vi.useRealTimers()
})

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

const createdSummary = summary({
  id: 23,
  name: "New customer stories",
  status: "pending",
  cancellationRequestedAt: null,
  jobCounts: {
    total: 0,
    pending: 0,
    inProgress: 0,
    complete: 0,
    failed: 0,
    cancelled: 0,
  },
  createdAt: "2026-04-02T10:00:00.000Z",
  startedAt: null,
  finishedAt: null,
})

function renderView() {
  return renderWithSwr(
    <TooltipProvider>
      <ScrapeRunsView />
      <Toaster />
    </TooltipProvider>,
  )
}

async function openAndFillForm() {
  const user = userEvent.setup()

  await user.click(
    screen.getByRole("button", { name: "Create New Scrape Run" }),
  )
  await user.type(screen.getByLabelText("Name"), "New customer stories")
  await user.type(
    screen.getByLabelText("URL"),
    "https://www.example.com/case-studies",
  )
  await user.type(
    screen.getByLabelText("Example URL 1"),
    "https://www.example.com/story/one",
  )
  await user.type(
    screen.getByLabelText("Example URL 2"),
    "https://www.example.com/story/two",
  )
  await user.type(screen.getByLabelText("Label"), "Company Name")
  await user.type(
    screen.getByLabelText("Description"),
    "Customer company name",
  )

  return user
}

describe("Scrape Run creation", () => {
  it.each([
    ["pending", summary({ status: "pending" })],
    ["in-progress", summary({ status: "in_progress" })],
    [
      "cancelling",
      summary({
        status: "in_progress",
        cancellationRequestedAt: "2026-04-01T10:05:00.000Z",
      }),
    ],
  ])(
    "disables creation with a keyboard-discoverable tooltip for a %s run",
    async (_state, activeRun) => {
      server.use(http.get(apiUrl, () => HttpResponse.json([activeRun])))

      renderView()

      const trigger = await screen.findByRole("button", {
        name: "Create New Scrape Run",
      })
      expect(trigger).toBeDisabled()
      const tooltipTarget = trigger.parentElement
      expect(tooltipTarget).toHaveAttribute("tabindex", "0")

      const user = userEvent.setup()
      await user.tab()
      expect(tooltipTarget).toHaveFocus()
      expect(
        await screen.findByText("Only one Scrape Run may be active at a time."),
      ).toBeInTheDocument()

      fireEvent.click(trigger)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    },
  )

  it("keeps an open form intact when revalidation discovers an active run", async () => {
    let getCount = 0
    const activeRun = summary({ id: 51, name: "Discovered active run" })
    server.use(
      http.get(apiUrl, () => {
        getCount += 1
        return HttpResponse.json(getCount === 1 ? [] : [activeRun])
      }),
    )

    renderView()
    await screen.findByText("No scrape runs yet")
    await openAndFillForm()

    window.dispatchEvent(new Event("online"))

    expect(
      await screen.findByText(/Another Scrape Run is active/),
    ).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("New customer stories")
    expect(
      screen.getByRole("button", { name: "Create Scrape Run" }),
    ).toBeDisabled()
    expect(getCount).toBe(2)
  })

  it("keeps every dismissal path and form control disabled while creation is pending", async () => {
    server.use(
      http.get(apiUrl, () => HttpResponse.json([])),
      http.post(apiUrl, async () => {
        await delay("infinite")
        return HttpResponse.json(createdSummary, { status: 201 })
      }),
    )

    renderView()
    await screen.findByText("No scrape runs yet")

    const user = await openAndFillForm()
    await user.click(screen.getByRole("button", { name: "Create Scrape Run" }))

    const dialog = screen.getByRole("dialog")
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Creating…/ }),
      ).toBeDisabled()
    })
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled()
    expect(screen.getByLabelText("Name")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add URL" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Add Field" })).toBeDisabled()
    expect(
      screen.getByRole("radio", { name: "Primary Identifier?" }),
    ).toHaveAttribute("aria-disabled", "true")

    await user.keyboard("{Escape}")
    expect(dialog).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", {
        name: "Create New Scrape Run",
        hidden: true,
      }),
    )
    expect(dialog).toBeInTheDocument()

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).not.toBeNull()
    fireEvent.pointerDown(overlay as Element)
    fireEvent.click(overlay as Element)
    expect(dialog).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    expect(dialog).toBeInTheDocument()
  })

  it.each([
    {
      kind: "validation",
      response: () =>
        HttpResponse.json({ error: "Check the Run Configuration." }, { status: 400 }),
      warning: "Error: Check the Run Configuration.",
    },
    {
      kind: "network",
      response: () => HttpResponse.error(),
      warning: "Error: Unable to create the scrape run.",
    },
  ])(
    "preserves form values without retrying or revalidating after a $kind failure",
    async ({ response, warning }) => {
      let getCount = 0
      let postCount = 0
      server.use(
        http.get(apiUrl, () => {
          getCount += 1
          return HttpResponse.json([])
        }),
        http.post(apiUrl, () => {
          postCount += 1
          return response()
        }),
      )

      renderView()
      await screen.findByText("No scrape runs yet")
      const user = await openAndFillForm()
      await user.click(screen.getByRole("button", { name: "Create Scrape Run" }))

      expect(await screen.findByText(warning)).toBeInTheDocument()
      expect(screen.getByRole("dialog")).toBeInTheDocument()
      expect(screen.getByLabelText("Name")).toHaveValue(
        "New customer stories",
      )
      expect(
        screen.getByRole("button", { name: "Create Scrape Run" }),
      ).toBeEnabled()

      await delay(25)
      expect(postCount).toBe(1)
      expect(getCount).toBe(1)
    },
  )

  it("revalidates after a conflict and preserves the open form while an active run is discovered", async () => {
    let getCount = 0
    const activeRun = summary({ id: 31, name: "Created in another tab" })
    server.use(
      http.get(apiUrl, () => {
        getCount += 1
        return HttpResponse.json(getCount === 1 ? [] : [activeRun])
      }),
      http.post(apiUrl, () =>
        HttpResponse.json(
          { error: "Another run is active." },
          { status: 409 },
        ),
      ),
    )

    renderView()
    await screen.findByText("No scrape runs yet")
    const user = await openAndFillForm()
    await user.click(screen.getByRole("button", { name: "Create Scrape Run" }))

    expect(await screen.findByText("Error: Another run is active.")).toBeInTheDocument()
    expect(
      await screen.findByText(/Another Scrape Run is active/),
    ).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("New customer stories")
    expect(
      screen.getByRole("button", { name: "Create Scrape Run" }),
    ).toBeDisabled()
    expect(getCount).toBe(2)
  })

  it("revalidates a persisted-run service failure and reveals the failed summary", async () => {
    let getCount = 0
    const failedRun = summary({
      id: 41,
      name: "Persisted dispatch failure",
      status: "failed",
      jobCounts: {
        total: 0,
        pending: 0,
        inProgress: 0,
        complete: 0,
        failed: 0,
        cancelled: 0,
      },
      startedAt: null,
      finishedAt: "2026-04-02T10:01:00.000Z",
    })
    server.use(
      http.get(apiUrl, () => {
        getCount += 1
        return HttpResponse.json(getCount === 1 ? [] : [failedRun])
      }),
      http.post(apiUrl, () =>
        HttpResponse.json(
          { error: "Dispatch failed.", scrapeRunId: failedRun.id },
          { status: 503 },
        ),
      ),
    )

    renderView()
    await screen.findByText("No scrape runs yet")
    const user = await openAndFillForm()
    await user.click(screen.getByRole("button", { name: "Create Scrape Run" }))

    expect(await screen.findByText("Error: Dispatch failed.")).toBeInTheDocument()
    await waitFor(() => expect(getCount).toBe(2))
    expect(
      screen.getByRole("heading", {
        name: "Persisted dispatch failure",
        hidden: true,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("New customer stories")
  })

  it("rejects malformed success JSON without closing or polluting the cache", async () => {
    let getCount = 0
    server.use(
      http.get(apiUrl, () => {
        getCount += 1
        return HttpResponse.json([])
      }),
      http.post(apiUrl, () =>
        HttpResponse.json({ id: "not-a-summary" }, { status: 201 }),
      ),
    )

    renderView()
    await screen.findByText("No scrape runs yet")
    const user = await openAndFillForm()
    await user.click(screen.getByRole("button", { name: "Create Scrape Run" }))

    expect(
      await screen.findByText("Error: The server returned an invalid response."),
    ).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText("Name")).toHaveValue("New customer stories")
    expect(
      screen.queryByRole("list", { name: "Scrape runs", hidden: true }),
    ).not.toBeInTheDocument()
    expect(getCount).toBe(1)
  })

  it("polls after cache insertion and resets the form after the run becomes terminal", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let getCount = 0
    const terminalSummary = summary({
      ...createdSummary,
      status: "complete",
      jobCounts: {
        total: 2,
        pending: 0,
        inProgress: 0,
        complete: 2,
        failed: 0,
        cancelled: 0,
      },
      startedAt: "2026-04-02T10:00:10.000Z",
      finishedAt: "2026-04-02T10:01:00.000Z",
    })
    server.use(
      http.get(apiUrl, () => {
        getCount += 1
        return HttpResponse.json(getCount === 1 ? [] : [terminalSummary])
      }),
      http.post(apiUrl, () =>
        HttpResponse.json(createdSummary, { status: 201 }),
      ),
    )

    renderView()
    await screen.findByText("No scrape runs yet")
    const user = await openAndFillForm()
    await user.click(screen.getByRole("button", { name: "Create Scrape Run" }))

    expect(await screen.findByText("Pending")).toBeInTheDocument()
    expect(getCount).toBe(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(await screen.findByText("Complete")).toBeInTheDocument()
    expect(getCount).toBe(2)

    await user.click(
      screen.getByRole("button", { name: "Create New Scrape Run" }),
    )
    expect(screen.getByLabelText("Name")).toHaveValue("")
    expect(screen.getByLabelText("Example URL 1")).toHaveValue("")
  })

  it("submits the raw input and prepends the validated response without an immediate GET", async () => {
    let getCount = 0
    let postedBody: unknown

    server.use(
      http.get(apiUrl, () => {
        getCount += 1
        return HttpResponse.json([
          summary({
            id: createdSummary.id,
            name: "Stale duplicate",
            status: "complete",
            finishedAt: "2026-04-01T11:00:00.000Z",
          }),
          summary({
            id: 17,
            status: "complete",
            finishedAt: "2026-04-01T10:10:00.000Z",
          }),
        ])
      }),
      http.post(apiUrl, async ({ request }) => {
        postedBody = await request.json()
        return HttpResponse.json(createdSummary, { status: 201 })
      }),
    )

    renderView()

    expect(
      await screen.findByRole("heading", { name: "Stale duplicate" }),
    ).toBeInTheDocument()

    const user = await openAndFillForm()
    await user.click(screen.getByRole("button", { name: "Create Scrape Run" }))

    expect(postedBody).toEqual({
      name: "New customer stories",
      url: "https://www.example.com/case-studies",
      exampleUrls: [
        "https://www.example.com/story/one",
        "https://www.example.com/story/two",
      ],
      fields: [
        {
          label: "Company Name",
          description: "Customer company name",
          required: true,
          primaryIdentifier: true,
        },
      ],
    })
    expect(
      await screen.findByRole("heading", { name: "New customer stories" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("heading", { name: "Stale duplicate" }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(await screen.findByText("New scrape run created")).toBeInTheDocument()

    await delay(50)
    expect(getCount).toBe(1)
    expect(
      screen.getAllByRole("heading").map((heading) => heading.textContent),
    ).toEqual(["New customer stories", "Customer stories"])
  })
})
