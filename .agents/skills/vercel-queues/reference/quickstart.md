# Quickstart

This guide shows how to send your first queue message and process it with the `@vercel/queue` SDK.

AI Assistance

Help me set up Vercel Queues in this project. First, make sure the Vercel CLI is installed (\`npm i -g vercel\`). If I'm using Claude Code or Cursor, install the Vercel Plugin (\`npx plugins add vercel/vercel-plugin\`). For other agents, install Vercel Skills (\`npx skills add vercel-labs/agent-skills\`). Then: 1. Install @vercel/queue. 2. Run \`vercel link\` and \`vercel env pull\` to get OIDC credentials. 3. Create a producer route that sends messages to an 'orders' topic using the send function. 4. Create a consumer route at app/api/queues/fulfill-order/route.ts that processes messages using handleCallback. 5. Configure vercel.json with a queue trigger for the consumer route. 6. Test locally with \`vercel dev\`.

Show more

In this quickstart:

- Your API route acts as a producer. It sends work to a queue topic.
- The topic (`orders`) stores messages durably until a consumer processes them.
- A second route acts as a consumer. Vercel invokes it automatically in push mode.

## Prerequisites

- A Vercel account
- [Vercel CLI](/docs/cli) installed (`npm i -g vercel`)
- Node.js 22+

1. ### Install the SDK
   
   Install `@vercel/queue` so your app can send messages and receive push callbacks.
   
   Terminal
   
   ![](https://7nyt0uhk7sse4zvn.public.blob.vercel-storage.com/docs-assets/static/topics/icons/pnpm.svg)pnpmbunyarnnpm
   
   ```
   pnpm i @vercel/queue
   ```
   
   ```
   yarn add @vercel/queue
   ```
   
   ```
   npm i @vercel/queue
   ```
   
   ```
   bun add @vercel/queue
   ```
   
2. ### Link your Vercel project and pull credentials
   
   The SDK authenticates via [OIDC](/docs/oidc). Link your project if you haven't already, then pull environment variables so the SDK can authenticate during local development:
   
   Terminal
   
   ```
   vercel link
   vercel env pull
   ```
   
   This creates a `.env.local` file containing the OIDC tokens the SDK needs to connect to Vercel Queues from your machine. Without it, local calls to `send` and `handleCallback` can't authenticate. When you deploy to Vercel, authentication is automatic and no environment setup is needed.
   
3. ### Send a message anywhere in your app
   
   Import `send` directly from `@vercel/queue` and call it from any server-side context: a route handler, a Server Action, a [Workflow](/docs/workflows) step, or an error handler.
   
   app/cart/checkout/route.ts
   
   ```
   import { send } from '@vercel/queue';
    
   export async function POST(request: Request) {
     const order = await request.json();
     const { messageId } = await send('orders', order);
     return Response.json({ messageId });
   }
   ```
   
4. ### Handle incoming messages with a route handler
   
   app/api/queues/fulfill-order/route.ts
   
   ```
   import { handleCallback } from '@vercel/queue';
    
   export const POST = handleCallback(async (order, metadata) => {
     // await chargePayment(order);
     // await sendConfirmationEmail(order);
     console.log('Fulfilling order', metadata.messageId, order);
   });
   ```
   
5. ### Configure vercel.json
   
   Add a consumer trigger to wire your route to a topic. This makes the route private: it has no public URL and only Vercel's queue infrastructure can invoke it.
   
   vercel.json
   
   ```
   {
     "functions": {
       "app/api/queues/fulfill-order/route.ts": {
         "experimentalTriggers": [{ "type": "queue/v2beta", "topic": "orders" }]
       }
     }
   }
   ```
   

The top-level `send` and `handleCallback` use an auto-configured default client. The region is detected from the `VERCEL_REGION` environment variable, which Vercel sets on every deployment. If the region can't be detected (for example, during local development), it falls back to `iad1`.

To target a specific region when sending, pass the `region` option:

```
await send('orders', payload, { region: 'sfo1' });
```

If your handler crashes after charging payment but before sending the email, Vercel redelivers the message so the email still goes out. If the email call fails, the message comes back and your handler runs again. Make each step idempotent (for example, pass an idempotency key to your payment provider) so retries are safe.

This works locally with `next dev` or `vercel dev` so you can test without deploying.

## What you just did

1. Installed the SDK: Added `@vercel/queue` to your project.
2. Created a producer: Published messages to the `orders` topic.
3. Configured a consumer: Registered a push trigger and handler to process messages.
