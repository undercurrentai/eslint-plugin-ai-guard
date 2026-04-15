# Rules

`@undercurrent/eslint-plugin-ai-guard` currently ships **17 rules** across four categories (12 active + 5 deprecated).

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

## Deprecated in v2.0.0

These 5 rules are kept for backwards compatibility and will be **removed in v3.0.0**. They overlap with superior upstream rules — see [the migration guide](./migration/v1-to-v2.md) and [compat config](./guides/compat-config.md).

- [`no-await-in-loop`](./rules/no-await-in-loop.md) → ESLint core `no-await-in-loop`
- [`no-async-without-await`](./rules/no-async-without-await.md) → `@typescript-eslint/require-await`
- [`no-redundant-await`](./rules/no-redundant-await.md) → `@typescript-eslint/return-await`
- [`no-broad-exception`](./rules/no-broad-exception.md) → `@typescript-eslint/no-explicit-any` + TypeScript `useUnknownInCatchVariables`
- [`no-catch-without-use`](./rules/no-catch-without-use.md) → `@typescript-eslint/no-unused-vars` with `{ caughtErrors: 'all' }`

## Preset summary

- `recommended`: adoption-first, low-noise defaults
- `strict`: all active rules at `error`
- `security`: security-only profile
- `compat`: disables the 5 deprecated rules so users can enable upstream replacements cleanly (v2.0.0+)
