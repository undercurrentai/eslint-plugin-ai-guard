# Rules

`@undercurrent/eslint-plugin-ai-guard` currently ships **20 rules** across four categories (13 active + 7 deprecated).

- Error handling
- Async correctness
- Security
- Code quality / logic

Use the full reference for per-rule severity, examples, and fix guidance:

- [Full Rules Reference](./rules/README.md)

Quick links:

- [Error Handling Rules](./rules/README.md#-error-handling)
- [Async Correctness Rules](./rules/README.md#-async-correctness)
- [Security Rules](./rules/README.md#-security)
- [Code Quality Rules](./rules/README.md#-code-quality)

## New in v2.0.0-beta.2 — framework-aware trio

Three new rules replace generic name-based detection with framework-deep analysis across Express 5, Fastify 5, Hono 4, NestJS 11, and Next.js 15 App Router:

- [`require-framework-auth`](./rules/require-framework-auth.md) — missing authentication on routes
- [`require-framework-authz`](./rules/require-framework-authz.md) — missing authorization/ownership (CASL, Casbin, Cerbos, Permit.io aware)
- [`require-webhook-signature`](./rules/require-webhook-signature.md) — webhook handlers without signature verification (Stripe, GitHub, Svix, Slack)

## Deprecated (will be removed in v3.0.0)

These rules are kept for backwards compatibility. They overlap with superior upstream rules or are replaced by framework-aware versions — see [the migration guide](./migration/v1-to-v2.md) and [compat config](./guides/compat-config.md).

**Deprecated in v2.0.0-beta.1:**

- [`no-await-in-loop`](./rules/no-await-in-loop.md) → ESLint core `no-await-in-loop`
- [`no-async-without-await`](./rules/no-async-without-await.md) → `@typescript-eslint/require-await`
- [`no-redundant-await`](./rules/no-redundant-await.md) → `@typescript-eslint/return-await`
- [`no-broad-exception`](./rules/no-broad-exception.md) → `@typescript-eslint/no-explicit-any` + TypeScript `useUnknownInCatchVariables`
- [`no-catch-without-use`](./rules/no-catch-without-use.md) → `@typescript-eslint/no-unused-vars` with `{ caughtErrors: 'all' }`

**Deprecated in v2.0.0-beta.2:**

- [`require-auth-middleware`](./rules/require-auth-middleware.md) → [`require-framework-auth`](./rules/require-framework-auth.md)
- [`require-authz-check`](./rules/require-authz-check.md) → [`require-framework-authz`](./rules/require-framework-authz.md)

## Preset summary

- `recommended`: adoption-first, low-noise defaults
- `strict`: all active rules at `error`
- `security`: security-only profile (incl. framework-aware trio)
- `framework`: the 3 framework-aware rules only (auth, authz, webhook signature)
- `compat`: disables all 7 deprecated rules so users can enable replacements cleanly
