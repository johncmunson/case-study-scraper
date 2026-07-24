import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  ScrapeRunDetail,
  ScrapeRunStageState,
} from "@/lib/scrape-runs/api-contracts"
import {
  formatScrapeRunTimestamp,
  getScrapeRunStageLabel,
  getScrapeRunStageStatusLabel,
} from "@/lib/scrape-runs/presentation"

type BadgeVariant = "default" | "secondary" | "destructive" | "outline"

const STAGE_STATUS_BADGE_VARIANTS = {
  pending: "secondary",
  in_progress: "default",
  complete: "secondary",
  failed: "destructive",
  cancelled: "outline",
  skipped: "outline",
} as const satisfies Record<ScrapeRunStageState["status"], BadgeVariant>

function StageTime({ label, timestamp }: { label: string; timestamp: string }) {
  return (
    <span>
      {label}{" "}
      <time
        aria-label={`${label} ${formatScrapeRunTimestamp(timestamp)}`}
        dateTime={timestamp}
        suppressHydrationWarning
      >
        {formatScrapeRunTimestamp(timestamp)}
      </time>
    </span>
  )
}

function ScrapeRunStageItem({ stage }: { stage: ScrapeRunStageState }) {
  const stageLabel = getScrapeRunStageLabel(stage.stage)
  const statusLabel = getScrapeRunStageStatusLabel(stage.status)

  return (
    <li className="relative min-w-0 border-l-2 border-border py-1 pl-5 last:border-transparent">
      <span
        aria-hidden="true"
        className="absolute top-2 -left-[7px] size-3 rounded-full border-2 border-background bg-muted-foreground"
      />
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h4 className="font-medium">{stageLabel}</h4>
          <Badge
            aria-label={`${stageLabel} status: ${statusLabel}`}
            className={
              stage.status === "skipped"
                ? "border-dashed text-muted-foreground"
                : undefined
            }
            variant={STAGE_STATUS_BADGE_VARIANTS[stage.status]}
          >
            {statusLabel}
          </Badge>
        </div>

        {(stage.attemptCount > 0 || stage.startedAt || stage.finishedAt) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {stage.attemptCount > 0 && (
              <span>
                {stage.attemptCount}{" "}
                {stage.attemptCount === 1 ? "attempt" : "attempts"}
              </span>
            )}
            {stage.startedAt && (
              <StageTime label="Started" timestamp={stage.startedAt} />
            )}
            {stage.finishedAt && (
              <StageTime label="Finished" timestamp={stage.finishedAt} />
            )}
          </div>
        )}

        {stage.status === "failed" &&
          (stage.failureMessage || stage.failureCode) && (
            <div className="space-y-1 text-sm text-destructive">
              {stage.failureMessage && (
                <p className="wrap-anywhere">{stage.failureMessage}</p>
              )}
              {stage.failureCode && (
                <p className="wrap-anywhere font-mono text-xs">
                  Failure code: <code>{stage.failureCode}</code>
                </p>
              )}
            </div>
          )}
      </div>
    </li>
  )
}

export function ScrapeRunStageList({
  stages,
}: {
  stages: ScrapeRunDetail["stages"]
}) {
  return (
    <section aria-labelledby="run-stages-heading">
      <Card>
        <CardHeader>
          <CardTitle>
            <h3 id="run-stages-heading">Run Stages</h3>
          </CardTitle>
          <CardDescription>
            Mapping, Filtering, and Scraping run in order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol aria-label="Run Stages">
            {stages.map((stage) => (
              <ScrapeRunStageItem key={stage.stage} stage={stage} />
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  )
}
