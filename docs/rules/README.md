# Rules Reference

All 20 rules provided by `@undercurrent/eslint-plugin-ai-guard`, organized by category.
Rules marked **deprecated** continue to emit findings (with `[ai-guard deprecated]` prefix)
and will be removed in v3.0. Use the listed replacement instead.

---

## ⚠️ Error Handling

| Rule | Recommended | Strict | Description |
|---|---|---|---|
| [no-empty-catch](no-empty-catch.md) | `error` | `error` | Empty catch blocks silently discard errors |
| [no-broad-exception](no-broad-exception.md) **deprecated** | `off` | `off` | → `@typescript-eslint/no-explicit-any` + `useUnknownInCatchVariables` |
| [no-catch-log-rethrow](no-catch-log-rethrow.md) | `off` | `error` | Log-then-rethrow adds noise, no recovery |
| [no-catch-without-use](no-catch-without-use.md) **deprecated** | `off` | `off` | → `@typescript-eslint/no-unused-vars` with `caughtErrors: 'all'` |
| [no-duplicate-logic-block](no-duplicate-logic-block.md) | `off` | `error` | Copy-pasted logic blocks that should be extracted |

## ⏱️ Async Correctness

| Rule | Recommended | Strict | Description |
|---|---|---|---|
| [no-floating-promise](no-floating-promise.md) | `error` | `error` | Async call without `await` or `.catch()` |
| [no-async-array-callback](no-async-array-callback.md) | `warn` | `error` | `array.map(async ...)` returns `Promise[]`, not values |
| [no-await-in-loop](no-await-in-loop.md) **deprecated** | `off` | `off` | → ESLint core `no-await-in-loop` |
| [no-async-without-await](no-async-without-await.md) **deprecated** | `off` | `off` | → `@typescript-eslint/require-await` |
| [no-redundant-await](no-redundant-await.md) **deprecated** | `off` | `off` | → `@typescript-eslint/return-await` |

## 🛡️ Security

| Rule | Recommended | Security | Strict | Description |
|---|---|---|---|---|
| [no-hardcoded-secret](no-hardcoded-secret.md) | `error` | `error` | `error` | API keys / passwords in source code |
| [no-eval-dynamic](no-eval-dynamic.md) | `error` | `error` | `error` | `eval()` or `new Function()` with dynamic content |
| [no-sql-string-concat](no-sql-string-concat.md) | `warn` | `error` | `error` | SQL queries built with string concatenation |
| [no-unsafe-deserialize](no-unsafe-deserialize.md) | `warn` | `warn` | `error` | `JSON.parse()` on untrusted input without validation |
| [require-framework-auth](require-framework-auth.md) | `warn` | `warn` | `error` | Missing auth on Express/Fastify/Hono/NestJS/Next.js routes |
| [require-framework-authz](require-framework-authz.md) | `warn` | `warn` | `error` | No ownership/policy check (CASL/Casbin/Cerbos/Permit.io aware) |
| [require-webhook-signature](require-webhook-signature.md) | `warn` | `warn` | `error` | Webhook handler without HMAC signature verification |
| [require-auth-middleware](require-auth-middleware.md) **deprecated** | `off` (compat) | — | — | → use `require-framework-auth` |
| [require-authz-check](require-authz-check.md) **deprecated** | `off` (compat) | — | — | → use `require-framework-authz` |

## 🧹 Code Quality

| Rule | Recommended | Strict | Description |
|---|---|---|---|
| [no-console-in-handler](no-console-in-handler.md) | `off` | `error` | `console.*` inside HTTP route handlers |

---

## Preset Comparison

| Preset | Use Case | Coverage |
|---|---|---|
| `recommended` | Start here — low noise, high-value rules enabled | Active rules at warn/error; deprecated rules off |
| `strict` | Maximum enforcement — mature codebase | All active rules at `error`; deprecated rules off |
| `security` | Security audit focus | Security rules only (incl. the framework-aware trio) |
| `framework` | Framework-deep auth/authz/webhook checks only | The 3 new framework-aware rules |
| `compat` | Disables all 7 deprecated rules in one line | The 5 v1 rules + 2 M2 deprecations |
