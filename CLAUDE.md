# CLAUDE.md — eslint-plugin-ai-guard

> Version: 4.0.0 | Updated: 2026-04-17 | Owner: @joshuakirby | Expires: 2026-10-17 (re-audit at expiry)
> Parent monorepo context: @../../CLAUDE.md
> Tier: `standard` (cloud-agnostic library; no AI runtime, no PII, no regulated processing).
> Suppressed addenda (with rationale in `docs/claude/audits/eslint-plugin-ai-guard.md`): GCP detection, AWS Quarantine, Live-Prod doctrine, AI Governance, OWASP Agentic, EU CRA/AI Act.

## 1. Purpose & Scope

**Is**: an ESLint 9 flat-config plugin (`@undercurrent/eslint-plugin-ai-guard`) plus a companion CLI (`ai-guard`) that delivers **framework-aware security lint for JS/TS routes and webhooks** — missing-auth, missing-authz, and unverified-webhook detection across Express 5, Fastify 5, Hono 4, NestJS 11, and Next.js 15 App Router — plus a supporting surface of async / error-handling / security / code-quality rules. Framework detection is import-map-, filename-, and decorator-aware; runs at editor speed (no `project: true` / no parserServices). Rules fire on any code, human or agent-authored, but are especially catching on AI-generated output (see `README.md` "Why AI-generated code is a common trigger"). Repository is a fork of `YashJadhav21/eslint-plugin-ai-guard@1.1.11` (MIT), with an active dual-track policy returning framework-agnostic correctness fixes upstream (first courtesy PR: `YashJadhav21/eslint-plugin-ai-guard#2`).

**Is not**: a service, a deployable app, an agent runtime. Contains zero AI/ML code itself — the AI is in the *target* code being linted. **Not yet on npm** — local tag is `v2.0.0-beta.2`; publish pending CI-workflow-registration fix (see `tasks/todo.md` Watch + `README.md` pre-release banner).

**Entry points**: `dist/index.{js,mjs,d.ts}` (plugin) and `dist/cli/index.js` (CLI binary, shebang). Source: `src/` (plugin) and `cli/` (CLI).

**Consumers** (post-publish): npm users via `import aiGuard from '@undercurrent/eslint-plugin-ai-guard'` in flat config, or `npx ai-guard {run|init|doctor|preset|ignore|baseline|init-context}`. Today (pre-publish): clone + `npm link`, or wait for `v2.0.0-beta.3`.

## 2. Workflow Orchestration

- **Plan Mode** for: any new rule, any rule deprecation, any change to `src/index.ts` shape, `tsup.config.ts` formats, or `cli/utils/eslint-runner.ts` rule maps. Skip plan for typo/comment fixes.
- **`tasks/todo.md`** tracks current plan; **`tasks/lessons.md`** accumulates corrections. Read both at session start; append after any user correction.
- **Subagents** for parallel rule-tester runs across multiple rules, deep AST research on a new framework, or migration-guide drafts. One task per subagent.
- **Verification before done**: `npm run typecheck && npm test && npm run lint` must pass locally. Never claim a rule works without a passing `RuleTester` invalid-case.
- **Demand elegance** for new rules and refactors that touch ≥3 files; skip for one-line fixes.

## 3. Agent Contract

### Allowed
- Read any file in repo; run `npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm run docs:dev`.
- Edit anything under `src/`, `cli/`, `tests/`, `docs/`, plus scaffold under `tasks/`, `docs/claude/`.
- Open PRs against `main`; respond to review.

### Out-of-Scope
- Publishing to npm (CI does this; never run `npm publish` locally).
- Force-pushing any branch.
- Editing `CHANGELOG.md` for already-released versions.
- Modifying upstream lineage notes in README/CONTRIBUTING without owner sign-off.

### Ask-First (always pause)
- Any edit to `src/index.ts` (default-export shape is load-bearing — see §4).
- Any edit to `tsup.config.ts` (CJS interop footer + dual-format invariants).
- Any edit to `cli/utils/eslint-runner.ts` `RECOMMENDED_RULES` / `STRICT_RULES` / `SECURITY_RULES` constants without a parallel edit to `src/configs/{recommended,strict,security}.ts` (these MUST mirror).
- Any edit to `package.json` `bin` / `exports` / `main` / `module` / `types` / `peerDependencies` / `engines`.
- Any edit to `.github/workflows/**` — especially `publish.yml` vs `release.yml` (dual release path; see audit `Lock-Step Dependencies`).
- Adding a new dependency to `dependencies` (CLI runtime cost) or `peerDependencies` (consumer impact).
- Removing a deprecated rule before it has soaked ≥2 minor versions in `src/configs/compat.ts`.
- Bumping `peerDependencies.eslint` floor or `engines.node` floor.

### Hard Stops (refuse)
- Commit any secret, token, `.env*` file, `.pem`, `.key`, npm token, or NPM provenance bypass.
- Add a named export to `src/index.ts` (breaks the manual CJS interop footer in `tsup.config.ts:27-36`; consumers `require()` would then need `.default`).
- Skip `prepublishOnly` (`typecheck && test && lint && build`) before any publish.
- Force-push to `main`.
- Downgrade `peerDependencies.eslint` below `^9.0.0` or `engines.node` below `>=18.0.0`.
- Delete a rule file from `src/rules/**` whose entry still exists in `src/configs/compat.ts` (breaks the deprecation soak contract).

## 4. Standards

- **Language**: TypeScript strict (`tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, ES2022, bundler resolution). CLI extends with `["node"]` types via `tsconfig.cli.json`.
- **Formatter**: ESLint stylistic rules only — no Prettier (per `CONTRIBUTING.md`).
- **Tests**: Vitest, `tests/**/*.test.ts`. Per-rule cases use `@typescript-eslint/rule-tester`. Coverage via `@vitest/coverage-v8` (excludes `src/index.ts` glue).
- **Commits**: Conventional Commits. Real scopes from history: `rules`, `cli`, `utils`, `m1`, `m2`, `docs`, `chore`, `fix`. Use `!` for breaking (`feat(m2)!:`).
- **PRs**: squash-merge to `main`. Body must describe (a) AI anti-pattern targeted, (b) before/after diff, (c) FP/TP characteristics if benchmarked, (d) upstream-cross-PR plan if applicable (dual-track per CONTRIBUTING).
- **Load-bearing invariants** (DO NOT VIOLATE):
  1. `src/index.ts` is **single-default-export only**. Named exports break the `tsup` CJS interop footer (`tsup.config.ts:27-36`); CJS consumers would have to reach through `.default`.
  2. `cli/utils/eslint-runner.ts` `RECOMMENDED_RULES` / `STRICT_RULES` / `SECURITY_RULES` mirror `src/configs/{recommended,strict,security}.ts` rule-for-rule, severity-for-severity. The CLI does not import the plugin's `configs` object; it ships its own copy. Any preset-severity change requires both edits in the same commit.
  3. The `framework` and `compat` presets are plugin-import-only (no CLI mirror) — `npx ai-guard run` cannot select them.
  4. Deprecated rules: `meta.deprecated: true` + `meta.replacedBy: [...]` + user-facing message prefix `[ai-guard deprecated — use <X>]` + entry in `src/configs/compat.ts` (off-only). Soak ≥2 minor versions before removal.
- **Adoption-First Severity Doctrine**: `recommended` keeps high-confidence rules at `error` and context-sensitive rules at `warn`/`off` to avoid overwhelming new adopters. `strict` raises everything to `error`. `security` is security-only with critical at `error`. `framework` is the 3-rule framework-aware trio. `compat` is off-only for deprecated rules.

## 5. Playbooks

### 5.1 Add a rule (5-place update)
1. Plan in `tasks/todo.md`; identify the AI anti-pattern (with a real `before` snippet).
2. Create `src/rules/<category>/<rule-name>.ts` via `ESLintUtils.RuleCreator` (URL: `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`).
3. Register in `src/rules/index.ts` `allRules`.
4. Add to relevant preset files (`src/configs/{recommended,strict,security,framework}.ts`) at intended severity.
5. **Mirror** the severity into `cli/utils/eslint-runner.ts` `*_RULES` map — same commit. (If only `framework`/`compat`, skip CLI mirror.)
6. Add `tests/rules/<rule-name>.test.ts` with `@typescript-eslint/rule-tester` valid + invalid cases. Add `tests/integration/<scenario>.test.ts` if framework-specific.
7. Author `docs/rules/<rule-name>.md` (intent, examples, options) + entry in `docs/rules/README.md` + stub line in `docs/rules.md`.
8. Update CHANGELOG `[Unreleased]` section.
9. `npm run typecheck && npm test && npm run lint && npm run docs:build` — all green.

### 5.2 Deprecate a rule
1. Set `meta.deprecated: true` + `meta.replacedBy: ['<new-rule>']` on the rule's `meta`.
2. Prefix the user-facing message with `[ai-guard deprecated — use <X>]`.
3. Remove from `recommended`/`strict`/`security` presets and CLI rule maps.
4. Add `'<rule>': 'off'` to `src/configs/compat.ts`.
5. Document the upstream replacement in `docs/migration/v1-to-v2.md` (or current migration doc) and CHANGELOG.
6. Soak ≥2 minor versions; only delete the rule file in the next major.

### 5.3 Bug fix on a rule
1. Reproduce as a failing case in `tests/rules/<rule>.test.ts` (or integration test) — commit the failing test first.
2. Read the rule + relevant `src/utils/{framework-detectors,async-scope}.ts` helpers.
3. Minimal fix; no surrounding cleanup.
4. Verify failing case now passes; full `npm test` green.
5. CHANGELOG `[Unreleased] Fixed` entry. If recurrence-worthy, append to `tasks/lessons.md`.

### 5.4 Release prep (do NOT publish locally)
1. Verify `package.json` `version` matches the planned tag.
2. Run the `prepublishOnly` chain manually: `npm run typecheck && npm run test && npm run lint && npm run build`.
3. Confirm CHANGELOG `[Unreleased]` is moved to a versioned heading with today's date.
4. Tag (`git tag v<X.Y.Z>`) and push tag — CI handles publish via `release.yml` (NPM_TOKEN path) **or** `publish.yml` (OIDC trusted publisher path). **Do not trigger both**; see audit `Lock-Step Dependencies` for which is authoritative.

## 6. Tooling & Commands

| Action | Command |
|---|---|
| Install | `npm install` |
| Build | `npm run build` (tsup → CJS+ESM plugin + CJS-only CLI in `dist/`) |
| Watch build | `npm run dev` |
| Test | `npm test` (vitest run) |
| Test single file | `npx vitest run tests/rules/<name>.test.ts` |
| Test with coverage | `npx vitest run --coverage.enabled` |
| Typecheck | `npm run typecheck` (tsc --noEmit on src; CLI typed separately) |
| Lint | `npm run lint` — **builds first**, then ESLint dogfoods `dist/` against `src cli tests` |
| Docs dev | `npm run docs:dev` (vitepress) |
| Docs build (CI gate) | `npm run docs:build` |
| Full pre-PR loop | `npm run typecheck && npm test && npm run lint && npm run docs:build` |

**Build-before-lint gotcha**: `eslint.config.mjs` imports `./dist/index.mjs` (the plugin dogfoods its own rules). If you change rule code, rebuild before linting.

**CI parity**: `.github/workflows/ci.yml` runs `npm ci → typecheck → build → test` on Node 20/22/24; quality job runs `lint && docs:build` on Node 20. (Node 18 was in the matrix until 2026-04-20; dropped when the first-ever CI run after workflow registration surfaced `@inquirer/prompts`' Node 20+ requirement via `node:util`'s `styleText`. Node 18 has also been EOL since 2025-04-30.)

## 7. Research & Documentation Tools

- **Context7** before any change to `@typescript-eslint/utils` / `@typescript-eslint/rule-tester` / `commander` / `tsup` API surface. Resolve ID first, then `query-docs` with topic.
- **Exa** for ESLint 9/10 ecosystem changes (e.g., flat-config breakage, peer-dep drift). Search includes `2026` to bias toward current.
- **Skip research** for changes purely inside `src/rules/**` AST logic — the AST is stable; prefer reading existing rules.

## 8. Security & Compliance

- **Secrets**: never committed. `.gitignore` covers `.env*` patterns indirectly via `*.tsbuildinfo`/log entries; verify before `git add`. NPM tokens live in GitHub Actions secrets only (`NPM_TOKEN` for `release.yml`); OIDC trusted publisher (`publish.yml`) needs no token.
- **License**: MIT. New deps must be MIT/ISC/BSD/Apache-2.0. Refuse copyleft.
- **Provenance**: both release workflows publish with `--provenance --access public` (npm OIDC). Do not remove the flag.
- **Supply chain**: `package-lock.json` is source of truth; never delete. `overrides` block pins `vite` and `esbuild` for transitive vuln mitigation — preserve.

## 9. Quality Gates

| Gate | Requirement |
|---|---|
| Pre-commit (manual) | `typecheck && test && lint` clean |
| CI `test` job | Node 20/22/24 matrix: `typecheck && build && test` |
| CI `quality` job | Node 20: `lint && docs:build` |
| Pre-publish | `prepublishOnly` script runs `typecheck && test && lint && build` automatically |
| Publish gate | Tag push (`v*`) OR GitHub Release event triggers npm publish via OIDC/token |
| Coverage | `@vitest/coverage-v8` excludes `src/index.ts`; no enforced floor (regression-monitor only) |

## 10. Ask-First / Refusal Matrix

| Action | Response | Source rule |
|---|---|---|
| Read any file | PROCEED | §3 Allowed |
| Run tests, build, lint, typecheck, docs | PROCEED | §3 Allowed |
| Edit `src/rules/**` (new logic, AST tweak) | PROCEED | §3 Allowed |
| Edit `tests/`, `docs/`, `cli/commands/` | PROCEED | §3 Allowed |
| Update `tasks/todo.md` or `tasks/lessons.md` | PROCEED | §2 Workflow |
| Edit `src/index.ts` | ASK | §3 Ask-First; preserves CJS interop |
| Edit `tsup.config.ts` | ASK | §3 Ask-First; build-format invariant |
| Edit `cli/utils/eslint-runner.ts` rule maps | ASK | §3 Ask-First; mirror invariant |
| Edit `package.json` (bin/exports/main/module/types/peerDeps/engines) | ASK | §3 Ask-First |
| Edit `.github/workflows/**` | ASK | §3 Ask-First; release path |
| Add new `dependencies` or `peerDependencies` entry | ASK | §3 Ask-First |
| Remove a deprecated rule still in `compat.ts` | ASK | §3 Ask-First; soak contract |
| Bump ESLint or Node floor | ASK | §3 Ask-First |
| Add named export to `src/index.ts` | REFUSE | §3 Hard Stop |
| Skip `prepublishOnly` | REFUSE | §3 Hard Stop |
| Run `npm publish` locally | REFUSE | §3 Out-of-Scope |
| Force-push to `main` | REFUSE | §3 Hard Stop |
| Commit secrets / `.env*` / `.pem` / `.key` | REFUSE | §3 Hard Stop |
| Downgrade peer-dep ESLint <9 or Node <18 | REFUSE | §3 Hard Stop |
| Delete rule file with live `compat.ts` entry | REFUSE | §3 Hard Stop |

(Mirrored mechanically into `.claude/settings.json` `permissions.deny` / `permissions.ask` — see audit `Lock-Step Dependencies`.)

## 11. Context Management

- `/clear` between distinct rule families (e.g., async-rule work then security-rule work).
- Subagent-liberal for: parallel `RuleTester` debugging across rules, deep framework-pattern research (Express vs Fastify vs Hono semantics), migration-doc drafting.
- `tasks/lessons.md` review at session start.

## 12. Change Management

- **Owners**: @joshuakirby (primary). Backup: TBD.
- **Update triggers**: new rule, rule deprecation, ESLint major bump (10.x widening), `@typescript-eslint/utils` major bump, peer-dep change, `tsup` major bump (esp. CJS interop semantics), CHANGELOG release.
- **Watch items** (logged 2026-04-17, re-check by 2026-10-17):
  - ESLint 10.0 (released Feb 2026): flat-config-only, raises Node floor to `^20.19.0 || ^22.13.0 || >=24`. Plugin currently caps at `eslint ^9.0.0` — widen to `^9.0.0 || ^10.0.0` next major.
  - typescript-eslint issue [#11543](https://github.com/typescript-eslint/typescript-eslint/issues/11543): `RuleCreator`-returned rules type-incompatible with downstream `defineConfig()`. Runtime fine; TS-only. Track upstream resolution before next major.
- **Audit log**: `docs/claude/audits/eslint-plugin-ai-guard.md`.
- **Re-audit at expiry**: 2026-10-17.

## 13. References

- Parent monorepo: @../../CLAUDE.md
- Contributing protocol (5-place rule add, deprecation soak): `CONTRIBUTING.md`
- v1→v2 migration: `docs/migration/v1-to-v2.md`
- Rule index: `docs/rules/README.md`
- Audit packet: `docs/claude/audits/eslint-plugin-ai-guard.md`
