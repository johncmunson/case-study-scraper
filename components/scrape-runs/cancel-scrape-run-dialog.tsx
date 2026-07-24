"use client"

import { useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function CancelScrapeRunDialog({
  isMutating,
  isRetry,
  onConfirm,
}: {
  isMutating: boolean
  isRetry: boolean
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const triggerLabel = isRetry ? "Retry cancellation" : "Cancel Scrape Run"
  const pendingLabel = isRetry ? "Retrying…" : "Cancelling…"

  async function confirmCancellation() {
    if (isMutating) return

    await onConfirm()
    setOpen(false)
  }

  return (
    <div className="space-y-2 sm:text-right">
      {isRetry && (
        <p className="max-w-sm wrap-anywhere text-sm text-muted-foreground">
          The earlier cancellation request has not finished cleanup.
        </p>
      )}
      <AlertDialog
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (!nextOpen && isMutating) {
            eventDetails.cancel()
            return
          }

          setOpen(nextOpen)
        }}
      >
        <AlertDialogTrigger
          render={
            <Button variant={isRetry ? "outline" : "destructive"} />
          }
          disabled={isMutating}
        >
          {triggerLabel}
        </AlertDialogTrigger>
        {open && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isRetry ? "Retry cancellation?" : "Cancel Scrape Run?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isRetry
                  ? "Retry incomplete cancellation cleanup. Finished Scrape Job outcomes will remain unchanged."
                  : "Unfinished work will stop. Scrape Jobs that already finished will keep their outcomes."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isMutating}>
                Keep running
              </AlertDialogCancel>
              <AlertDialogAction
                type="button"
                variant="destructive"
                disabled={isMutating}
                onClick={() => {
                  void confirmCancellation()
                }}
              >
                {isMutating && <Spinner aria-hidden="true" />}
                {isMutating ? pendingLabel : triggerLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  )
}
