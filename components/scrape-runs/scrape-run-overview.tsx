import { CircleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { ScrapeRunDetail } from "@/lib/scrape-runs/api-contracts"
import {
  getJobProgressPercentage,
  getScrapeRunJobSummary,
  isActiveScrapeRun,
} from "@/lib/scrape-runs/presentation"

export function ScrapeRunOverview({ run }: { run: ScrapeRunDetail }) {
  const active = isActiveScrapeRun(run)
  const hasDeterminateProgress = active && run.jobCounts.total > 0
  const hasTerminalFailure =
    !active && (run.failureCode !== null || run.failureMessage !== null)

  return (
    <section className="space-y-3" aria-label="Scrape Run overview">
      {hasTerminalFailure && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>
            <h3>Scrape Run failure</h3>
          </AlertTitle>
          <AlertDescription className="space-y-1">
            {run.failureMessage && (
              <p className="wrap-anywhere">{run.failureMessage}</p>
            )}
            {run.failureCode && (
              <p className="wrap-anywhere font-mono text-xs">
                Failure code: <code>{run.failureCode}</code>
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{active ? "Scrape Job progress" : "Scrape Job outcomes"}</h3>
          </CardTitle>
          <CardDescription>{getScrapeRunJobSummary(run)}</CardDescription>
        </CardHeader>
        {hasDeterminateProgress && (
          <CardContent>
            <Progress
              aria-label="Scrape Job progress"
              value={getJobProgressPercentage(run.jobCounts)}
            />
          </CardContent>
        )}
      </Card>
    </section>
  )
}
