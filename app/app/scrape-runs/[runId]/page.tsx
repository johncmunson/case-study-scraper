import { AppPage } from "@/components/app/app-page"
import { ScrapeRunDetailView } from "@/components/scrape-runs/scrape-run-detail-view"

export default async function ScrapeRunDetailPage(
  props: PageProps<"/app/scrape-runs/[runId]">,
) {
  const { runId } = await props.params

  return (
    <AppPage>
      <ScrapeRunDetailView key={runId} runId={runId} />
    </AppPage>
  )
}
