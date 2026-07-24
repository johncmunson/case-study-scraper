# Case Study Scraper Landing Page Scope

## 1. Purpose

Replace the placeholder root page at `/` with a focused public landing page for **Case Study Scraper**.

The page should help a Researcher understand the product, see how a few Example Pages become a structured Extraction Dataset, and proceed to the existing Google sign-in flow. It should lead with case studies, customer stories, and recent-project pages while making the broader repeated-page capability apparent.

This document scopes the landing page only. It does not redesign the sign-in page or authenticated application.

## 2. Product positioning

### Primary audience

The initial audience is:

- Dedicated Researchers.
- Agency growth teams compiling market, competitor, or prospect datasets.

The root `CONTEXT.md` is authoritative for domain language. **Researcher** is the umbrella term for these users.

### Primary promise

The landing page should communicate one concrete transformation:

> Provide a few Example Pages and the fields to collect. Case Study Scraper finds pages with matching URL patterns and turns their contents into a structured dataset.

The product is positioned primarily for:

- Case studies.
- Customer stories.
- Recent-project pages and project portfolios.

Its ability to process other repeated page types is a secondary message, not the headline category.

### Claim boundaries

The page must not promise:

- Exhaustive discovery or complete site coverage.
- Guaranteed accuracy.
- A specific completion speed.
- A supported page or job volume.
- Free or unlimited usage.

Avoid words such as **every**, **all**, **complete**, and **guaranteed** when describing page discovery. Firecrawl mapping and AI-assisted filtering do not establish exhaustive coverage.

AI is supporting implementation detail. The headline should emphasize the resulting dataset, while the workflow may describe page matching and extraction as AI-assisted.

## 3. Goals

- Establish **Case Study Scraper** as the customer-facing product name.
- Explain the product accurately without requiring scraping expertise.
- Show the input-to-output workflow above the fold.
- Emphasize a structured, source-linked Extraction Dataset rather than scraping mechanics.
- Convert signed-out visitors into the existing self-service authentication flow.
- Give signed-in visitors a direct route back to the application without hiding the public page.
- Demonstrate that repeated page types beyond case studies are supported.
- Replace the landing route's Create Next App metadata.
- Preserve the accessibility and responsive standards established by the application.

## 4. Scope

### In scope

- A single conversion-focused page at `/`.
- A responsive public header and text wordmark.
- Session-aware account CTA presentation.
- Hero copy and actions.
- A static input-to-dataset product preview.
- A three-step workflow section.
- An Extraction Dataset output section.
- A secondary repeated-page use-case section.
- A final conversion CTA.
- A minimal footer with owner-supplied Privacy and Terms destinations.
- Route title and description metadata.
- Focused tests for content, links, and signed-in/signed-out variants.

### Out of scope

- A broader marketing site.
- Separate pricing, documentation, examples, blog, or contact routes.
- Drafting Privacy or Terms policies.
- A sign-in-page redesign.
- Changes to authenticated application surfaces.
- Billing, entitlements, usage limits, or pricing claims.
- Testimonials, customer logos, usage statistics, and performance benchmarks.
- Analytics or conversion-tracking providers.
- A custom logo or full brand-identity system.
- A social-sharing image.
- Dark mode or a theme toggle.
- Autoplaying demos, video, scroll-driven effects, or decorative entrance animation.
- An interactive scraper demo or unauthenticated Scrape Run creation.
- Product capability changes.

## 5. Information architecture

The page should use this sequence:

1. Public header.
2. Hero and input-to-dataset preview.
3. Three-step workflow.
4. Extraction Dataset output.
5. Broader repeated-page use cases.
6. Final CTA.
7. Minimal footer.

Do not add testimonials, a pricing section, a blog feed, or a large FAQ.

### 5.1 Header

The header contains:

- Text wordmark: **Case Study Scraper**.
- Anchor links to **How it works**, **Output**, and **Use cases** where viewport space permits.
- Signed-out utility action: **Sign in** → `/sign-in`.
- Signed-out primary action: **Get started** → `/sign-in`.
- Signed-in primary action: **Open app** → `/app/scrape-runs`.

Authenticated visitors remain on the landing page. Do not redirect them automatically. Do not briefly render signed-out actions while session state is being determined.

The small-screen header should remain simple. It does not require a custom navigation drawer solely for three optional section links.

### 5.2 Hero

Use this headline:

> **Turn case studies into structured datasets.**

Use supporting copy based on:

> Provide a few example pages and the fields you need. Case Study Scraper finds pages with matching URL patterns and extracts the information into CSV or JSON.

Hero actions:

- Primary: **Get started** → `/sign-in`.
- Secondary: **See how it works** → the workflow section.

For authenticated visitors, the primary action becomes **Open app** → `/app/scrape-runs`. The secondary section anchor remains available.

The hero should not carry beta, pricing, “free,” or “AI-powered” badges.

### 5.3 Static product preview

The primary hero visual is a polished, static input-to-dataset composition—not a dashboard screenshot or abstract illustration.

It should communicate:

1. A Target Site and a few Example Pages.
2. User-selected Extraction Fields.
3. Matching Pages becoming structured records.
4. Source-linked output suitable for CSV or JSON.

Use a fictional agency and fictional project names. Reserved `.example` hostnames should make the demonstration clearly non-production. Do not use real customer logos, real company data, or fabricated customer relationships.

Use these Extraction Fields consistently:

- Client.
- Industry.
- Services.
- Outcome.

The preview is illustrative and non-interactive. It must not contain controls or links that appear functional but do nothing. Its information should remain understandable on small screens, using stacked records rather than forcing the full desktop composition into a narrow viewport.

### 5.4 Three-step workflow

Use the following conceptual steps:

1. **Show what matches** — Provide the Target Site and a few Example Pages.
2. **Choose what to collect** — Define the Extraction Fields wanted from each Matching Page.
3. **Review and download** — Inspect successful or failed Scrape Jobs, then download the successful Extraction Results as CSV or JSON.

Do not say that users “train the AI.” Example Pages demonstrate the relevant URL structure; they do not train a model.

Exact configuration limits—2–5 Example Pages, 1–10 Extraction Fields, one Target Site, one Primary Identifier, and one Active Scrape Run—belong in run creation rather than landing-page copy.

### 5.5 Extraction Dataset output

This section should make the output tangible and emphasize:

- Structured values under the Researcher’s chosen fields.
- The Canonical Page URL retained with each successful record.
- CSV using user-facing Field Labels.
- JSON using stable Field Keys.
- Reviewable Scrape Job outcomes before download.

The page must not imply that an Extraction Dataset includes failed records, raw page content, provider responses, screenshots, operational logs, or a full Scrape Run archive. Downloads are available after a run is terminal and contain successful Extraction Results.

### 5.6 Broader use cases

Introduce the secondary message with copy based on:

> **Built for case studies. Flexible enough for other repeated page types.**

Use four concrete examples:

- **Customer stories:** client, industry, services, outcomes.
- **Project portfolios:** client, location, project type, scope.
- **Team profiles:** name, role, specialties.
- **Location pages:** address, region, contact details.

This section should demonstrate flexibility without repositioning the product as a generic web scraper.

### 5.7 Final CTA

Restate the outcome concisely and provide one primary action:

- Signed out: **Get started** → `/sign-in`.
- Signed in: **Open app** → `/app/scrape-runs`.

Do not add an email-capture form, waitlist, sales-contact flow, or “start free” language.

### 5.8 Footer

Keep the footer minimal:

- **Case Study Scraper** text wordmark or product name.
- Privacy link.
- Terms link.

Valid Privacy and Terms destinations are an owner-supplied launch dependency. Do not ship broken placeholders or invent legal assurances. Drafting the policies is outside this scope.

## 6. Visual direction

Use a restrained editorial research-tool aesthetic that extends the authenticated application rather than introducing an unrelated brand system.

### Foundation

- Light theme only.
- Neutral ink-and-paper palette.
- One muted blue accent for actions and data flow.
- Existing Geist and Geist Mono typography.
- Crisp cards, tables, labels, and subtle grid or rule details.
- Existing shadcn/ui components and semantic design tokens wherever suitable.
- Text wordmark only: **Case Study Scraper**.

### Avoid

- AI gradients and glowing effects.
- Stock photography.
- Decorative 3D artwork.
- Fake browser chrome that overwhelms the product preview.
- Excessive card stacking or generic feature-icon grids.
- A bespoke logo project.

### Motion

Limit motion to restrained hover, focus, and small CSS transitions. The page and product preview should communicate fully while static. Respect reduced-motion preferences for any nonessential transition.

## 7. Access and availability language

Case Study Scraper is open self-service. The page should present it as the product it is without describing it as a beta.

Use:

- **Get started**.
- **Sign in**.
- **Open app** for authenticated visitors.

Do not use:

- Request access.
- Join the waitlist.
- Open beta.
- Get started free.
- Free forever.
- Unlimited.

Google remains the existing authentication mechanism, but the landing page does not need to foreground the provider. The sign-in page owns provider-specific authentication copy.

## 8. Metadata

Define landing-route metadata as:

```text
Title: Case Study Scraper — Turn Case Studies into Structured Data
Description: Find matching case studies, customer stories, and project pages, extract the fields you need, and download a sourced CSV or JSON dataset.
```

Do not add a social-sharing image in this scope. Metadata changes should be limited to what is necessary for the landing route; unrelated route metadata cleanup is out of scope.

## 9. Accessibility and responsive requirements

- Use one descriptive `h1` and a logical heading hierarchy.
- Use semantic header, navigation, main, section, and footer landmarks.
- Ensure section-anchor navigation lands below any sticky header and preserves visible keyboard focus.
- Provide visible focus treatment for every interactive element.
- Do not communicate data flow, status, or meaning through color alone.
- Treat decorative connectors and icons as hidden from assistive technology.
- Give the illustrative dataset an accessible name and meaningful reading order.
- Do not expose fictional source URLs as interactive links unless they have a valid destination.
- Maintain readable line lengths and sufficient color contrast.
- Prevent long labels, URLs, and field values from breaking the layout.
- Preserve the information hierarchy from small mobile screens through wide desktop layouts.
- Meet reduced-motion preferences without losing content.

## 10. Implementation boundaries

- Keep the root route compatible with the existing Next.js Server Component architecture.
- Use the existing server-side session helper to select signed-in or signed-out CTAs; do not introduce client-side session synchronization solely for the landing page.
- Use existing shadcn/ui primitives from `components/ui` before creating landing-specific primitives.
- Landing-specific components may be extracted when they have a focused responsibility; do not create a generic marketing component framework.
- Do not add direct `useEffect` usage.
- Do not introduce a new data-fetching library, animation package, theme provider, analytics provider, or global state.
- Keep fictional demonstration data local and static.
- Do not modify authentication behavior, Scrape Run behavior, backend contracts, or the authenticated application.

Before implementation, consult the exact installed Next.js documentation under `node_modules/next/dist/docs/` for route metadata, Server Components, and request/session-driven rendering.

## 11. Verification

Focused automated coverage should verify:

- The agreed headline and core supporting copy render.
- Signed-out navigation and hero CTAs point to `/sign-in`.
- Signed-in account and hero CTAs point to `/app/scrape-runs`.
- Signed-in visitors are not redirected away from `/`.
- Workflow and section anchors target valid element IDs.
- The broader use-case examples and output formats are present.
- Fictional preview content does not create nonfunctional interactive controls.
- Landing metadata uses the agreed title and description.

Manual browser verification should cover:

- Small mobile, tablet, desktop, and wide desktop layouts.
- Keyboard navigation and visible focus.
- Long preview values and URLs.
- Anchor positioning.
- Signed-in and signed-out header/hero variants.
- Reduced-motion behavior.
- Contrast and readability in the light theme.

Run the repository's existing test, typecheck, and lint commands after implementation. Do not run Prettier.

## 12. Acceptance criteria

The landing-page scope is complete when:

1. `/` presents Case Study Scraper with the agreed positioning and headline.
2. Case studies, customer stories, and recent-project pages are clearly the primary use case.
3. The page makes broader repeated-page support apparent without leading as a generic scraper.
4. The hero contains a responsive, static input-to-dataset preview using fictional agency data.
5. The page accurately explains the three-step workflow without “training” language.
6. The Extraction Dataset section communicates chosen fields, source URLs, and CSV/JSON output accurately.
7. No unsupported coverage, accuracy, speed, scale, pricing, or privacy claim appears.
8. Signed-out visitors can use **Get started** or **Sign in** to reach `/sign-in`.
9. Signed-in visitors remain on the landing page and receive an **Open app** action to `/app/scrape-runs`.
10. The page uses the agreed single-page structure and restrained light-theme visual direction.
11. The page is responsive, keyboard accessible, and understandable without color or motion.
12. The landing route exposes the agreed title and description metadata.
13. No social proof, pricing, analytics, dark mode, social image, interactive demo, or adjacent product redesign is introduced.
14. Privacy and Terms links use valid owner-supplied destinations before public launch.
15. Focused tests and repository verification pass.

## 13. Explicit decisions and tradeoffs

- Narrow case-study positioning is preferred over a broad extraction category because it gives the product and audience a concrete initial use case. Broader capability remains visible as a secondary message.
- A purpose-built input-to-dataset preview is preferred over a dashboard screenshot because it communicates the transformation above the fold without requiring existing marketing assets.
- Open self-service is presented without beta or free language, preserving room for later pricing decisions.
- Exact product limits are deferred to run creation so landing copy remains outcome-focused.
- Social proof is omitted until verified evidence exists.
- AI is supporting workflow language rather than headline positioning.
- The public page remains available to authenticated visitors; personalized CTAs are preferred over an automatic redirect.
- A text wordmark and existing design system are sufficient for this scope; a bespoke identity would delay the core page without proving value.
- Analytics is deferred until a provider and privacy approach are intentionally selected.
- No ADR is needed because these marketing and presentation choices are local, visible, and reasonably reversible.
