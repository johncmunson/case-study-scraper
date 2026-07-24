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
        <div className="flex items-start justify-between gap-4">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-full max-w-2xl" />
            <Skeleton className="h-14 w-full max-w-3xl" />
          </CardContent>
        </Card>
      </section>

      <div className="space-y-6" aria-hidden="true">
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-5 w-full max-w-xl" />
        </div>
      </div>
    </div>
  )
}
