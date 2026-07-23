import { processScrapeJobStep } from "@/workflows/scrape-runs/scraping-steps"
import type {
  ClaimedScrapeRun,
  PersistedScrapeJob,
} from "@/workflows/scrape-runs/steps"

export async function processScrapeJobTwiceWorkflow(
  run: ClaimedScrapeRun,
  job: PersistedScrapeJob,
) {
  "use workflow"

  return [
    await processScrapeJobStep(run, job),
    await processScrapeJobStep(run, job),
  ]
}
