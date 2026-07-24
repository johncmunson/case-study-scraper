import { AppPage } from "@/components/app/app-page"
import { ScrapeJobDetailView } from "@/components/scrape-runs/scrape-job-detail-view"

export default async function ScrapeJobDetailPage(
  props: PageProps<"/app/scrape-runs/[runId]/scrape-jobs/[jobId]">,
) {
  const { runId, jobId } = await props.params

  return (
    <AppPage title="Scrape Job">
      <ScrapeJobDetailView
        key={`${runId}:${jobId}`}
        runId={runId}
        jobId={jobId}
      />
    </AppPage>
  )
}
