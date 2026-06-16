<p align="center">
  <h1 align="center">@undercurrentai/eslint-plugin-ai-guard</h1>
  <p align="center">
    <strong>🛡️ Framework-aware security lint for JS/TS routes and webhooks.</strong>
    <br/>
    <sub>Missing-auth / missing-authz / unverified-webhook detection across Express, Fastify, Hono, NestJS, and Next.js — where <code>@typescript-eslint</code> and <code>eslint-plugin-security</code> don't reach.</sub>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@undercurrentai/eslint-plugin-ai-guard"><img src="https://img.shields.io/npm/v/@undercurrentai/eslint-plugin-ai-guard.svg?style=flat-square" alt="npm version"></a>
    <a href="https://github.com/undercurrentai/eslint-plugin-ai-guard/actions"><img src="https://img.shields.io/github/actions/workflow/status/undercurrentai/eslint-plugin-ai-guard/ci.yml?style=flat-square&label=CI" alt="CI"></a>
    <a href="https://www.npmjs.com/package/@undercurrentai/eslint-plugin-ai-guard"><img src="https://img.shields.io/npm/dm/@undercurrentai/eslint-plugin-ai-guard.svg?style=flat-square" alt="downloads"></a>
    <a href="https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@undercurrentai/eslint-plugin-ai-guard.svg?style=flat-square" alt="license"></a>
  </p>
</p>

---

> **Lineage.** Forked from [YashJadhav21/eslint-plugin-ai-guard](https://github.com/YashJadhav21/eslint-plugin-ai-guard) (MIT) at v1.1.11. The `@undercurrent` fork extends that surface with the framework-aware trio (auth / authz / webhook signature) and a companion CLI, while contributing framework-agnostic correctness fixes back upstream under our dual-track policy. See [`docs/migration/v1-to-v2.md`](./docs/migration/v1-to-v2.md).

## What this catches that other linters don't

Three rules are the reason this plugin exists:

- **`require-framework-auth`** — flags route handlers with no visible authentication across Express 5, Fastify 5, Hono 4, NestJS 11, and Next.js 15 App Router. Decorator-aware (`@UseGuards`), options-object-aware (`{ preHandler: [auth] }`), filename-aware (`app/**/route.ts`), chained-route-aware (`router.route('/x').post(auth, ...)`).
- **`require-framework-authz`** — flags handlers that touch `req.params.id` (or equivalents) with no visible ownership / policy check. Detects CASL `ability.can`, Casbin `enforcer.enforce`, Cerbos `cerbos.checkResource`, Permit.io `permit.check` via import-verified detection.
- **`require-webhook-signature`** — flags webhook handlers without cryptographic signature verification. Recognizes Stripe (`constructEvent`), GitHub (`crypto.timingSafeEqual`), Svix (`Webhook.verify`), Slack (`createSlackEventAdapter`); filters out receivers that look like general auth (`jwt.verify`) to avoid false positives.

`@typescript-eslint` has none of these. `eslint-plugin-security` has none of these. Semgrep's free JS ruleset covers a subset of the auth case for Express only — not the full breadth. This is the defensible differentiation.

The plugin also ships a broader set of code-quality and security rules (floating promises, empty catches, hardcoded secrets, eval-dynamic, SQL-concat, unsafe-deserialize) that overlap in part with `@typescript-eslint` / `eslint-plugin-security` / ESLint core. Those are useful convenience, but the framework-aware trio is what would be missing from any other stack.

## Why AI-generated code is a common trigger

The rules above fire on any code — human or agent-authored. They happen to fire heavily on AI-generated code because missing auth on new routes, unverified webhook handlers, and skipped ownership checks are three of the most consistent defects in LLM output. CodeRabbit's 2025 study of 470 AI-generated PRs found 1.7× more issues and 2.74× more security vulnerabilities than human code, with a pattern-based failure profile that linters are specifically well-suited to catch ([source](https://www.coderabbit.ai/)). CVE-2025-55346 — unsafe dynamic `Function(...)` constructor RCE (CVSS 9.8, Aug 2025) — is a recent in-the-wild instance of that failure class. The plugin is useful for any security-sensitive codebase; it's *especially* useful if your team is shipping Copilot / Cursor / Claude Code output without a dedicated review.

## Install

```bash
npm install --save-dev @undercurrentai/eslint-plugin-ai-guard@next
```

## 🚀 Quick Start – CLI (no config needed)

```bash
npx ai-guard run          # recommended preset (lowest noise)
npx ai-guard run --strict
npx ai-guard run --security
npx ai-guard init         # auto-creates ESLint config for you
npx ai-guard init --dry-run
npx ai-guard doctor       # diagnoses setup issues
npx ai-guard baseline     # track only *new* issues going forward
```

That's it. **Zero configuration required.**

## 🤖 Set Up AI Agent Rules

Generate instruction files so Claude Code, Cursor, and GitHub Copilot
automatically avoid the most common AI-generated anti-patterns:

```bash
npx ai-guard init-context
```

Follow the prompts to select your agent(s). Or generate all at once:

```bash
npx ai-guard init-context --all
```

This writes:

- `CLAUDE.md` — read automatically by Claude Code
- `.cursorrules` — read automatically by Cursor
- `.github/copilot-instructions.md` — read automatically by GitHub Copilot

Your AI tools will now avoid these patterns before you even run the linter.
Use `--force` to regenerate after upgrading to a new version with new rules.

## 🧪 Real-World Usage Philosophy

`ai-guard` is designed for production adoption in existing codebases:

1. **Recommended preset is intentionally low-noise** to avoid overwhelming teams on day one.
2. **Strict preset enables full enforcement** for mature teams that want maximum coverage.
3. **Security preset focuses only on security rules** with critical issues as errors.

## 🎬 Real Workspace Demo

See how `ai-guard` catches a common AI-generated async bug that silent failures in production:

```typescript
// ❌ BAD: AI often forgets to await or wrap in Promise.all
const userIds = [1, 2, 3];
userIds.map(async (id) => {
  return await fetchUser(id);
}); 
// ⚠️ ai-guard flags: Async callback passed to Array.map(). Returns Promise[], not values.

// ✅ GOOD: ai-guard recommended fix
const users = await Promise.all(userIds.map(async (id) => {
  return await fetchUser(id);
}));
// ✨ ai-guard: No issues found.
```

### Terminal Output

![ai-guard linting demo](./assets/example_1.png)
![ai-guard linting demo](./assets/example_2.png)

*The terminal output above shows `ai-guard` catching multiple AI-generated anti-patterns in a single run.*

## Rules (Recommended Preset)

### 🎯 Error Handling

- **`ai-guard/no-empty-catch`** (Error)
  Disallow empty catch blocks. AI tools frequently generate try/catch with empty bodies that silently swallow errors.
- **`ai-guard/no-broad-exception`** (Warn)
  Disallow catching `any` or `unknown` without instance narrowing. AI tools default to `catch (e: any)` which obscures the underlying failure.
- **`ai-guard/no-catch-log-rethrow`** (Off in `recommended`, Error in `strict`)
  Disallow catch blocks that only log and rethrow the same error. AI tools often generate this noisy pattern without adding recovery or context.
- **`ai-guard/no-catch-without-use`** (Off in `recommended`, Error in `strict`)
  Disallow unused catch parameters. AI tools frequently add `catch (e)` while ignoring the error object entirely.
- **`ai-guard/no-duplicate-logic-block`** (Off in `recommended`, Error in `strict`)
  Disallow consecutive duplicated logic blocks. AI tools often copy-paste identical code that should be consolidated.

### ⏱️ Async Stability

- **`ai-guard/no-async-array-callback`** (Warn)
  Disallow async functions in `.map()`, `.filter()`, etc. AI tools frequently suggest `array.map(async ...)` expecting resolved values, creating silent bugs.
- **`ai-guard/no-floating-promise`** (Error)
  Require awaiting or handling promises. AI tools frequently generate un-awaited async calls that silently swallow rejections.
- **`ai-guard/no-await-in-loop`** (Warn)
  Disallow sequential `await` inside loops. AI tools frequently use `for (const x of y) await z(x)` causing O(n) latency instead of parallel `Promise.all()`.
- **`ai-guard/no-async-without-await`** (Warn)
  Disallow async functions that do not use `await`. AI tools frequently add `async` by default, creating misleading function signatures.
- **`ai-guard/no-redundant-await`** (Off in `recommended`, Error in `strict`)
  Disallow redundant `return await` outside try/catch/finally. AI tools often emit this pattern even when returning the Promise directly is equivalent.

### 🛡️ Security

- **`ai-guard/no-hardcoded-secret`** (Error)
  Disallow hardcoded keys/passwords. AI tools frequently provide examples with placeholder secrets that accidentally make it into production.
- **`ai-guard/no-eval-dynamic`** (Error)
  Disallow dynamic `eval()` or `new Function()`.
- **`ai-guard/no-sql-string-concat`** (Warn in `recommended`, Error in `security`/`strict`)
  Disallow variable concatenation/interpolation in SQL queries. AI tools frequently generate dangerous code enabling SQL injection.
- **`ai-guard/no-unsafe-deserialize`** (Warn in `recommended`/`security`, Error in `strict`)
  Disallow `JSON.parse()` on likely untrusted inputs (like `req.body`) without visible validation.
- **`ai-guard/require-framework-auth`** (Warn in `recommended`/`security`, Error in `strict`)
  Enforce authentication on routes across Express 5, Fastify 5, Hono 4, NestJS 11, and Next.js 15 App Router. Decorator-aware for NestJS (`@UseGuards`); filename-aware for Next.js (`app/**/route.ts` exported handlers).
- **`ai-guard/require-framework-authz`** (Warn in `recommended`/`security`, Error in `strict`)
  Require visible ownership/policy checks when handlers access resource identifiers. Detects CASL, Casbin, Cerbos, and Permit.io patterns when imported.
- **`ai-guard/require-webhook-signature`** (Warn in `recommended`/`security`, Error in `strict`)
  Require HMAC signature verification in webhook handlers. Recognizes Stripe, GitHub, Svix, and Slack patterns.
- **`ai-guard/require-auth-middleware`** *(deprecated — use `require-framework-auth`)*
  Legacy v1 rule. Continues to emit findings with a `[ai-guard deprecated]` prefix.
- **`ai-guard/require-authz-check`** *(deprecated — use `require-framework-authz`)*
  Legacy v1 rule. Continues to emit findings with a `[ai-guard deprecated]` prefix.

### 🧹 Code Quality

- **`ai-guard/no-console-in-handler`** (Off in `recommended`, Error in `strict`)
  Disallow `console.*` inside HTTP route handlers. AI tools often leave debug logs in handlers that leak internals and pollute production logs.

### Configs

| Config | Description |
| --- | --- |
| `recommended` | Adoption-first preset: high-confidence issues as `error`, context-sensitive rules as `warn`/`off` |
| `strict` | All rules at `error` — for teams that want maximum coverage |
| `framework` | The 3 framework-aware rules (auth, authz, webhook signature) — drop-in for v2.x users |
| `security` | Security-only rules: critical issues at `error`, contextual checks at `warn` |

### Config Examples

#### Flat Config: strict

```javascript
import aiGuard from "@undercurrentai/eslint-plugin-ai-guard";

export default [
  {
    plugins: { "ai-guard": aiGuard },
    rules: { ...aiGuard.configs.strict.rules }
  }
];
```

#### Flat Config: security

```javascript
import aiGuard from "@undercurrentai/eslint-plugin-ai-guard";

export default [
  {
    plugins: { "ai-guard": aiGuard },
    rules: { ...aiGuard.configs.security.rules }
  }
];
```

## Why This Exists

AI coding assistants generate code that **looks correct** but has subtle structural issues:

- 🕳️ **Empty catch blocks** — errors vanish silently
- ⏳ **`array.map(async ...)`** — returns `Promise[]`, not resolved values
- 🔥 **Floating promises** — `fetchData()` without `await` = silent failures

These patterns pass TypeScript and existing linters. `ai-guard` catches them.

## Supported Environments

- **ESLint** 9.x (flat config). ESLint 8 legacy config: stay on the upstream `eslint-plugin-ai-guard@1.x`.
- **Node.js** ≥ 20 (Node 18 is EOL as of 2025-04-30, and `@inquirer/prompts` — used by `ai-guard init-context` / `preset` — requires `node:util`'s `styleText` introduced in Node 20.12.0).
- **TypeScript** and JavaScript

## Coverage & known limitations

`ai-guard` is deliberately **fast, syntactic, and honest about its edges**. It runs at editor speed — no `project: true`, no type-checker — so it reasons about AST structure and one-hop scope, not full data-flow taint analysis. That keeps it instant on large repos, and it means the boundaries below are real. Knowing them up front is the difference between trusting the tool and disabling it on the first surprise.

**What the framework-aware rules cover today:** REST-style route handlers and webhook receivers in **Express 5, Fastify 5, Hono 4, NestJS 11, and Next.js 15 App Router (`route.ts`)**.

**What they do *not* cover yet** (tracked on the roadmap — these are silent gaps, not detections):

- **Next.js Server Actions (`'use server'`) and `middleware.ts` auth** — only `route.ts` handlers are analyzed.
- **GraphQL resolvers, tRPC procedures, and Hono RPC** — detection is REST-shaped; resolver/procedure auth is not yet modeled.
- **Webhook providers beyond Stripe / GitHub / Svix / Slack** — other providers (SendGrid, Twilio, Shopify, etc.) aren't pattern-matched yet, so `require-webhook-signature` won't flag them.

**Cross-file analysis is intentionally limited.** Rules analyze each file in isolation, so a global guard registered elsewhere (NestJS `APP_GUARD`, a root `middleware.ts`, cross-file `router.use(auth)` / Fastify `register`) can look like missing auth. This is by design — to never silently trust auth the rule can't see. Set `assumeGlobalAuth: true` (or add the wrapper to `knownAuthCallers`) when a global gate applies; see each framework rule's **Known limitations** section for the exact escape hatch.

**Name-heuristic trade-off.** `no-unsafe-deserialize` treats a bare identifier whose *name* is in the untrusted set (`body`, `payload`, `data`, …) as untrusted regardless of provenance, so a trusted binding that merely shares one of those names can be over-reported. This is a deliberate bias toward catching real request-body parses; suppress a specific trusted parse inline with `// eslint-disable-next-line no-unsafe-deserialize`.

**Why `recommended` doesn't turn everything to `error`.** The `recommended` preset is **adoption-first**: high-confidence rules are `error`, context-sensitive ones are `warn`/`off`, so dropping the plugin into an existing codebase produces a signal you can act on rather than a wall of red. Use `strict` to raise everything to `error` once you've triaged the baseline. Each rule's doc states its own false-positive boundary — and we [take false-positive reports seriously](#contributing).

## Development

```bash
git clone https://github.com/undercurrentai/eslint-plugin-ai-guard.git
cd eslint-plugin-ai-guard
npm install
npm run test        # Run test suite
npm run build       # Build CJS + ESM
npm run typecheck   # TypeScript check
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Rule requests:** Open an issue using the [Rule Request template](https://github.com/undercurrentai/eslint-plugin-ai-guard/issues/new).

**False positive reports:** Open an issue using the [False Positive template](https://github.com/undercurrentai/eslint-plugin-ai-guard/issues/new) — we take zero false positives seriously.

**Upstream contributions (dual-track):** This fork contributes fixes and quality improvements back to the [original upstream repo](https://github.com/YashJadhav21/eslint-plugin-ai-guard) where they align with upstream's scope — e.g. [upstream #2](https://github.com/YashJadhav21/eslint-plugin-ai-guard/pull/2) (flagging bare `Function(...)` as code injection), merged.

## License

[MIT](LICENSE) — free forever. No rules behind a paywall.

---

<p align="center">
  Built to make AI-assisted development safer. ⚡
</p>
