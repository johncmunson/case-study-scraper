"use client"

import { EllipsisIcon } from "lucide-react"
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
  cancelScrapeRun,
  deleteScrapeRun,
  getScrapeRunCancellationApiPath,
  getScrapeRunDetailApiPath,
  SCRAPE_RUNS_API_PATH,
  ScrapeRunApiError,
  type CancelScrapeRunResponse,
  type ScrapeRunSummary,
  type ScrapeRunSummaryList,
} from "@/lib/scrape-runs/api-contracts"
import { isActiveScrapeRun } from "@/lib/scrape-runs/presentation"

type CardAction = "cancel" | "delete"

const ACTION_CONTENT = {
  cancel: {
    title: "Cancel Scrape Run?",
    neutralLabel: "Keep running",
    confirmLabel: "Cancel Scrape Run",
    pendingLabel: "Cancelling…",
    fallbackError: "Unable to cancel the scrape run.",
    success: "Scrape Run cancelled",
  },
  delete: {
    title: "Delete Scrape Run?",
    neutralLabel: "Keep Scrape Run",
    confirmLabel: "Delete Scrape Run",
    pendingLabel: "Deleting…",
    fallbackError: "Unable to delete the scrape run.",
    success: "Scrape Run deleted",
  },
} as const

export function ScrapeRunCardActions({ run }: { run: ScrapeRunSummary }) {
  const { mutate } = useSWRConfig()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const neutralButtonRef = useRef<HTMLButtonElement>(null)
  const submissionPendingRef = useRef(false)
  const [selectedAction, setSelectedAction] = useState<CardAction | null>(null)
  const availableAction: CardAction = isActiveScrapeRun(run)
    ? "cancel"
    : "delete"
  const cancellationPath = getScrapeRunCancellationApiPath(run.id)
  const deletionPath = getScrapeRunDetailApiPath(run.id)
  const { trigger: triggerCancellation, isMutating: isCancelling } =
    useSWRMutation<CancelScrapeRunResponse, ScrapeRunApiError>(
      cancellationPath,
      cancelScrapeRun,
    )
  const { trigger: triggerDeletion, isMutating: isDeleting } =
    useSWRMutation<void, ScrapeRunApiError>(deletionPath, deleteScrapeRun)
  const isMutating = isCancelling || isDeleting
  const selectedContent = selectedAction
    ? ACTION_CONTENT[selectedAction]
    : null

  async function confirmAction() {
    const action = selectedAction
    if (!action || isMutating || submissionPendingRef.current) return
    submissionPendingRef.current = true

    try {
      if (action === "cancel") {
        const cancelledRun = await triggerCancellation()

        if (cancelledRun.id !== run.id) {
          throw new ScrapeRunApiError(
            "The server returned an invalid response.",
            { status: 202 },
          )
        }

        setSelectedAction(null)
        await mutate<ScrapeRunSummaryList>(
          SCRAPE_RUNS_API_PATH,
          (currentRuns) =>
            currentRuns?.map((currentRun) =>
              currentRun.id === cancelledRun.id
                ? { ...currentRun, status: cancelledRun.status }
                : currentRun,
            ),
          { revalidate: false },
        )
      } else {
        await triggerDeletion()
        setSelectedAction(null)
        await mutate<ScrapeRunSummaryList>(
          SCRAPE_RUNS_API_PATH,
          (currentRuns) =>
            currentRuns?.filter((currentRun) => currentRun.id !== run.id),
          { revalidate: false },
        )
      }

      toast.success(ACTION_CONTENT[action].success, {
        position: "bottom-center",
      })
      void mutate(SCRAPE_RUNS_API_PATH)
    } catch (error) {
      setSelectedAction(null)
      const message =
        error instanceof ScrapeRunApiError
          ? error.message
          : ACTION_CONTENT[action].fallbackError
      toast.warning(`Error: ${message}`, { position: "bottom-center" })
      void mutate(SCRAPE_RUNS_API_PATH)
    } finally {
      submissionPendingRef.current = false
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={triggerRef}
              aria-label={`Actions for ${run.name}`}
              className="cursor-pointer"
              size="icon-sm"
              variant="ghost"
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
            onClick={() => {
              const action = availableAction
              window.setTimeout(() => setSelectedAction(action), 0)
            }}
          >
            {availableAction === "cancel" ? "Cancel" : "Delete"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={selectedAction !== null}
        onOpenChange={(open, eventDetails) => {
          if (!open && isMutating) {
            eventDetails.cancel()
            return
          }

          if (!open) setSelectedAction(null)
        }}
      >
        {selectedAction && selectedContent && (
          <AlertDialogContent
            initialFocus={neutralButtonRef}
            finalFocus={triggerRef}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{selectedContent.title}</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedAction === "cancel"
                  ? `Unfinished work for “${run.name}” will stop, while Scrape Jobs that already finished will retain their outcomes.`
                  : `The Scrape Run “${run.name}” and its associated configuration, stages, Scrape Jobs, results, and datasets will be permanently removed. This action cannot be undone.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                ref={neutralButtonRef}
                className="cursor-pointer"
                disabled={isMutating}
              >
                {selectedContent.neutralLabel}
              </AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className="cursor-pointer"
                variant="destructive"
                disabled={isMutating}
                onClick={() => void confirmAction()}
              >
                {isMutating && <Spinner aria-hidden="true" />}
                {isMutating
                  ? selectedContent.pendingLabel
                  : selectedContent.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </>
  )
}
