# no-unsafe-deserialize

**Category:** Security | **Severity:** `warn` (recommended, security), `error` (strict)

---

## What it does

Flags calls to `JSON.parse()` where the argument appears to come from an untrusted external source — `req.body`, `req.query`, `req.params`, `event.body`, socket message data, or similar — without a visible schema validation step before or after the parse.

## Why it matters

`JSON.parse()` itself doesn't execute code, but accepting unvalidated JSON from an external source and using it directly creates implicit trust in attacker-controlled data. The parsed object can have unexpected shapes, missing required fields, or injected properties (`__proto__`, `constructor`) that can break your application logic or enable prototype pollution.

AI tools generate `JSON.parse(req.body)` patterns directly because that's the simplest way to get structured data from a request.

## ❌ Bad Example

```typescript
// No validation — trusting external JSON completely
app.post('/webhook', (req, res) => {
  const payload = JSON.parse(req.body); // ← shape is unknown
  processOrder(payload.orderId, payload.amount); // ← what if these are undefined?
});

// Socket handler — same problem
socket.on('message', (data) => {
  const msg = JSON.parse(data);
  db.insert(msg); // ← inserting attacker-controlled data
});
```

## ✅ Good Example

```typescript
import { z } from 'zod';

const WebhookPayload = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.enum(['USD', 'EUR', 'GBP']),
});

app.post('/webhook', (req, res) => {
  try {
    const raw = JSON.parse(req.body);
    const payload = WebhookPayload.parse(raw); // ← validates shape and types
    processOrder(payload.orderId, payload.amount);
  } catch (err) {
    res.status(400).json({ error: 'Invalid payload' });
  }
});
```

## How to fix

Always validate the parsed JSON against an expected schema:

- **Zod**: `schema.parse(JSON.parse(data))`
- **Joi**: `schema.validate(JSON.parse(data))`
- **TypeBox**: `Value.Check(schema, JSON.parse(data))`
- **AJV**: compile and run a JSON Schema validator

## Configuration

This rule has no options.

## Detection coverage

The rule flags `JSON.parse(...)` whose argument is, or resolves to, a likely untrusted source:

- **Bare identifiers** commonly holding untrusted input: `input`, `userInput`, `rawBody`, `payload`, `body`, `query`, `param`, `params`, `data`, `requestBody`.
- **Request-object properties**: `req.body` / `req.query` / `req.params` / `req.param` and the same on `request`.
- **Tainted-property access**: any property read off an already-untrusted source, e.g. `req.body.data`.
- **Browser URL-derived sources**: `location.hash` / `location.search` / `location.href` (bare or `window.`-prefixed), `document.URL`, `document.referrer`.
- **Coercion wrappers**: `String(x)` and `x.toString()` are unwrapped before the check, so `JSON.parse(String(req.body))` is caught.
- **One-level `const` aliasing**: `const b = req.body; JSON.parse(b);` is flagged when `b` is a single-definition `const` initialized directly from an untrusted source.

## Known limitations

This is an intentionally conservative AST heuristic, not a data-flow taint engine. It will **not** catch:

- Multi-step or reassigned aliasing (`let` variables, values passed through helper functions, or `const` chains more than one hop deep) — restricted on purpose so the rule never produces a false positive on sanitized input.
- Framework request objects it doesn't name explicitly (e.g. Koa's `ctx.request.body`, or a destructured `const { body } = req`).
- Sources whose untrusted-ness is only knowable at runtime (a fetched response body, a value read from `URLSearchParams.get()`).

It may also **over-report**: a bare identifier whose *name* is in the untrusted set (`input`, `userInput`, `rawBody`, `payload`, `body`, `query`, `param`, `params`, `data`, `requestBody`) is treated as untrusted regardless of where it actually came from. A trusted binding that merely shares one of these common names — `function f(body) { JSON.parse(body); }`, `const data = await config.load(); JSON.parse(data);` — will be flagged. This is a deliberate name-heuristic (those names overwhelmingly *do* hold request/user data in practice); provenance-aware suppression of name-matched identifiers is a possible future refinement but trades detection for fewer false positives. If a specific trusted parse trips the rule, disable it inline with `// eslint-disable-next-line no-unsafe-deserialize` and a justifying comment.

When a parse site is untrusted but not flagged, validate it against a schema anyway — the absence of a warning is not a guarantee of safety.
