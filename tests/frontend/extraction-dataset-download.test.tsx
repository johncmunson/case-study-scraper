import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { http, HttpResponse, delay } from "msw"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"

import { ScrapeJobSummaryTable } from "@/components/scrape-runs/scrape-job-summary-table"
import { ScrapeRunDetailView } from "@/components/scrape-runs/scrape-run-detail-view"
import { Toaster } from "@/components/ui/sonner"
import type {
  ScrapeJobSummary,
  ScrapeRunDetail,
} from "@/lib/scrape-runs/api-contracts"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunDetail } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a data-prefetch={String(prefetch)} {...props} />
  ),
}))

const datasetApiUrl =
  "http://localhost/api/scrape-runs/17/extraction-dataset"

function job(id: number): ScrapeJobSummary {
  return {
    id,
    url: `https://www.example.com/customers/customer-${id}`,
    status: "complete",
    primaryIdentifier: `Customer ${id}`,
    failureCode: null,
    attemptCount: 1,
    createdAt: "2026-04-01T10:02:00.000Z",
    updatedAt: "2026-04-01T10:03:00.000Z",
    startedAt: "2026-04-01T10:02:10.000Z",
    finishedAt: "2026-04-01T10:03:00.000Z",
  }
}

type RunReplacement = Omit<Partial<ScrapeRunDetail>, "jobCounts"> & {
  jobCounts?: Partial<ScrapeRunDetail["jobCounts"]>
}

function run(replacement: RunReplacement = {}): ScrapeRunDetail {
  const jobs = replacement.jobs ?? validScrapeRunDetail.jobs
  const counts = {
    total: jobs.length,
    pending: jobs.filter(({ status }) => status === "pending").length,
    inProgress: jobs.filter(({ status }) => status === "in_progress").length,
    complete: jobs.filter(({ status }) => status === "complete").length,
    failed: jobs.filter(({ status }) => status === "failed").length,
    cancelled: jobs.filter(({ status }) => status === "cancelled").length,
  }

  return {
    ...validScrapeRunDetail,
    status: "complete",
    finishedAt: "2026-04-01T10:10:00.000Z",
    ...replacement,
    jobs,
    jobCounts: {
      ...counts,
      ...replacement.jobCounts,
    },
  }
}

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "createObjectURL",
)
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(
  URL,
  "revokeObjectURL",
)

function installBrowserDownloadSpies() {
  const createObjectURL = vi.fn(() => "blob:extraction-dataset")
  const revokeObjectURL = vi.fn()

  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  })
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined)

  return {
    click,
    createObjectURL,
    revokeObjectURL,
    getClickedAnchor: () =>
      click.mock.contexts.at(-1) as HTMLAnchorElement | undefined,
  }
}

function restoreUrlMethod(
  name: "createObjectURL" | "revokeObjectURL",
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(URL, name, descriptor)
    return
  }

  Reflect.deleteProperty(URL, name)
}

function renderTable(detail: ScrapeRunDetail) {
  return render(
    <>
      <ScrapeJobSummaryTable run={detail} />
      <Toaster />
    </>,
  )
}

async function chooseFormat(format: "CSV" | "JSON") {
  const user = userEvent.setup()
  await user.click(screen.getByRole("button", { name: "Download dataset" }))
  await user.click(await screen.findByRole("menuitem", { name: `Download ${format}` }))
}

afterEach(() => {
  toast.dismiss()
  vi.restoreAllMocks()
  restoreUrlMethod("createObjectURL", originalCreateObjectUrl)
  restoreUrlMethod("revokeObjectURL", originalRevokeObjectUrl)
})

describe("Extraction Dataset download", () => {
  it.each([
    {
      state: "an Active Run with a successful Job",
      detail: run({ status: "in_progress", finishedAt: null }),
      explanation: "Available when this Scrape Run finishes.",
    },
    {
      state: "a terminal Run without successful Jobs",
      detail: run({
        status: "failed",
        jobs: [],
        jobCounts: { complete: 0 },
      }),
      explanation: "No successful results to download.",
    },
  ])("keeps the control discoverable for $state", async ({ detail, explanation }) => {
    renderTable(detail)

    const button = screen.getByRole("button", { name: "Download dataset" })
    expect(button).toBeDisabled()

    const tooltipTrigger = button.parentElement
    expect(tooltipTrigger).toHaveAttribute("tabindex", "0")
    tooltipTrigger?.focus()
    expect(await screen.findByRole("tooltip")).toHaveTextContent(explanation)
  })

  it.each(["complete", "failed", "cancelled"] as const)(
    "enables the control for an eligible %s Run",
    (status) => {
      renderTable(run({ status }))

      expect(
        screen.getByRole("button", { name: "Download dataset" }),
      ).toBeEnabled()
    },
  )

  it("places a keyboard-operable format menu in the Scrape Jobs card action", async () => {
    renderTable(run({ jobs: [job(1), job(2), job(3)] }))

    const heading = screen.getByRole("heading", { name: "Scrape Jobs" })
    const cardHeader = heading.closest('[data-slot="card-header"]')
    const cardAction = cardHeader?.querySelector('[data-slot="card-action"]')
    const trigger = screen.getByRole("button", { name: "Download dataset" })

    expect(cardAction).toContainElement(trigger)
    trigger.focus()
    await userEvent.keyboard("{Enter}")

    const menu = await screen.findByRole("menu")
    expect(within(menu).getByRole("menuitem", { name: "Download CSV" })).toBeInTheDocument()
    expect(within(menu).getByRole("menuitem", { name: "Download JSON" })).toBeInTheDocument()
    expect(menu).toHaveTextContent(
      "Includes all 3 successful results. Failed and cancelled jobs are excluded.",
    )
  })

  it.each([
    ["CSV", "csv", "text/csv", "customer-stories-17.csv"],
    ["JSON", "json", "application/json", "customer-stories-17.json"],
  ] as const)(
    "downloads the %s response Blob with the shared safe filename",
    async (label, format, contentType, filename) => {
      let requestedUrl: URL | undefined
      const browserDownload = installBrowserDownloadSpies()
      server.use(
        http.get(
          datasetApiUrl,
          ({ request }) => {
            requestedUrl = new URL(request.url)
            return new HttpResponse(`dataset-${format}`, {
              headers: { "Content-Type": contentType },
            })
          },
        ),
      )

      const { container } = renderTable(run())
      await chooseFormat(label)

      await waitFor(() => expect(browserDownload.click).toHaveBeenCalledOnce())
      expect(requestedUrl?.searchParams.get("format")).toBe(format)
      expect([...requestedUrl!.searchParams.keys()]).toEqual(["format"])
      expect(browserDownload.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(browserDownload.getClickedAnchor()).toMatchObject({
        href: "blob:extraction-dataset",
        download: filename,
      })
      expect(browserDownload.getClickedAnchor()?.isConnected).toBe(false)
      expect(browserDownload.revokeObjectURL).toHaveBeenCalledWith(
        "blob:extraction-dataset",
      )
      expect(
        screen.getByRole("button", { name: "Download dataset" }),
      ).toBeEnabled()
      expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0)
    },
  )

  it("shows one shared preparing state and prevents duplicate requests", async () => {
    let resolveRequest: (() => void) | undefined
    const requestGate = new Promise<void>((resolve) => {
      resolveRequest = resolve
    })
    let requestCount = 0
    installBrowserDownloadSpies()
    server.use(
      http.get(
        datasetApiUrl,
        async () => {
          requestCount += 1
          await requestGate
          return new HttpResponse("dataset")
        },
      ),
    )

    renderTable(run())
    await chooseFormat("CSV")

    const preparingButton = await screen.findByRole("button", {
      name: "Preparing download…",
    })
    expect(preparingButton).toBeDisabled()
    expect(
      preparingButton.querySelector('[data-slot="spinner"]'),
    ).toBeInTheDocument()
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    fireEvent.click(preparingButton)
    fireEvent.click(preparingButton)
    expect(requestCount).toBe(1)

    resolveRequest?.()
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Download dataset" }),
      ).toBeEnabled(),
    )
    expect(requestCount).toBe(1)
  })

  it.each([
    {
      kind: "HTTP",
      response: () =>
        HttpResponse.json({ error: "Dataset is not available." }, { status: 409 }),
      warning: "Error: Dataset is not available.",
    },
    {
      kind: "network",
      response: () => HttpResponse.error(),
      warning: "Error: Unable to download the extraction dataset.",
    },
    {
      kind: "malformed API",
      response: () => new HttpResponse("private diagnostic", { status: 500 }),
      warning: "Error: Request failed with status 500.",
    },
  ])(
    "restores the control without retrying after a $kind failure",
    async ({ response, warning }) => {
      let requestCount = 0
      const browserDownload = installBrowserDownloadSpies()
      server.use(
        http.get(
          datasetApiUrl,
          () => {
            requestCount += 1
            return response()
          },
        ),
      )

      renderTable(run())
      await chooseFormat("JSON")

      expect(await screen.findByText(warning)).toBeInTheDocument()
      expect(screen.queryByText("private diagnostic")).not.toBeInTheDocument()
      expect(screen.getAllByText(warning)).toHaveLength(1)
      expect(
        screen.getByRole("button", { name: "Download dataset" }),
      ).toBeEnabled()
      expect(browserDownload.createObjectURL).not.toHaveBeenCalled()
      expect(browserDownload.click).not.toHaveBeenCalled()
      await delay(25)
      expect(requestCount).toBe(1)
    },
  )

  it("cleans up and warns safely when reading the response Blob fails", async () => {
    const browserDownload = installBrowserDownloadSpies()
    vi.spyOn(Response.prototype, "blob").mockRejectedValueOnce(
      new Error("private Blob failure"),
    )
    server.use(
      http.get(
        datasetApiUrl,
        () => new HttpResponse("dataset"),
      ),
    )

    renderTable(run())
    await chooseFormat("CSV")

    expect(
      await screen.findByText(
        "Error: Unable to download the extraction dataset.",
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText("private Blob failure")).not.toBeInTheDocument()
    expect(browserDownload.createObjectURL).not.toHaveBeenCalled()
    expect(browserDownload.revokeObjectURL).not.toHaveBeenCalled()
    expect(browserDownload.click).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "Download dataset" }),
    ).toBeEnabled()
  })

  it("warns safely when the browser cannot create an object URL", async () => {
    const browserDownload = installBrowserDownloadSpies()
    browserDownload.createObjectURL.mockImplementationOnce(() => {
      throw new Error("private object URL failure")
    })
    server.use(
      http.get(
        datasetApiUrl,
        () => new HttpResponse("dataset"),
      ),
    )

    renderTable(run())
    await chooseFormat("JSON")

    expect(
      await screen.findByText(
        "Error: Unable to download the extraction dataset.",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("private object URL failure"),
    ).not.toBeInTheDocument()
    expect(browserDownload.revokeObjectURL).not.toHaveBeenCalled()
    expect(browserDownload.click).not.toHaveBeenCalled()
    expect(
      screen.getByRole("button", { name: "Download dataset" }),
    ).toBeEnabled()
  })

  it("removes the link, revokes the object URL, and warns when browser download handoff fails", async () => {
    const browserDownload = installBrowserDownloadSpies()
    browserDownload.click.mockImplementationOnce(() => {
      throw new Error("private browser handoff failure")
    })
    server.use(
      http.get(
        datasetApiUrl,
        () => new HttpResponse("dataset"),
      ),
    )

    renderTable(run())
    await chooseFormat("CSV")

    expect(
      await screen.findByText(
        "Error: Unable to download the extraction dataset.",
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("private browser handoff failure"),
    ).not.toBeInTheDocument()
    expect(browserDownload.getClickedAnchor()?.isConnected).toBe(false)
    expect(browserDownload.revokeObjectURL).toHaveBeenCalledWith(
      "blob:extraction-dataset",
    )
    expect(
      screen.getByRole("button", { name: "Download dataset" }),
    ).toBeEnabled()
  })

  it("keeps filtering and pagination state while downloading the Run-wide dataset", async () => {
    const jobs = Array.from({ length: 31 }, (_, index) => job(index + 1))
    installBrowserDownloadSpies()
    let requestedUrl: URL | undefined
    server.use(
      http.get(
        datasetApiUrl,
        ({ request }) => {
          requestedUrl = new URL(request.url)
          return new HttpResponse("dataset")
        },
      ),
    )

    renderTable(run({ jobs }))
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "Filter by status" }))
    await user.click(await screen.findByRole("option", { name: "Complete (31)" }))
    await user.click(screen.getByRole("button", { name: "Next page" }))
    expect(screen.getByText("26–31 of 31 jobs")).toBeInTheDocument()

    await chooseFormat("CSV")

    await waitFor(() => expect(requestedUrl).toBeDefined())
    expect(requestedUrl?.search).toBe("?format=csv")
    expect(screen.getByText("26–31 of 31 jobs")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toHaveTextContent(
      "Complete (31)",
    )
  })

  it("does not revalidate the Run detail or show a success toast", async () => {
    const browserDownload = installBrowserDownloadSpies()
    let detailRequestCount = 0
    server.use(
      http.get("http://localhost/api/scrape-runs/17", () => {
        detailRequestCount += 1
        return HttpResponse.json(run())
      }),
      http.get(
        datasetApiUrl,
        () => new HttpResponse("dataset"),
      ),
    )

    const { container } = renderWithSwr(
      <>
        <ScrapeRunDetailView runId="17" />
        <Toaster />
      </>,
    )
    await screen.findByRole("heading", { name: "Customer stories" })
    await chooseFormat("JSON")
    await waitFor(() => expect(browserDownload.click).toHaveBeenCalledOnce())
    await delay(25)

    expect(detailRequestCount).toBe(1)
    expect(container.querySelectorAll("[data-sonner-toast]")).toHaveLength(0)
  })
})
