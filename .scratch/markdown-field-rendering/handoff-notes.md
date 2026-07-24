# Markdown Candidate rendering handoff

## Phase 1

Phase 1 is complete. `ScrapeJobResult` now classifies each non-null Extraction Result value with the exact candidate rule, renders each field through an isolated client child with local event-driven state, and reserves a fixed action position beside the Field Label. Candidate actions use the outline `Eye` button with the **Render Markdown** tooltip/accessibility name; Missing Values and non-candidates keep an invisible, disabled, `aria-hidden`, `tabIndex={-1}` button in the DOM. Badges now sit below the label, while the existing responsive metadata/value grid and exact raw text presentation are preserved.

Frontend coverage now includes the 250/251-character boundary, LF/CR/CRLF, long single-line values, Field Key versus Field Label matching, Missing Values, accessible controls and inert placeholders, badge order, responsive classes, and raw CRLF text identity.

No plan deviations or implementation blockers arose. For Phase 2, `ExtractionResultField` already owns the per-value boolean state; its setter is wired to the candidate button, but Phase 1 intentionally does not consume the boolean or change the raw presentation. Phase 2 should name/consume that state to select the `react-markdown` view and swap the action to `Code2` / **Show raw text** without introducing an effect.

## Phase 2

Phase 2 is complete. Each Markdown Candidate now toggles independently between its exact raw value and safe CommonMark rendered by `react-markdown`, with the requested `Eye`/outline and `Code2`/secondary action states. Compact overrides cover remapped headings, prose, lists, block quotes, thematic breaks, links, inline code, and horizontally scrollable fenced code without adding GFM or raw-HTML plugins.

URL handling first applies `react-markdown`'s default safety filter, then resolves accepted relative links and image sources against the Scrape Job's Canonical Page URL. HTTP(S) links open in a new tab, non-web links retain normal behavior, unsafe destinations lose their link target, images are replaced by alt text plus a safe source link, and embedded HTML remains inert text.

Frontend tests now cover toggle state and raw restoration, independent values, CommonMark semantics and compact layout classes, heading remapping, single-newline behavior, relative and protocol-specific links, unsafe URLs and HTML, and image suppression. No plan deviations or implementation blockers arose. One repository detail for Phase 3: the documented `pnpm test:frontend -- <files>` command currently runs all frontend tests rather than filtering to those files; the full frontend suite nevertheless passed.
