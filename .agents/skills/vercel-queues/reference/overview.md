# Vercel Queues

Vercel Queues is a durable event streaming system built for serverless applications. You publish messages to topics, and independent consumer groups process them in parallel with automatic retries, sharding, and delivery guarantees.

Each topic is a durable, append-only log that retains messages until they expire. Messages fan out to every consumer group subscribed to the topic, and new consumer groups can join at any time to replay non-expired history.

Vercel Queues is useful when you need to:

- Defer expensive work: Offload tasks like sending emails, generating PDFs, or calling external APIs so your response returns fast.
- Absorb traffic spikes: Buffer incoming requests and process them at a controlled rate.
- Guarantee delivery: Make sure work completes even if a function crashes or a deployment rolls out.
- Schedule tasks: Delay message delivery by up to the retention period.
- Deduplicate messages: Use idempotency keys to prevent duplicate processing.
- Isolate consumers: Process the same messages in multiple independent pipelines without interference.

Vercel Queues is the lower-level primitive that powers [Vercel Workflows](/docs/workflows). Workflows provides a higher-level SDK with durable steps, sleep, and hooks that makes building multi-step applications more ergonomic. If you need direct control over message publishing, consumption, and routing, use the [Queues SDK](/docs/queues/sdk) directly. If you're building stateful multi-step workflows, start with [Workflows](/docs/workflows).

## Features

- [Durable delivery](/docs/queues/concepts): Persist messages with retries and visibility timeouts for reliable processing.
- [Fan-out consumers](/docs/queues/concepts): Send one message stream to multiple independent consumer groups without coordination.
- [Push and poll modes](/docs/queues/poll-mode): Process on Vercel with push callbacks or run your own workers.
- [Automatic scaling](/docs/queues/concepts): Scale producers and consumers without managing partitions or throughput capacity.
- [SDK and API](/docs/queues/sdk): Publish and consume with the SDK or HTTP API.
- [Observability](/docs/queues/observability): Monitor queue throughput, message age, and consumer performance.
