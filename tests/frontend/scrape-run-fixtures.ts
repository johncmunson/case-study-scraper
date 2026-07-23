import type { ScrapeRunSummary } from "@/lib/scrape-runs/api-contracts"

export const validScrapeRunSummary = {
  id: 17,
  name: "Customer stories",
  targetUrl: "https://www.example.com/",
  status: "pending",
  cancellationRequestedAt: null,
  jobCounts: {
    total: 5,
    pending: 1,
    inProgress: 1,
    complete: 2,
    failed: 1,
    cancelled: 0,
  },
  createdAt: "2026-04-01T10:00:00.000Z",
  startedAt: "2026-04-01T10:01:00.000Z",
  finishedAt: null,
} satisfies ScrapeRunSummary
