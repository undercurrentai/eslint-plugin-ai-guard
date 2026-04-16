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

8 correctness fixes applied during the audit phase, each covered by regression tests:

- Decorator detection now handles member-expression form (`@Common.UseGuards()`) — previously silently skipped NestJS methods using barrel-imported decorators.
- `isRouteDefinition` now unwraps `TSAsExpression` / `TSNonNullExpression` / `TSSatisfiesExpression` — previously `(app as Application).get(...)` was not detected.
- Express chained `.route('/x').post(auth, handler)` form now handled correctly — previously misread the auth middleware as the path.
- Hono multi-method `app.on(['POST','PUT'], path, handler)` form now detected.
- NestJS static methods on `@Controller` classes are now skipped (they're not HTTP-dispatched).
- `require-framework-authz` now detects destructured `const { id } = req.params` patterns and supports Fastify's `request.` prefix (not just Express's `req.`).
- AST walkers skip nested `FunctionDeclaration` bodies to avoid false-negatives from dead-code authz/verification calls in never-invoked helpers.
- Top-level `app/route.ts` (App Router root catch-all) now correctly detected as a Next.js route handler.

### Internal

- Removed inherited-from-upstream dead utility file `src/utils/ast-helpers.ts` (0 callers).

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
