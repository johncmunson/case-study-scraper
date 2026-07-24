import { CircleAlertIcon, CircleXIcon } from "lucide-react"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ScrapeJobDetail } from "@/lib/scrape-runs/api-contracts"

const LIFECYCLE_CONTENT = {
  pending: {
    title: "Waiting to start extraction",
    description:
      "This Scrape Job is ready and will start when extraction capacity is available.",
    icon: CircleAlertIcon,
  },
  in_progress: {
    title: "Extracting data from this page",
    description:
      "This page will update automatically while extraction is in progress.",
    icon: CircleAlertIcon,
  },
  cancelled: {
    title: "Extraction was cancelled before this job finished",
    description: "No Extraction Result was saved for this Scrape Job.",
    icon: CircleXIcon,
  },
} as const satisfies Record<
  Extract<
    ScrapeJobDetail["status"],
    "pending" | "in_progress" | "cancelled"
  >,
  {
    title: string
    description: string
    icon: typeof CircleAlertIcon
  }
>

export function ScrapeJobLifecycleState({
  status,
}: {
  status: Extract<
    ScrapeJobDetail["status"],
    "pending" | "in_progress" | "cancelled"
  >
}) {
  const content = LIFECYCLE_CONTENT[status]
  const Icon = content.icon

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-2">
          <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            <CardTitle>
              <h3 className="wrap-break-word">{content.title}</h3>
            </CardTitle>
            <CardDescription className="wrap-break-word">
              {content.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}
