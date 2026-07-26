# Markdown Views for Scrape Job Results

## High-level design

### Purpose

Allow a Researcher to switch an individual extracted value between its exact raw text and safely rendered CommonMark on the Scrape Job detail page. The raw value remains authoritative and is always shown by default.

### Scope

This is a client-side presentation change to `components/scrape-runs/scrape-job-result.tsx` and its frontend tests. `react-markdown` is already installed. No Create New Scrape Run input, API contract, persistence, database change, or `remark-gfm` dependency is required.

### Candidate rule

A non-null extracted value is a **Markdown Candidate** exactly when:

```ts
;(value.length > 250 && /[\r\n]/.test(value)) || field.key.includes("markdown")
```

The test is per extracted value. Exactly 250 characters does not satisfy the length condition. A Field Key containing `markdown` qualifies any non-null value regardless of length or newlines. Missing Values remain **Not found**.

### Interaction and layout

- Every field item reserves an upper-right icon-button position opposite its Field Label.
- Candidates receive an interactive button; non-candidates receive the same button in the DOM as an invisible, non-focusable, accessibility-hidden placeholder.
- Raw mode uses an `Eye` icon, outline styling, and the tooltip/accessibility name **Render Markdown**.
- Rendered mode uses a `Code2` icon, highlighted secondary styling, and **Show raw text**.
- Each value owns independent `useState(false)` state. State is ephemeral and resets when the page or Scrape Job remounts. No `useEffect` is used.
- Required/Optional and Primary Identifier badges move below the Field Label.
- Preserve the existing responsive layout: metadata and value use two columns on wider screens and stack on narrow screens.

### Rendering and safety

- Render only when the candidate is toggled on; otherwise render the original string unchanged with preserved whitespace.
- Use `react-markdown` with CommonMark only. Ordinary single newlines follow CommonMark semantics and are not converted automatically to `<br>`.
- Do not enable `rehype-raw`; embedded HTML must never become live HTML.
- Never render Markdown images as `<img>`. Show alt text and a clickable source link instead.
- Preserve `react-markdown`'s safe URL filtering. Resolve accepted relative links and image sources against the Scrape Job's Canonical Page URL.
- Open HTTP(S) links in a new tab with `rel="noopener noreferrer"`; preserve normal behavior for non-web links such as `mailto:`.
- Remap Markdown headings as `h1 → h4`, `h2 → h5`, and `h3`–`h6 → h6` with compact field-level styling.
- Wrap prose, links, and inline code. Preserve fenced-code whitespace and allow horizontal scrolling.

## Phased implementation plan

### Phase 1 — Candidate behavior and field layout

**Scope**

Update the Extraction Result field renderer and its direct frontend tests. Do not add Markdown rendering yet.

**Objectives / success criteria**

- Add a small pure candidate predicate implementing the exact rule above.
- Give each field value an isolated child component with event-driven `useState(false)` state and no effects.
- Move badges below the Field Label.
- Add the fixed upper-right action area without changing the existing desktop/mobile layout.
- Render `Eye` and **Render Markdown** for candidates in their initial raw state.
- Render a structurally equivalent but invisible, non-interactive, `aria-hidden`, `tabIndex={-1}` placeholder for non-candidates and Missing Values.
- Keep raw text byte-for-byte equivalent at the React text-content level, including newlines.

**Testing requirements**

Extend `tests/frontend/scrape-job-result.test.tsx` to verify:

- A 251-character value with CR, LF, or CRLF qualifies; 250 characters or a long single-line value does not.
- A short non-null value qualifies when its Field Key contains `markdown`.
- Matching is against Field Key, not Field Label.
- A `null` value still shows **Not found** and has no accessible action.
- Candidate controls are accessible; placeholders are absent from the tab order and accessibility tree but remain in the DOM.
- Badges follow the label and the responsive field structure remains intact.

### Phase 2 — Safe CommonMark rendering

**Scope**

Wire the candidate action to `react-markdown` and define compact, safe element overrides in the result component. Do not add GFM or raw-HTML plugins.

**Objectives / success criteria**

- Clicking **Render Markdown** replaces only that value's raw presentation with rendered CommonMark.
- The button changes to `Code2`, **Show raw text**, and secondary styling; clicking it restores the exact raw value.
- Toggling one value does not affect another.
- Render headings, paragraphs, lists, block quotes, links, inline code, fenced code, and thematic breaks with bounded field-level styles.
- Apply the agreed heading remapping and code overflow behavior.
- Resolve safe relative URLs against `job.url`; reject URLs blocked by `react-markdown`'s default safety policy.
- Apply new-tab attributes only to resolved HTTP(S) links.
- Replace Markdown images with alt text and a safe source link; no `<img>` request may be emitted.
- Embedded HTML never creates live elements.

**Testing requirements**

Add interaction and semantic assertions covering:

- Raw-by-default behavior and both button states.
- Independent state for two candidate values.
- CommonMark emphasis, links, lists, headings, and fenced code.
- Heading remapping and scrollable fenced code.
- CommonMark single-newline behavior.
- Relative-link resolution against the Canonical Page URL.
- Safe HTTP(S) new-tab attributes and normal `mailto:` behavior.
- Unsafe URL rejection, inert embedded HTML, and absence of `<img>` elements.
- Restoration of the original raw text after toggling back.

### Phase 3 — Regression and completion

**Scope**

Validate the complete Scrape Job detail experience and repository quality gates. Make only fixes required by this feature.

**Objectives / success criteria**

- Existing complete, failed, cancelled, loading, polling, and Missing Value behavior remains unchanged outside the Extraction Result presentation.
- Long labels, descriptions, raw values, rendered prose, links, and code do not overflow their cards unexpectedly.
- No backend, route, runtime-contract, or Create New Scrape Run behavior changes.
- `CONTEXT.md` continues to define Markdown Candidate as a per-value presentation concept; no ADR is needed because the decision is inexpensive to reverse.

**Testing requirements**

Run:

```sh
pnpm test:frontend -- tests/frontend/scrape-job-result.test.tsx tests/frontend/scrape-job-detail-view.test.tsx
pnpm typecheck
pnpm lint
```

Then run `pnpm test:frontend` if targeted tests pass. Do not run Prettier. Resolve all feature-related failures before completion.
