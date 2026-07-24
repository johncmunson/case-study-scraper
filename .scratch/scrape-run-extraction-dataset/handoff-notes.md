# Phase 4 handoff notes

Phase 4 reviewed and hardened the completed Extraction Dataset feature without expanding its scope.

- Active Runs now stop after the owner-scoped identity/status read, so Extraction Results from successful Scrape Jobs are not loaded only to return the required `409`. Terminal Runs still use the full ordered, successful-only projection with a fixed query count and no per-Job loop.
- The Scrape Jobs card action now stacks below its heading and spans the card width on narrow screens, while retaining the existing top-right desktop placement. Enabled, disabled, and preparing controls share the responsive behavior.
- Route coverage now verifies safe `500` handling for both JSON and `fast-csv` failures. Frontend coverage also verifies safe recovery when object-URL creation or the browser download handoff fails, including link and object-URL cleanup.
- Privacy review found no extracted values, file bodies, raw exceptions, or complete datasets entering logs or caches. Shared path and filename helpers remain the single source for server/client behavior; no obsolete mocks or duplicate helpers were found.
- The accepted in-memory generation and unchanged CSV formula-value risks remain explicit in the specification and serializer tests. A manual serializer probe covered Unicode, commas, quotes, CRLF multiline content, nulls, and formula-like values, confirming JSON UTF-8/no BOM and CSV UTF-8 BOM/CRLF behavior.

Automated frontend tests cover enabled, disabled, loading, warning, keyboard-menu, and keyboard-tooltip states. Final verification passed: 36 test files and 579 tests, plus typecheck and lint.
