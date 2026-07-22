# Phase 1 handoff

Implemented the trusted create-run boundary and pure scrape-run domain contracts.

- `newScrapeRunSchema` now enforces all agreed limits and cross-field rules, then returns a deeply frozen, normalized `RunConfiguration`. `NewScrapeRunInput` remains the raw frontend/wire type; normalized fields gain their stable Field Key.
- Added pure URL helpers for target-origin and Canonical Page URL normalization, exact-host checks, duplicate detection support, public-host syntax checks, and rejection of IP/local/special-use hosts. Query/fragment/default-port/trailing-slash and unreserved percent-encoding variants are canonicalized consistently.
- Added shared lifecycle/status/stage/error-code constants, Zod schemas, configuration types, and Extraction Result/failure contracts in `lib/scrape-runs/contracts.ts`.
- Expanded unit coverage to 65 passing tests, including all input boundaries, URL canonicalization, public/exact host rules, duplicate examples, Field Label/Key rules, and raw-input versus normalized-output typing. `pnpm test`, `pnpm typecheck`, and `pnpm lint` all pass.

Notes for Phase 2:

- Public-host validation is intentionally deterministic and does not perform DNS lookups. It rejects single-label names, IPs, malformed DNS labels, common internal suffixes, and standardized special-use suffixes.
- Example URLs with credentials are rejected too, although the plan explicitly called this out only for the target URL; silently dropping credentials during canonicalization was judged unsafe.
- `RunConfiguration` represents the normalized user-owned configuration. `PersistedRunConfiguration` adds the server-owned immutable `filteringModel`; creation-time config validation/attachment remains for the persistence/API phases.
- The current POST route is still the pre-existing logging stub, but it now logs normalized schema output (including Field Keys). Removal of payload logging remains scheduled for Phase 9.
