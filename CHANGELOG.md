# Changelog

All notable changes to this package will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/). The `@undercurrent` fork uses a 2.x lineage independent from the upstream `eslint-plugin-ai-guard` 1.x line.

## [2.0.0-beta.2] — 2026-04-15

Framework-aware auth/authz/webhook-signature trio. The first framework-deep release.

### ⚠️  BREAKING

- **2 rules deprecated** (removed in v3.0.0). Replaced by framework-aware versions:
  - `ai-guard/require-auth-middleware` → `ai-guard/require-framework-auth`
  - `ai-guard/require-authz-check` → `ai-guard/require-framework-authz`
- **`/webhook*` is no longer a public-route default** — the default `publicRoutePatterns` in `require-framework-auth` no longer exempts webhook paths. Webhook routes must now either pass an auth check or pass signature verification (handled by the new `require-webhook-signature` rule). This was a known defect in v1: `require-auth-middleware` exempted `/webhook*` paths, but Stripe/GitHub/Slack webhooks need cryptographic signature verification, not auth.
- **Tightened public-route boundaries.** Default patterns like `/^\/auth/` are now anchored with `(\/|$)` so `/authentication-token`, `/registry/items`, and `/resetpassword/admin` are no longer accidentally exempted.
- **Presets updated.** `recommended`, `strict`, and `security` now use the new framework-aware rules. The 2 deprecated rules continue to emit with `[ai-guard deprecated — use X]` prefix.

### Added

- **`require-framework-auth`** — detects missing authentication on routes across Express 5, Fastify 5, Hono 4, NestJS 11, and Next.js 15 App Router. Options: `knownAuthCallers`, `publicRoutePatterns`, `skipDecorators`, `assumeGlobalAuth`, `mutatingOnly`. See [`docs/rules/require-framework-auth.md`](./docs/rules/require-framework-auth.md).
- **`require-framework-authz`** — detects missing authorization checks. Adds support for CASL (`ability.can`), Casbin (`enforcer.enforce`), Cerbos (`cerbos.checkResource`), and Permit.io (`permit.check`) via import-verified detection. See [`docs/rules/require-framework-authz.md`](./docs/rules/require-framework-authz.md).
- **`require-webhook-signature`** — detects webhook handlers without cryptographic signature verification. Recognizes Stripe (`constructEvent`), GitHub (`crypto.timingSafeEqual`), Svix (`Webhook.verify`), Slack (`createSlackEventAdapter`), and configurable patterns. See [`docs/rules/require-webhook-signature.md`](./docs/rules/require-webhook-signature.md).
- **`framework` preset** — `aiGuard.configs.framework` enables the trio at error/warn/error.
- **`compat` preset extended** to include `require-auth-middleware: 'off'` and `require-authz-check: 'off'`.
- **Framework support guide** at [`docs/guides/framework-support.md`](./docs/guides/framework-support.md).
- **Shared framework detector infrastructure** at `src/utils/framework-detectors.ts` — pure-AST import map and decorator helpers, reused by all three new rules. No `project: true` or type-aware linting required.
- **155 new tests** (5 integration tests + 3 rule tests + detector tests).

### Changed

- Plugin version bumped to `2.0.0-beta.2`.
- CLI rule maps (`RECOMMENDED_RULES`, `STRICT_RULES`, `SECURITY_RULES`) updated to reference the new rules.

### Fixed

17 correctness fixes applied during the audit, ultrathink, and bug-hunt phases, each covered by regression tests.

**Initial audit (8):**

- Decorator detection now handles member-expression form (`@Common.UseGuards()`) — previously silently skipped NestJS methods using barrel-imported decorators.
- `isRouteDefinition` now unwraps `TSAsExpression` / `TSNonNullExpression` / `TSSatisfiesExpression` — previously `(app as Application).get(...)` was not detected.
- Express chained `.route('/x').post(auth, handler)` form now handled correctly — previously misread the auth middleware as the path.
- Hono multi-method `app.on(['POST','PUT'], path, handler)` form now detected.
- NestJS static methods on `@Controller` classes are now skipped (they're not HTTP-dispatched).
- `require-framework-authz` now detects destructured `const { id } = req.params` patterns and supports Fastify's `request.` prefix (not just Express's `req.`).
- AST walkers skip nested `FunctionDeclaration` bodies to avoid false-negatives from dead-code authz/verification calls in never-invoked helpers.
- Top-level `app/route.ts` (App Router root catch-all) now correctly detected as a Next.js route handler.

**Bug-hunt round 1 (5):**

- Express `.route('/x').post(...).get(...)` chain reuse now correctly walks back through chained HTTP methods to find the originating `.route()` and inherits its path. Previously the second `.METHOD()` saw middleware as path (false positive) or skipped the chain (false negative).
- Concise-arrow Next.js handlers (`export const POST = (req) => doX()`) are now detected. Previously the rule required `init.body.type === BlockStatement`, silently skipping concise arrows.
- `require-webhook-signature` lenient fallback now also accepts `MemberExpression` (`obj.wh.verify()`) and `ThisExpression` (`this.wh.verify()`) receivers — common in class-based webhook handlers.
- `require-webhook-signature` no longer fires on test-fixture file paths (`__tests__/`, `.test.`, `.spec.`, `tests/`, `fixtures/`, `mocks/`, `__mocks__/`).
- `require-framework-authz` destructuring now handles aliased (`{ id: userId }`), computed-string (`{ ['id']: id }`), and default-value (`{ id = 'x' }`) patterns by checking BOTH source key AND binding name.

**Bug-hunt rounds 2-3 (2):**

- `unwrapTSExpression` now also unwraps the legacy `TSTypeAssertion` form (`<any>app`). Previously angle-bracket type assertions silently bypassed `isRouteDefinition`.
- Mixed-method Hono arrays (`app.on(['GET', dynamicMethod], path, h)`) under `mutatingOnly: true` now treat dynamic elements as potentially mutating (fail-closed). Previously non-literal array elements were silently ignored.

**Ultrathink cycle 2 (2 — security-critical):**

- **SECURITY**: `isLocalFromWebhookLib` lenient fallback no longer accepts ANY identifier when svix/octokit is imported. Now requires receiver names to suggest webhook bindings (`wh`, `webhook(s)`, `hook`, `svix`, `octokit`, or `*webhook(s)` suffix). Previously `jwt.verify(token, SECRET)` in a webhook handler file silently passed signature verification when svix happened to be imported elsewhere — closing a real exploit path.
- Empty Hono method arrays (`app.on([], path, h)`) no longer produce a misleading `<dynamic>` false-positive report — empty arrays are dead code (no dispatch).

**Bug-hunt round 3 (7 — hybrid Codex + Claude sweep):**

- **SECURITY**: Template-literal route paths (`` `/${base}/admin` ``) no longer collapse to `/` in `getPathString` and then match the default public-root pattern `/^\/?$/`. Previously any route written as `` `/${...}/...` `` was silently treated as public and auth was never required — a high-impact false negative affecting `require-framework-auth`, `-authz`, and `-webhook-signature` (all three share `getPathString`). Dynamic-template prefixes of `''` or `'/'` now return `null` so callers treat the path as dynamic. Non-ambiguous prefixes like `/webhook/${id}` still extract `/webhook/` for positive detectors.
- `require-framework-authz` now handles concise-arrow handlers. `app.get('/users/:id', (req, res) => res.json(getUser(req.params.id)))` — a common AI-codegen pattern — was silently skipped because the handler loop gated on `arg.body.type === BlockStatement`. Dropped the gate; walkers already descend arbitrary nodes.
- `require-framework-authz` now recognizes TS-wrapped ownership operands. `req.user!.id === req.params.id` and `(req.user as User).id === req.params.id` were not detected as ownership checks because `getMemberPath` only descended `Identifier` / `MemberExpression`. `getMemberPath` now unwraps `TSAsExpression` / `TSTypeAssertion` / `TSNonNullExpression` / `TSSatisfiesExpression` at every recursion level — the fix propagates to destructured-param and resource-access detection as well.
- `require-webhook-signature` now handles concise-arrow handlers. `app.post('/webhooks/stripe', (req, res) => res.status(200).end())` previously bypassed the rule because the handler-search required `BlockStatement` bodies. The walker accepts any body node; absent verification in a single-expression body correctly fires.
- `require-framework-auth` now dispatches Fastify's `fastify.route({ method, url, handler })` options-object form. `isRouteDefinition` filtered `'route'` out of `HTTP_METHODS`, so the `if (method === 'route')` branch inside `checkFastifyRoute` was unreachable dead code and any `app.route({...})` without `preHandler` went unreported.
- `require-framework-auth` now recognizes string-literal property keys in option objects (`{ 'preHandler': [auth] }`, `{ 'method': 'POST' }`). Formatter-quoted keys were previously skipped by the `prop.key.type === Identifier` guard. Extracted `getStaticPropKey` into `framework-detectors.ts` for reuse.
- `no-async-array-callback` now detects async callbacks passed by identifier. `const results = arr.map(fetchValue)` where `fetchValue` is declared `async` was silently ignored because the rule only inspected inline `FunctionExpression`/`ArrowFunctionExpression` args. Added scope-walking identifier resolution (mirroring the existing helper in `no-floating-promise.ts`).
- `no-floating-promise` now detects optional-call floating promises. `doWork?.()` as a statement is parsed as `ExpressionStatement > ChainExpression > CallExpression`; the rule required `node.expression.type === CallExpression` and silently skipped the `ChainExpression` wrapper. Added `getCallExpression` helper to unwrap both in the main visitor and in `isExpressionHandled` (so `.catch`/`.then`/`.finally` on optional calls still counts as handled).
- `no-hardcoded-secret` regex `SECRET_NAME_PATTERN` had no word-boundary anchors, so identifiers CONTAINING the substrings (`secretary`, `passwordless`, `keyboard`, `authenticator`) falsely triggered the rule. Since it runs at `error` in the recommended/strict/security presets, this blocked first-run adoption on realistic codebases. Replaced with a tokenizer that splits on camel/Pascal case boundaries + snake/kebab separators and matches whole tokens (or adjacent pairs like `api,key`).

**Bug-hunt round 4 (5 — hybrid Codex + Claude CLI sweep):**

- `no-console-in-handler` now flags console calls in concise-arrow route handlers. `app.get('/expr', (req, res) => console.log('expr'))` silently passed because the rule gated on `argument.body.type === BlockStatement` — the third rule in the family (alongside round-3's `require-framework-authz` / `require-webhook-signature`) with that defect. Pass `argument.body` directly to `traverseForConsoleCalls`; the walker descends any node type.
- `removeNukeIgnore` (CLI config-repair path) no longer globally strips `**/*` substrings. The fallback regex `/"?\*\*\/\*"?/g` ran unconditionally after the primary replacement and would corrupt legitimate globs like `files: ['src/**/*', '**/*.ts']` into `files: ['src/', '.ts']`. Narrowed the fallback regex to match only standalone `'**/*'` lines `(/^\s*['"]\*\*\/\*['"]\s*,?\s*$/gm)` and gated it behind `if (patched === existing)` so it fires only when the primary ignorePatterns/ignores replacement didn't apply — real data-loss prevention on user configs.
- `ai-guard init-context` templates resynced to active v2 rule IDs. Generated CLAUDE.md / `.cursorrules` / `copilot-instructions.md` embedded deprecated v1 IDs (`no-broad-exception`, `no-await-in-loop`, `no-async-without-await`, `no-redundant-await`, `no-catch-without-use`, `require-auth-middleware`, `require-authz-check`) and hard-coded "17 most common" boilerplate. Updated `RULE_CATEGORIES` to match active presets, added `require-webhook-signature` example, and replaced the fixed count with dynamic `ACTIVE_RULE_COUNT` (currently 13).
- `ai-guard preset` "Preset Details" UI now derives from the same rule maps that `ai-guard run` uses. Previously the preset command printed a hard-coded list that showed deprecated IDs (`no-broad-exception`, `no-await-in-loop`, `require-auth-middleware`, `require-authz-check`) and claimed "All 17 rules" when strict has 13. Exported `RECOMMENDED_RULES` / `STRICT_RULES` / `SECURITY_RULES` from `cli/utils/eslint-runner.ts` and replaced the hard-coded `presetDetails` with `Object.entries(ruleMap).map(...)`. A regression test asserts the maps never contain any of the seven deprecated rule IDs.
- `ai-guard baseline` error handlers now `return` after `process.exit(1)`. Three catch blocks called `process.exit` without a following `return`; if `process.exit` is stubbed (test harnesses, some pre-commit wrappers), control fell through and dereferenced `result!` / `existingBaseline!` (both `undefined`) via TS non-null assertion. Defensive hygiene; no user-facing behavior change under normal execution.

### Internal

- Removed inherited-from-upstream dead utility file `src/utils/ast-helpers.ts` (0 callers).
- Removed unused exports `hasImportFrom` and `isMemberCallTo` from `src/utils/framework-detectors.ts`.
- `bodyContainsCallTo` widened from `BlockStatement` to `Node` to support concise-arrow Next.js handler walking.
- `getMemberPath` now unwraps TS wrapper expressions (`TSAsExpression`, `TSTypeAssertion`, `TSNonNullExpression`, `TSSatisfiesExpression`) at every recursion level, so authz / resource-access detection tolerates AI-codegen TS annotations across all call sites.
- `getPathString` returns `null` for template literals whose leading static segment is `''` or `'/'` — dynamic templates are treated as dynamic paths rather than collapsing to the public root.
- `getStaticPropKey(prop)` — new utility exported from `framework-detectors.ts` that returns the static string key of an object-literal property, accepting both `Identifier` and string-`Literal` forms.
- `findResourceAccess` / `hasAuthzCall` / `handlerHasVerification` now accept `TSESTree.Node` (widened from `BlockStatement`) to support concise-arrow handler bodies.
- `RECOMMENDED_RULES` / `STRICT_RULES` / `SECURITY_RULES` — now exported from `cli/utils/eslint-runner.ts` so the interactive `preset` UI and future tools can derive preset contents from a single source of truth.
- `init-context` now computes `ACTIVE_RULE_COUNT` from `RULE_CATEGORIES` so the generated agent-guidance count stays accurate as rules are added/removed.
- Test count: 608 → 627 (19 new regression tests across rounds 3 + 4).

## [2.0.0-beta.1] — 2026-04-15

First beta of the `@undercurrent/eslint-plugin-ai-guard` fork. Diverges from upstream `YashJadhav21/eslint-plugin-ai-guard@1.1.11`.

### ⚠️  BREAKING

- **Package renamed.** `eslint-plugin-ai-guard` → `@undercurrent/eslint-plugin-ai-guard`. Update imports in your flat config. The plugin-registration key (`"ai-guard"`) is unchanged.
- **ESLint 8 legacy config dropped.** v2.x supports ESLint 9 flat config only. Stay on upstream `eslint-plugin-ai-guard@1.x` if you need ESLint 8 support.
- **5 rules deprecated** (removed in v3.0.0). Replaced by superior upstream rules:
  - `ai-guard/no-await-in-loop` → ESLint core `no-await-in-loop`
  - `ai-guard/no-async-without-await` → `@typescript-eslint/require-await`
  - `ai-guard/no-redundant-await` → `@typescript-eslint/return-await`
  - `ai-guard/no-broad-exception` → `@typescript-eslint/no-explicit-any` + TypeScript `useUnknownInCatchVariables` compiler option
  - `ai-guard/no-catch-without-use` → `@typescript-eslint/no-unused-vars` with `{ caughtErrors: "all" }`
- **Presets cleaned.** The 5 deprecated rules are no longer present in `recommended` or `strict`. Users who want them must opt in explicitly. Deprecated rules emit findings with a `[ai-guard deprecated — use X]` prefix to surface the migration path.

### Added

- **`compat` preset.** New `aiGuard.configs.compat` — disables the 5 deprecated rules in one line, so users can enable the upstream replacements under their own control. See [`docs/guides/compat-config.md`](./docs/guides/compat-config.md).
- **Migration guide.** [`docs/migration/v1-to-v2.md`](./docs/migration/v1-to-v2.md) walks through the upgrade step-by-step.
- **Lineage note** in `README.md` crediting upstream author YashJadhav21 and documenting divergence rationale.

### Changed

- `package.json` `name`, `version`, `repository.url`, `bugs.url`, `homepage`, `author`, and `contributors` updated for the fork. `publishConfig.access: "public"` added.
- Plugin `meta.name`/`meta.version` aligned with package.
- Rule docs URLs in all 17 rules updated from `YashJadhav21/...` to `undercurrentai/...`.
- CLI unhandled-rejection crash link updated to the fork's issue tracker.

### Attribution

This fork is under MIT license, preserving upstream's license. Upstream author YashJadhav21 is credited as original author in `package.json#contributors` and in the README lineage note.

The fork pursues an independent scope (framework-deep, AI-risk-focused policy layer). Where we find fixes that apply to upstream's scope, we contribute back via PRs to [`YashJadhav21/eslint-plugin-ai-guard`](https://github.com/YashJadhav21/eslint-plugin-ai-guard).

### Coming in later v2.x betas

- `2.0.0-beta.2` — framework-aware auth/authz/webhook-signature trio.
- `2.0.0-beta.3` — layered secret detection (provider regex + context + entropy with split thresholds).
- `2.0.0-beta.4` — `.ai-guard/policy.yaml` policy compiler + 8-agent instruction file generation.
- `2.1.0` — narrowed single-function taint MVP.
