"use client"

import { EllipsisIcon, Trash2Icon } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { useSWRConfig } from "swr"
import useSWRMutation from "swr/mutation"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import {
  deleteScrapeJob,
  fetchScrapeRunDetail,
  fetchScrapeRunSummaries,
  getScrapeJobDetailApiPath,
  getScrapeRunDetailApiPath,
  SCRAPE_RUNS_API_PATH,
  ScrapeRunApiError,
  type ScrapeJobSummary,
  type ScrapeRunDetail,
  type ScrapeRunJobCounts,
  type ScrapeRunSummaryList,
} from "@/lib/scrape-runs/api-contracts"

type DeleteScrapeJobDialogProps = Readonly<{
  job: Pick<ScrapeJobSummary, "id" | "url" | "status">
  runId: number
  triggerVariant: "row-action" | "detail-button"
  onDeleted?: () => void | Promise<void>
}>

const COUNT_KEY_BY_STATUS = {
  pending: "pending",
  in_progress: "inProgress",
  complete: "complete",
  failed: "failed",
  cancelled: "cancelled",
} as const satisfies Record<
  ScrapeJobSummary["status"],
  Exclude<keyof ScrapeRunJobCounts, "total">
>

function withoutJob(
  counts: ScrapeRunJobCounts,
  status: ScrapeJobSummary["status"],
): ScrapeRunJobCounts {
  const statusKey = COUNT_KEY_BY_STATUS[status]

  return {
    ...counts,
    total: Math.max(0, counts.total - 1),
    [statusKey]: Math.max(0, counts[statusKey] - 1),
  }
}

export function DeleteScrapeJobDialog({
  job,
  runId,
  triggerVariant,
  onDeleted,
}: DeleteScrapeJobDialogProps) {
  const { mutate } = useSWRConfig()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const neutralButtonRef = useRef<HTMLButtonElement>(null)
  const submissionPendingRef = useRef(false)
  const [open, setOpen] = useState(false)
  const detailPath = getScrapeRunDetailApiPath(runId)
  const jobPath = getScrapeJobDetailApiPath(runId, job.id)
  const { trigger: deleteJob, isMutating } = useSWRMutation<
    void,
    ScrapeRunApiError
  >(jobPath, deleteScrapeJob)

  function revalidateReadModels() {
    void mutate<ScrapeRunDetail>(detailPath, fetchScrapeRunDetail(detailPath), {
      revalidate: false,
    }).catch(() => undefined)
    void mutate<ScrapeRunSummaryList>(
      SCRAPE_RUNS_API_PATH,
      fetchScrapeRunSummaries(SCRAPE_RUNS_API_PATH),
      { revalidate: false },
    ).catch(() => undefined)
  }

  async function confirmDeletion() {
    if (isMutating || submissionPendingRef.current) return
    submissionPendingRef.current = true

    try {
      await deleteJob()
      await Promise.all([
        mutate<ScrapeRunDetail>(
          detailPath,
          (currentRun) => {
            if (
              !currentRun ||
              !currentRun.jobs.some((currentJob) => currentJob.id === job.id)
            ) {
              return currentRun
            }

            return {
              ...currentRun,
              jobs: currentRun.jobs.filter(
                (currentJob) => currentJob.id !== job.id,
              ),
              jobCounts: withoutJob(currentRun.jobCounts, job.status),
            }
          },
          { revalidate: false },
        ),
        mutate<ScrapeRunSummaryList>(
          SCRAPE_RUNS_API_PATH,
          (currentRuns) =>
            currentRuns?.map((currentRun) =>
              currentRun.id === runId
                ? {
                    ...currentRun,
                    jobCounts: withoutJob(currentRun.jobCounts, job.status),
                  }
                : currentRun,
            ),
          { revalidate: false },
        ),
      ])
      setOpen(false)
      toast.success("Scrape Job deleted", { position: "bottom-center" })
      await onDeleted?.()
      await mutate(jobPath, undefined, { revalidate: false })
      revalidateReadModels()
    } catch (error) {
      setOpen(false)
      const message =
        error instanceof ScrapeRunApiError
          ? error.message
          : "Unable to delete the scrape job."
      toast.error(`Error: ${message}`, { position: "bottom-center" })
      revalidateReadModels()
    } finally {
      submissionPendingRef.current = false
    }
  }

  const triggerElement =
    triggerVariant === "row-action" ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              type="button"
              size="icon-sm"
              variant="ghost"
              className="cursor-pointer"
              aria-label={`Actions for ${job.url}`}
              disabled={isMutating}
            />
          }
        >
          <EllipsisIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="cursor-pointer"
            variant="destructive"
            onClick={() => window.setTimeout(() => setOpen(true), 0)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <Button
        ref={triggerRef}
        type="button"
        variant="destructive"
        className="cursor-pointer"
        disabled={isMutating}
        onClick={() => setOpen(true)}
      >
        <Trash2Icon aria-hidden="true" />
        Delete Scrape Job
      </Button>
    )

  return (
    <>
      {triggerElement}
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (!nextOpen && (isMutating || submissionPendingRef.current)) {
            eventDetails.cancel()
            return
          }
          setOpen(nextOpen)
        }}
      >
        {open && (
          <AlertDialogContent
            initialFocus={neutralButtonRef}
            finalFocus={triggerRef}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Scrape Job?</AlertDialogTitle>
              <AlertDialogDescription>
                This action is permanent and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                ref={neutralButtonRef}
                className="cursor-pointer"
                disabled={isMutating}
              >
                Keep Scrape Job
              </AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className="cursor-pointer"
                variant="destructive"
                disabled={isMutating}
                onClick={() => void confirmDeletion()}
              >
                {isMutating && <Spinner aria-hidden="true" />}
                {isMutating ? "Deleting…" : "Delete Scrape Job"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}
