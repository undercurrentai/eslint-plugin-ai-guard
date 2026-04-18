# @undercurrent/eslint-plugin-ai-guard

**Framework-aware security lint for JS/TS routes and webhooks.** Missing-auth, missing-authz, and unverified-webhook detection across Express 5, Fastify 5, Hono 4, NestJS 11, and Next.js 15 App Router — where `@typescript-eslint` and `eslint-plugin-security` don't reach.

The rules are framework-native (import-map, filename, and decorator aware) and run at editor speed (no `project: true` / no parserServices). They catch the same patterns whether a human or an LLM wrote them — but they happen to fire heavily on AI-generated code, because missing auth on a route and unverified webhook signatures are two of the most reliable AI-codegen gaps.

## Presets

- `framework` — the 3 framework-aware rules only (auth / authz / webhook signature). The defensible core.
- `security` — the framework trio plus `no-eval-dynamic` / `no-hardcoded-secret` / `no-sql-string-concat` / `no-unsafe-deserialize` at AppSec severity.
- `recommended` — adoption-first: high-confidence rules at `error`, context-sensitive rules at `warn`.
- `strict` — every active rule at `error`, for mature teams.
- `compat` — disables the 7 deprecated rules cleanly.

## Start Here

- [Quick Start](/getting-started)
- [Full Setup Guide](/guides/getting-started)
- [Framework Support Guide](/guides/framework-support)
- [CLI Reference](/cli/overview)
- [Rules Reference](/rules/README)
- [Migrating from v1.x](/migration/v1-to-v2)
