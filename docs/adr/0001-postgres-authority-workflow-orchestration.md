# Separate scrape domain state from Workflow execution state

PostgreSQL owns the product’s business lifecycle, invariants, scrape-job records, and extraction results; Vercel Workflow owns durable execution state, orchestration, retries, and cancellation acknowledgement. We do not reproduce Workflow’s event history, instruction pointer, or retry machinery in PostgreSQL. Workflow steps must instead be idempotent and use conditional domain transitions, and individual scrape jobs are scheduled as Workflow steps rather than duplicated in a separate application queue.
