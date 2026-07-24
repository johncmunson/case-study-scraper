# Phase 1 handoff notes

Phase 1 was implemented as planned.

- Added client-safe Extraction Dataset contracts and helpers in `lib/scrape-runs/extraction-dataset.ts`: eligibility, explicit format API paths, safe filenames, deterministic record shaping, and exact stored-result validation.
- Dataset construction returns distinct `available`, `unavailable` (`active-run` / `no-successful-results`), and `invalid` outcomes. Active Runs are rejected before any partial successful results are validated or shaped.
- Added the owner-scoped projection in `lib/server/scrape-runs/extraction-dataset-repository.ts`. It uses one relational database query, selects only Run identity/state plus required field/job data, filters non-complete Jobs in SQL, and orders fields and Canonical Page URLs.
- Added unit and database integration coverage for the full Phase 1 matrix, including malformed JSONB objects that pass the database constraint but fail at the dataset boundary.

No schema changes or dependencies were needed. There were no material deviations from the plan. Final verification passed: 529 tests, typecheck, and lint. Phase 2 can consume `findOwnedScrapeRunExtractionDatasetSource()`, pass a non-null result to `buildExtractionDataset()`, map its outcome to HTTP status, and serialize only the `available` records. `getExtractionDatasetFilename()` and `getExtractionDatasetApiPath()` are intended to remain the shared server/client naming and path rules.
