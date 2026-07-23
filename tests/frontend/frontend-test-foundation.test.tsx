import { screen } from "@testing-library/react"
import { http, HttpResponse } from "msw"
import useSWR from "swr"
import { expect, it } from "vitest"

import {
  fetchScrapeRunSummaries,
  SCRAPE_RUNS_API_PATH,
} from "@/lib/scrape-runs/api-contracts"
import { getScrapeRunStatusLabel } from "@/lib/scrape-runs/presentation"
import { renderWithSwr } from "@/tests/frontend/render"
import { validScrapeRunSummary } from "@/tests/frontend/scrape-run-fixtures"
import { server } from "@/tests/mocks/server"

function SummaryProbe() {
  const { data } = useSWR(SCRAPE_RUNS_API_PATH, fetchScrapeRunSummaries)

  if (!data) {
    return <p>Loading</p>
  }

  return (
    <p>
      {data[0].name}: {getScrapeRunStatusLabel(data[0])}
    </p>
  )
}

it("runs a component with typed fetching in an isolated jsdom SWR cache", async () => {
  server.use(
    http.get("http://localhost/api/scrape-runs", () =>
      HttpResponse.json([validScrapeRunSummary]),
    ),
  )

  renderWithSwr(<SummaryProbe />)

  expect(screen.getByText("Loading")).toBeInTheDocument()
  expect(
    await screen.findByText("Customer stories: Pending"),
  ).toBeInTheDocument()
})
