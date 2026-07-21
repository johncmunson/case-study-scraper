import { AppPage } from "@/components/app/app-page"
import { NewScrapeRunDialog } from "@/components/scrape-runs/new-scrape-run-dialog"

export default function ScrapeRunsPage() {
  return (
    <AppPage title="Scrape Runs">
      <div className="flex justify-end">
        <NewScrapeRunDialog />
      </div>
    </AppPage>
  )
}
