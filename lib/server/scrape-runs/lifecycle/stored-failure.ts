import type {
  ScrapeRunErrorCode,
  ScrapeRunFailure,
} from "@/lib/scrape-runs/contracts"

const SANITIZED_FAILURE_MESSAGES: Readonly<Record<ScrapeRunErrorCode, string>> =
  {
    workflow_dispatch_failed: "The scrape run could not be started.",
    mapping_failed: "Mapping could not be completed.",
    filtering_failed: "Filtering could not be completed.",
    job_creation_failed: "Scrape jobs could not be created.",
    scrape_failed: "Extraction failed.",
    missing_required_fields: "Required fields were missing.",
    unexpected_workflow_failure: "The workflow stopped unexpectedly.",
  }

/**
 * Converts a classified failure to the bounded public message stored in
 * PostgreSQL. Caller-provided text may contain provider or exception details,
 * so it is deliberately never persisted.
 */
export function failureForStorage(failure: ScrapeRunFailure): ScrapeRunFailure {
  return {
    code: failure.code,
    message: SANITIZED_FAILURE_MESSAGES[failure.code],
  }
}
