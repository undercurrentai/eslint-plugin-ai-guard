# tasks/lessons.md

> Append a new entry whenever a user correction reveals a rule worth not re-learning.
> Format: short title, **Why**, **How to apply**, source (commit/PR/issue if applicable).

## L001 — Adding a rule is a 5-place update, not 1

**Why**: The plugin's `allRules` registry, three preset configs, the CLI's parallel rule maps, and the docs index are all separate sources of truth. Skipping any one of them ships a rule that loads but doesn't run, runs at the wrong severity, or has no docs link.

**How to apply**: For any new rule, edit in this order in a single commit: (1) `src/rules/<category>/<name>.ts`, (2) `src/rules/index.ts` `allRules`, (3) `src/configs/{recommended,strict,security,framework}.ts` at intended severity, (4) `cli/utils/eslint-runner.ts` `*_RULES` map (only for the 3 CLI-exposed presets), (5) `docs/rules/<name>.md` + `docs/rules/README.md` entry + `docs/rules.md` stub. Then `npm run typecheck && npm test && npm run lint && npm run docs:build`.

**Source**: `CONTRIBUTING.md` "Creating a New Rule".

## L002 — `src/index.ts` is single-default-export ONLY

**Why**: `tsup` 8.5.x's `cjsInterop: true` is a no-op for our entry shape. We manually append `module.exports = module.exports.default` in the CJS output via `tsup.config.ts:27-36`. Adding a named export to `src/index.ts` would survive the build but force CJS consumers to reach through `.default` — silently breaking `const aiGuard = require('@undercurrent/eslint-plugin-ai-guard')`.

**How to apply**: Never add `export const X = ...` or `export { X }` to `src/index.ts`. Expose new surface via the `plugin` object's `rules` / `configs` / `meta`. If you must add a top-level named export, also update the CJS interop footer and add a regression test that `require()`-loads the built `dist/index.js` and asserts `.rules`, `.configs`, `.meta` exist directly (no `.default` reach).

**Source**: `src/index.ts:8-11` (header comment), `tsup.config.ts:7-11`.

## L003 — `cli/utils/eslint-runner.ts` rule maps MUST mirror `src/configs/*` severities

**Why**: The CLI does not import the plugin's `configs` object — it ships its own `RECOMMENDED_RULES` / `STRICT_RULES` / `SECURITY_RULES` constants and runs ESLint programmatically with them. Drift between the plugin presets and CLI maps means `npx ai-guard run --strict` reports different findings than ESLint with `aiGuard.configs.strict.rules`. The `framework` and `compat` presets are deliberately NOT mirrored (CLI exposes only the 3 via `--preset`).

**How to apply**: Every preset-severity edit in `src/configs/{recommended,strict,security}.ts` must land in the same commit as the matching edit in `cli/utils/eslint-runner.ts:77-114`. Treat the file pair as atomic. PRs that touch one without the other should fail review. `tests/configs/mirror.test.ts` (added 2026-04-18) enforces this as a Vitest assertion — any severity drift on active (error/warn) rules fails the suite.

**Source**: `cli/utils/eslint-runner.ts:71-114` (header comment "kept in sync with src/configs/recommended.ts"), `CONTRIBUTING.md` step 4, `tests/configs/mirror.test.ts`.

## L004 — AST-shape-under-matching is a recurring regression class

**Why**: Rules are frequently written to match the single most common AST shape of a pattern, then quietly miss equivalent shapes. Cycle 1 of quality-gate (2026-04-18) surfaced 7 instances in one pass:
- Identifier-only property keys (missed quoted `{ 'apiKey': '...' }` and bracketed `obj['apiKey'] = '...'`)
- `new Function()`-only constructor hook (missed bare `Function()` without `new` — same RCE, per ECMA-262)
- `BinaryExpression '+'`-only concat traversal (missed mixed template-literal + concat SQL injection)
- `[...];`-only array-close detection (missed `export default defineConfig([...]);`)
- `FunctionDeclaration`-only STOP_DESCENT (dead-class-method bodies still satisfied framework-auth checks)
- Nested-function descent in `nodeHasCatchClause` (inner try/catch suppressed outer floating-promise report)
- Unanchored `(\/|$|\.)` route-extension regex (matched `/favicon.xyz.png` as public)

Each individual bug is small. As a *class*, it's the single largest FN/FP source in this codebase.

**How to apply**: When writing or reviewing a rule visitor that conditions on an AST shape, enumerate all equivalent shapes AI-codegen can produce:
1. Keys: Identifier vs string-Literal; `node.computed` true vs false; bracket vs dot member.
2. Constructors: `new X(...)` vs `X(...)` vs `globalThis.X(...)` / `window.X(...)`.
3. Bodies: `BlockStatement` vs concise-arrow expression body vs `ChainExpression` wrapper vs `TSAsExpression` / `TSTypeAssertion` / `TSNonNullExpression` / `TSSatisfiesExpression` wrappers.
4. Routes: direct `.METHOD()` vs chained `.route().METHOD()` vs options-object `.route({...})` vs Hono-multi-method `.on([...])`.
5. Descent: class-scope (`ClassDeclaration` / `ClassExpression` / `MethodDefinition`) and function-scope (`FunctionDeclaration` / `FunctionExpression` / `ArrowFunctionExpression`) boundaries both matter for "declared but not invoked" detection.
6. Regexes in public/private path allow-lists: anchor with `(\/|$)` or specific suffix anchors, never bare `(\.)` which matches any dotted suffix.

Use the shared helpers already in `src/utils/framework-detectors.ts` (`getStaticPropKey`, `getPathString`, `getMemberPath`, `unwrapTSExpression`, `STOP_DESCENT_NODE_TYPES`) and `src/utils/async-scope.ts` (`FUNCTION_SCOPE_BOUNDARY_TYPES`) instead of reimplementing shape checks per rule.

**Source**: `CHANGELOG.md` `[Unreleased]` section; cycle 1 commit `4cd0ee9`; `.quality-gate/cycle-1-deferred-findings.md`.
