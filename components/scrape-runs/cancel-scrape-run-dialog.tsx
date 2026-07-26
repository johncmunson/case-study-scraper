"use client"

import { XIcon } from "lucide-react"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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
    <div className="flex max-w-sm flex-col items-end gap-2 text-right">
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
        <Tooltip>
          <AlertDialogTrigger
            render={
              <TooltipTrigger
                render={
                  <Button
                    className="cursor-pointer"
                    size="icon-sm"
                    variant={isRetry ? "outline" : "destructive"}
                  />
                }
              />
            }
            disabled={isMutating}
          >
            <XIcon aria-hidden="true" />
            <span className="sr-only">{triggerLabel}</span>
          </AlertDialogTrigger>
          <TooltipContent>Cancel scrape job</TooltipContent>
        </Tooltip>
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
              <AlertDialogCancel
                className="cursor-pointer"
                disabled={isMutating}
              >
                Keep running
              </AlertDialogCancel>
              <AlertDialogAction
                type="button"
                className="cursor-pointer"
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
      {isRetry && (
        <p className="wrap-anywhere text-sm text-muted-foreground">
          The earlier cancellation request has not finished cleanup.
        </p>
      )}
    </div>
  )
}
