import { AppPage } from "@/components/app/app-page"
import { ScrapeJobDetailSkeleton } from "@/components/scrape-runs/scrape-job-detail-skeleton"

export default function ScrapeJobDetailLoading() {
  return (
    <AppPage title="Scrape Job">
      <ScrapeJobDetailSkeleton />
    </AppPage>
  )
}
