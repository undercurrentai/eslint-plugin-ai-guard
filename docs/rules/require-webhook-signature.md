# require-webhook-signature

**Category:** Security | **Severity:** `warn` (recommended, security), `error` (strict)

---

## What it does

Flags route handlers that appear to receive third-party webhook deliveries but never call a recognized signature-verification function. The rule looks at:

- **Filename / route path** — anything matching `webhookRoutePatterns` (defaults: `**/webhook/**`, `**/webhooks/**`, `**/*-webhook/**`, `app/api/webhook/route.ts`, `app/api/webhooks/**`).
- **Imports** — when a known webhook SDK is imported (`stripe`, `@octokit/webhooks`, `svix`, `@slack/events-api`), the rule activates for any handler in that file.

Recognized verification functions include:

- **Stripe** — `stripe.webhooks.constructEvent(...)`, `Stripe.webhooks.signature.verifyHeader(...)`
- **GitHub** — `@octokit/webhooks` `webhooks.verify(...)`, `verifyAndReceive(...)`, `crypto.timingSafeEqual(...)` against `x-hub-signature-256`
- **Svix** — `wh.verify(payload, headers)` where `wh` is a `Webhook` instance
- **Slack** — `verifyRequestSignature(...)`, `SignatureVerification.verify(...)`

Custom verification function names can be added via `verificationFunctions`.

## Why it matters

A webhook endpoint that does not verify the signature on the incoming request is functionally **a public, unauthenticated `POST` that mutates your data**. An attacker who learns the URL (often guessable, often public on GitHub Issues / Stack Overflow) can:

- Forge fake "payment succeeded" events from Stripe and unlock paid features.
- Forge fake "push" events from GitHub and trigger CI/CD pipelines on attacker-controlled commits.
- Forge fake user.created events from your auth provider and provision tenants.

AI tools generate webhook handlers that focus on parsing the payload and updating state — the signature step requires reading provider docs and is frequently skipped or done wrong (using `req.body` after `express.json()` has parsed it, instead of the raw body the signature is computed against).

## ❌ Bad Example

```typescript
// Stripe — body is parsed JSON, no constructEvent call. Anyone can forge events.
app.post('/webhook/stripe', express.json(), async (req, res) => {
  const event = req.body; // ← unverified
  if (event.type === 'checkout.session.completed') {
    await provisionAccount(event.data.object.customer);
  }
  res.json({ received: true });
});

// GitHub — no signature check against x-hub-signature-256
app.post('/webhooks/github', express.json(), async (req, res) => {
  const { action, pull_request } = req.body;
  if (action === 'opened') {
    await runCI(pull_request.head.sha); // ← attacker can trigger CI on any SHA
  }
  res.json({ ok: true });
});

// Svix — webhook deserialized but never verified
import { Webhook } from 'svix';
app.post('/webhook/clerk', express.json(), async (req, res) => {
  const event = req.body; // ← Webhook imported but verify() never called
  await syncUser(event.data);
  res.json({ ok: true });
});

// Slack — slash command handler with no signature check
app.post('/slack/events', express.json(), async (req, res) => {
  if (req.body.type === 'event_callback') {
    await handleSlackEvent(req.body.event); // ← unverified
  }
  res.status(200).send();
});
```

## ✅ Good Example

```typescript
// Stripe — raw body + constructEvent
import express from 'express';
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }), // ← raw body required for signature
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }
    if (event.type === 'checkout.session.completed') {
      await provisionAccount((event.data.object as Stripe.Checkout.Session).customer);
    }
    res.json({ received: true });
  }
);

// GitHub — @octokit/webhooks verify
import { Webhooks } from '@octokit/webhooks';
const webhooks = new Webhooks({ secret: process.env.GITHUB_WEBHOOK_SECRET! });

app.post('/webhooks/github', express.json(), async (req, res) => {
  const signature = req.headers['x-hub-signature-256'] as string;
  const verified = await webhooks.verify(JSON.stringify(req.body), signature);
  if (!verified) return res.status(401).send('Invalid signature');
  // ... handle event
  res.json({ ok: true });
});

// Svix — wh.verify before reading payload
import { Webhook } from 'svix';
app.post('/webhook/clerk', express.raw({ type: 'application/json' }), async (req, res) => {
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);
  let event: any;
  try {
    event = wh.verify(req.body, {
      'svix-id': req.headers['svix-id'] as string,
      'svix-timestamp': req.headers['svix-timestamp'] as string,
      'svix-signature': req.headers['svix-signature'] as string,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  await syncUser(event.data);
  res.json({ ok: true });
});

// Slack — verifyRequestSignature
import { verifyRequestSignature } from '@slack/events-api';
app.post('/slack/events', express.raw({ type: 'application/json' }), async (req, res) => {
  const isValid = verifyRequestSignature({
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    requestSignature: req.headers['x-slack-signature'] as string,
    requestTimestamp: Number(req.headers['x-slack-request-timestamp']),
    body: req.body.toString(),
  });
  if (!isValid) return res.status(401).send('Invalid signature');
  const payload = JSON.parse(req.body.toString());
  if (payload.type === 'event_callback') await handleSlackEvent(payload.event);
  res.status(200).send();
});
```

## How to fix

1. **Read the raw request body** — most signature schemes are computed over the exact bytes the provider sent, so `express.json()` / `body-parser.json()` will corrupt the input. Use `express.raw({ type: 'application/json' })` (Express), `addContentTypeParser` with raw mode (Fastify), or `await req.text()` (Next.js App Router) before passing to the verifier.
2. **Call the provider's verify function** — never roll your own HMAC unless you know exactly what you are doing and have a constant-time comparison.
3. **Reject on failure** — return `400` or `401` and **stop processing** before touching state.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `webhookRoutePatterns` | `string[]` | `["**/webhook/**", "**/webhooks/**", "**/*-webhook/**", "app/api/webhook/route.{ts,js,tsx,jsx}", "app/api/webhooks/**/route.{ts,js,tsx,jsx}"]` | Glob patterns for files / route paths to treat as webhook handlers. The rule fires on any handler in a matching file that does not call a recognized verification function. |
| `verificationFunctions` | `string[]` | `[]` | Additional function or member-expression names that count as signature verification. Merged with the built-in list (`stripe.webhooks.constructEvent`, `webhooks.verify`, `wh.verify`, `verifyRequestSignature`, `timingSafeEqual`, etc.). Use this when you wrap signature checks in a project-specific helper. |

### Example configuration

```js
rules: {
  'ai-guard/require-webhook-signature': ['error', {
    webhookRoutePatterns: ['**/webhook/**', 'app/api/integrations/**/route.ts'],
    verificationFunctions: ['verifyMyHmacWrapper', 'tenantWebhook.assertSignature'],
  }],
}
```

## Lenient `.verify()` fallback (Svix / Octokit class-based handlers)

The Svix and Octokit SDKs are commonly used through stored class fields:

```typescript
import { Webhook } from 'svix';
class StripeWebhookHandler {
  private wh = new Webhook(process.env.SVIX_SECRET!);
  async handle(req: Request) {
    this.wh.verify(rawBody, headers);  // ✅ accepted
    // ...
  }
}
```

The rule cannot trace `this.wh` back to the `new Webhook()` instantiation across method boundaries, so it uses a **binding-name heuristic** to accept these patterns when `svix` or `@octokit/webhooks` is imported in the file. The receiver name (Identifier name, or final property name of a MemberExpression) must match one of:

- `wh`, `webhook`, `webhooks`, `hook`, `svix`, `octokit`
- Any name ending in `webhook` or `webhooks` (e.g., `myWebhook`, `stripeWebhooks`)

**This means**: in a webhook handler file that imports `svix`, calls like `jwt.verify(token, secret)` or `crypto.verify(...)` are **NOT** accepted as webhook signature verification. The rule will still fire `missingWebhookSig` because `jwt` and `crypto` are not webhook-related receiver names. This was tightened in v2.0.0-beta.2 after a security audit identified the previous lenient behavior as exploitable.

If you use a custom variable name not on the list, either rename it to include `webhook`/`hook`, or add it to `verificationFunctions` to whitelist the specific call.

## Test-file path exemption

The rule will not flag handlers in files whose paths match common test-fixture patterns, since those are typically intentional dummies:

- `__tests__/`, `__mocks__/` directory segments
- `tests/`, `fixtures/`, `mocks/` directory segments
- `.test.{ts,tsx,js,jsx,cjs,mjs,cts,mts}` file suffix
- `.spec.{ts,tsx,js,jsx,cjs,mjs,cts,mts}` file suffix

If you have a real webhook handler under one of these paths (uncommon but possible), the rule will silently skip it. Move the handler to a non-test path or temporarily disable the rule on that file with an `eslint-disable` comment.

## A note on Stripe and raw bodies

Stripe's `constructEvent(payload, signature, secret)` requires `payload` to be the **raw request body bytes**, not a JSON-parsed object. The most common production bug for Stripe webhooks is registering `app.use(express.json())` globally and then receiving `[object Object]` at the verifier.

For Express, mount the raw parser **only on the webhook route** before any global JSON middleware:

```typescript
app.post('/webhook/stripe', express.raw({ type: 'application/json' }), handler);
app.use(express.json()); // global, but webhook route already consumed its body
```

For Next.js 15 App Router, read `await req.text()` (do **not** call `await req.json()` first):

```typescript
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  // ...
}
```

For Fastify, register a raw content-type parser scoped to the webhook route. The signature step in any of these will silently fail if the body has been re-serialized by a JSON parser between the network and the verifier.
