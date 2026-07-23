# Phase 1 handoff

- Added runtime-validated Run Summary/list/error contracts plus typed GET and create fetchers in `lib/scrape-runs/api-contracts.ts`. Successful responses are parsed from `unknown`; failures expose only a safe message, optional HTTP status, and optional persisted Scrape Run ID.
- Added pure status, progress/outcome, Target Site hostname, and locale timestamp helpers in `lib/scrape-runs/presentation.ts`.
- Added the dedicated `frontend` jsdom Vitest project, Testing Library/jest-dom setup, existing MSW lifecycle reuse, and `renderWithSwr` for a fresh no-deduplication cache per render. Use `pnpm test:frontend` for this project.
- The visible `/app/scrape-runs` page and existing creation dialog were intentionally unchanged, as required for Phase 1.
- The only unexpected implementation issue was that Zod refinements can still run after the built-in URL check reports an issue; the normalized Target Site refinement therefore handles `new URL()` failures explicitly.
- No plan deviations. Phase 2 can use `SCRAPE_RUNS_API_PATH`, `fetchScrapeRunSummaries`, the inferred summary types, and the presentation helpers directly.

Verification completed: `pnpm test:frontend`, `pnpm test:unit`, `pnpm typecheck`, and `pnpm lint`.
