"use client"

import { ChevronDownIcon, DownloadIcon } from "lucide-react"
import { useRef, useState, type ComponentProps } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ScrapeRunApiError,
  scrapeRunApiErrorFromResponse,
} from "@/lib/scrape-runs/api-contracts"
import type { ScrapeRunStatus } from "@/lib/scrape-runs/contracts"
import {
  getExtractionDatasetApiPath,
  getExtractionDatasetAvailability,
  getExtractionDatasetFilename,
  type ExtractionDatasetFormat,
} from "@/lib/scrape-runs/extraction-dataset"
import { cn } from "@/lib/utils"

const DOWNLOAD_FAILURE_MESSAGE = "Unable to download the extraction dataset."
const TOAST_POSITION = "bottom-center"

const UNAVAILABLE_EXPLANATIONS = {
  "active-run": "Available when this Scrape Run finishes.",
  "no-successful-results": "No successful results to download.",
} as const

type DownloadExtractionDatasetProps = {
  runId: number
  runName: string
  runStatus: ScrapeRunStatus
  successfulResultCount: number
}

function DownloadButton({
  className,
  disabled = false,
  preparing = false,
  ...props
}: ComponentProps<typeof Button> & { preparing?: boolean }) {
  return (
    <Button
      {...props}
      type="button"
      variant="outline"
      className={cn("w-full cursor-pointer sm:w-auto", className)}
      disabled={disabled || preparing}
      aria-busy={preparing}
    >
      {preparing ? (
        <Spinner aria-hidden="true" />
      ) : (
        <DownloadIcon aria-hidden="true" />
      )}
      {preparing ? "Preparing download…" : "Download dataset"}
      {!preparing && <ChevronDownIcon aria-hidden="true" />}
    </Button>
  )
}

export function DownloadExtractionDataset({
  runId,
  runName,
  runStatus,
  successfulResultCount,
}: DownloadExtractionDatasetProps) {
  const [isPreparing, setIsPreparing] = useState(false)
  const requestInFlight = useRef(false)
  const availability = getExtractionDatasetAvailability(
    runStatus,
    successfulResultCount,
  )

  async function download(format: ExtractionDatasetFormat) {
    if (requestInFlight.current) {
      return
    }

    requestInFlight.current = true
    setIsPreparing(true)

    try {
      const response = await fetch(getExtractionDatasetApiPath(runId, format))

      if (!response.ok) {
        throw await scrapeRunApiErrorFromResponse(response)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)

      try {
        const downloadLink = document.createElement("a")
        downloadLink.href = objectUrl
        downloadLink.download = getExtractionDatasetFilename(
          runName,
          runId,
          format,
        )
        downloadLink.hidden = true
        document.body.append(downloadLink)

        try {
          downloadLink.click()
        } finally {
          downloadLink.remove()
        }
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    } catch (error) {
      const message =
        error instanceof ScrapeRunApiError
          ? error.message
          : DOWNLOAD_FAILURE_MESSAGE

      toast.warning(`Error: ${message}`, {
        position: TOAST_POSITION,
      })
    } finally {
      requestInFlight.current = false
      setIsPreparing(false)
    }
  }

  if (availability !== "available") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label="Download dataset"
              className="inline-flex w-full sm:w-auto"
              tabIndex={0}
            />
          }
        >
          <DownloadButton disabled />
        </TooltipTrigger>
        <TooltipContent>{UNAVAILABLE_EXPLANATIONS[availability]}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<DownloadButton preparing={isPreparing} />}
      />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="whitespace-normal leading-relaxed">
            Includes all {successfulResultCount} successful results. Failed and
            cancelled jobs are excluded.
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => void download("csv")}
        >
          Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onClick={() => void download("json")}
        >
          Download JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
