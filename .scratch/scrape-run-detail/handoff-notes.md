# Scrape Run Detail handoff notes

## Phase 1 — Detail contracts and backend read model

Phase 1 was completed as planned.

- The owner-scoped Run-detail repository now returns the existing persisted `failureCode` and `failureMessage` fields. No migration was needed because both columns already existed.
- `lib/scrape-runs/api-contracts.ts` now contains strict runtime schemas/types for Run detail, fields, stages, lightweight jobs, and cancellation success, plus validated GET/cancel fetchers and route builders.
- Contract validation enforces canonical three-stage ordering, exactly one required Primary Identifier, count totals, lifecycle enums, URL/timestamp shapes, IDs, and nonnegative positions/attempts/counts.
- `lib/scrape-runs/presentation.ts` now provides the pure lifecycle, label, timestamp, filtering, status-count, 25-row pagination, visible-range, page-clamping, progress, and Primary Identifier helpers needed by later phases.
- Repository and route regressions confirm that Workflow IDs, full Extraction Results, and job failure messages remain outside the lightweight Run-detail response.

One small deviation from the plan wording: no database/schema change was made, since the Run failure columns were already persisted and only missing from the read projection.

Verification completed with `pnpm typecheck`, `pnpm lint`, and `pnpm test` (348 tests passing). Phase 2 can build directly on `fetchScrapeRunDetail`, `getScrapeRunDetailApiPath`, the `ScrapeRunDetail` type, and the presentation helpers.
