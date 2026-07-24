# Case Study Scraper

This context describes how users discover, extract, and retain structured information from pages that share a common structure. Its primary use case is case studies, customer stories, and recent-project pages, while Matching Pages may represent any repeated page type.

## Language

**Researcher**:
A user who builds market, competitor, or prospect datasets from case studies and other repeated page types. Researchers include dedicated research roles and agency growth teams.
_Avoid_: Scraper, operator

**Scrape Run**:
A user-initiated attempt to identify matching pages on one target site and extract the same structured fields from each page.
_Avoid_: Crawl, scrape request

**Active Scrape Run**:
A scrape run that has been accepted but has not reached a terminal outcome. A user may have at most one active scrape run.
_Avoid_: Running job, queued run

**Run Configuration**:
The immutable Target Site, Example Pages, and Extraction Fields captured when a scrape run is accepted.
_Avoid_: Current settings, editable run

**Run Preparation**:
The required work that maps the target site, identifies matching pages, and establishes the scrape jobs before extraction begins.
_Avoid_: Scraping, job processing

**Run Stage**:
One of the three sequential phases of a scrape run: Mapping, Filtering, or Scraping.
_Avoid_: Workflow step, scrape job

**Skipped Stage**:
A run stage that cannot execute because an earlier stage failed. It is distinct from user-requested cancellation.
_Avoid_: Cancelled stage, failed stage

**Cancellation Request**:
A user’s instruction to stop an active scrape run. The run remains active until in-flight work is contained and cancellation finishes.
_Avoid_: Cancelled run, immediate termination

**Run Status**:
The current lifecycle classification determined by preparation and scrape-job outcomes. Mixed successful and failed jobs produce a completed scrape run.
_Avoid_: Workflow status, manually assigned outcome

**Target Site**:
The exact hostname identified by the run’s target URL. Subdomains and unrelated hosts are outside the scrape run’s scope.
_Avoid_: Domain family, parent domain

**Site URL Set**:
The complete collection of URLs on the target site that a scrape run considers when identifying matching pages.
_Avoid_: Discovered URLs, partial URL list

**Canonical Page URL**:
A page identity consisting of its normalized HTTP or HTTPS origin and path; query strings and fragments do not distinguish pages.
_Avoid_: Raw URL, tracking URL

**Example Page**:
A user-confirmed matching page that demonstrates the URL pattern for a scrape run and is always selected for extraction.
_Avoid_: Training URL, optional example

**Matching Page**:
A page whose Canonical Page URL follows the same structural pattern as the run’s Example Pages and is therefore selected for extraction.
_Avoid_: Similar page, filtered URL

**Scrape Job**:
The extraction attempt for one matching page within a scrape run.
_Avoid_: Scrape run, workflow step

**Extraction Field**:
A user-defined item to collect from every matching page. An extraction field may be required or optional.
_Avoid_: JSON property, column

**Field Label**:
The user-facing name of an extraction field, composed of ASCII letters, numbers, and single spaces between words.
_Avoid_: Field key, JSON property

**Field Key**:
The stable, machine-readable `snake_case` identity derived from an extraction field’s display label when a scrape run is created.
_Avoid_: Label, JSON path

**Required Extraction Field**:
An extraction field whose absence causes its scrape job to fail.
_Avoid_: Schema-required property

**Missing Value**:
A `null` extraction result indicating that a field was not found on the page; omitted, empty, and whitespace-only results are normalized to this value.
_Avoid_: `NOT_FOUND`, absent property, empty string

**Extraction Result**:
The normalized user-defined values produced by a successful scrape job. Firecrawl response metadata and page content are not part of the result.
_Avoid_: Metadata, raw response, page content

**Markdown Candidate**:
A non-null value within one Extraction Result that is eligible to be viewed as rendered Markdown based on that value’s content shape or its Extraction Field’s Field Key. Classification applies only to that individual value, and raw text is its default presentation.
_Avoid_: Markdown field, run-wide Markdown field

**Extraction Dataset**:
The collection of successful Extraction Results from one Scrape Run, with each result associated with its Canonical Page URL. Run configuration, lifecycle state, and failure diagnostics are not part of the dataset.
_Avoid_: Full scrape run, operational archive

**Primary Identifier**:
The required extracted field used to name and reference a successful result. Its value is not required to be unique within a scrape run.
_Avoid_: Unique key, database identifier
