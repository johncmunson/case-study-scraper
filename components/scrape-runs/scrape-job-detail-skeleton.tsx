import Link from "next/link"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function ScrapeJobDetailSkeleton({ runId }: { runId?: string }) {
  return (
    <div className="space-y-6" aria-label="Loading scrape job detail">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/app/scrape-runs" />}>
              Scrape Runs
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {runId && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={<Link href={`/app/scrape-runs/${runId}`} />}
                >
                  Scrape Run
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>Loading</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <section className="space-y-5" aria-hidden="true">
        <Skeleton className="h-8 w-64 max-w-full" />

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-5 w-full max-w-2xl" />
            <Skeleton className="h-8 w-28" />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-14 w-full max-w-3xl" />
        </div>
      </section>

      <Card aria-hidden="true">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full max-w-xl" />
        </CardContent>
      </Card>
    </div>
  )
}
