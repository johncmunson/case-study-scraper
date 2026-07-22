import { describe, expect, expectTypeOf, it } from "vitest"

import {
  extractionResultRecordSchema,
  isActiveScrapeRunStatus,
  isTerminalScrapeJobStatus,
  isTerminalScrapeRunStatus,
  SCRAPE_JOB_STATUSES,
  SCRAPE_RUN_ERROR_CODES,
  SCRAPE_RUN_STAGES,
  SCRAPE_RUN_STAGE_STATUSES,
  SCRAPE_RUN_STATUSES,
  scrapeJobStatusSchema,
  scrapeRunErrorCodeSchema,
  scrapeRunStageSchema,
  scrapeRunStageStatusSchema,
  scrapeRunStatusSchema,
  type ExtractionResult,
  type RunConfiguration,
} from "@/lib/scrape-runs/contracts"
import {
  newScrapeRunSchema,
  type NewScrapeRunInput,
  type NormalizedNewScrapeRunInput,
} from "@/lib/scrape-runs/new-scrape-run"

describe("scrape run contracts", () => {
  it("keeps lifecycle schemas aligned with their shared values", () => {
    for (const status of SCRAPE_RUN_STATUSES) {
      expect(scrapeRunStatusSchema.parse(status)).toBe(status)
    }
    for (const status of SCRAPE_JOB_STATUSES) {
      expect(scrapeJobStatusSchema.parse(status)).toBe(status)
    }
    for (const status of SCRAPE_RUN_STAGE_STATUSES) {
      expect(scrapeRunStageStatusSchema.parse(status)).toBe(status)
    }
    for (const stage of SCRAPE_RUN_STAGES) {
      expect(scrapeRunStageSchema.parse(stage)).toBe(stage)
    }
    for (const errorCode of SCRAPE_RUN_ERROR_CODES) {
      expect(scrapeRunErrorCodeSchema.parse(errorCode)).toBe(errorCode)
    }

    expect(scrapeRunStatusSchema.safeParse("skipped").success).toBe(false)
    expect(scrapeJobStatusSchema.safeParse("skipped").success).toBe(false)
    expect(scrapeRunStageStatusSchema.safeParse("skipped").success).toBe(true)
  })

  it("classifies active and terminal run and job statuses", () => {
    expect(isActiveScrapeRunStatus("pending")).toBe(true)
    expect(isActiveScrapeRunStatus("in_progress")).toBe(true)
    expect(isTerminalScrapeRunStatus("complete")).toBe(true)
    expect(isTerminalScrapeRunStatus("failed")).toBe(true)
    expect(isTerminalScrapeRunStatus("cancelled")).toBe(true)
    expect(isTerminalScrapeJobStatus("pending")).toBe(false)
    expect(isTerminalScrapeJobStatus("complete")).toBe(true)
  })

  it("accepts only string-or-null Extraction Result values", () => {
    expect(
      extractionResultRecordSchema.safeParse({ client: "Acme", title: null })
        .success,
    ).toBe(true)
    expect(extractionResultRecordSchema.safeParse({ client: 42 }).success).toBe(
      false,
    )
    expect(extractionResultRecordSchema.safeParse(null).success).toBe(false)
  })

  it("distinguishes raw create input from normalized configuration output", () => {
    expectTypeOf<NewScrapeRunInput>().not.toHaveProperty("targetOrigin")
    expectTypeOf<NormalizedNewScrapeRunInput>().toEqualTypeOf<RunConfiguration>()
    expectTypeOf<ExtractionResult>().toMatchTypeOf<
      Readonly<Record<string, string | null>>
    >()
    expectTypeOf(newScrapeRunSchema).toBeObject()
  })
})
