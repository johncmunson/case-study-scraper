# Phase 1 handoff

- Added runtime-validated Run Summary/list/error contracts plus typed GET and create fetchers in `lib/scrape-runs/api-contracts.ts`. Successful responses are parsed from `unknown`; failures expose only a safe message, optional HTTP status, and optional persisted Scrape Run ID.
- Added pure status, progress/outcome, Target Site hostname, and locale timestamp helpers in `lib/scrape-runs/presentation.ts`.
- Added the dedicated `frontend` jsdom Vitest project, Testing Library/jest-dom setup, existing MSW lifecycle reuse, and `renderWithSwr` for a fresh no-deduplication cache per render. Use `pnpm test:frontend` for this project.
- The visible `/app/scrape-runs` page and existing creation dialog were intentionally unchanged, as required for Phase 1.
- The only unexpected implementation issue was that Zod refinements can still run after the built-in URL check reports an issue; the normalized target-origin refinement therefore handles `new URL()` failures explicitly.
- Review identified that the frontend contract also needed the backend’s public-DNS-hostname guarantee. That browser-safe check now lives in `lib/scrape-runs/public-hostname.ts` and is shared by backend URL normalization and the frontend response schema.
- No plan deviations. Phase 2 can use `SCRAPE_RUNS_API_PATH`, `fetchScrapeRunSummaries`, the inferred summary types, and the presentation helpers directly.

Verification completed: `pnpm test` (all 20 files and 250 tests, including unit, frontend, integration, and Workflow projects), `pnpm typecheck`, and `pnpm lint`.
