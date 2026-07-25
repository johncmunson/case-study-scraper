import { AppPage } from "@/components/app/app-page"
import { ScrapeRunDetailSkeleton } from "@/components/scrape-runs/scrape-run-detail-skeleton"

export default function ScrapeRunDetailLoading() {
  return (
    <AppPage>
      <ScrapeRunDetailSkeleton />
    </AppPage>
  )
}
