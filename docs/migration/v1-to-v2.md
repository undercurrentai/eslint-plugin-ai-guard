# Migrating from `eslint-plugin-ai-guard` v1.x to `@undercurrent/eslint-plugin-ai-guard` v2.x

v2.0 is a hard fork of [`YashJadhav21/eslint-plugin-ai-guard`](https://github.com/YashJadhav21/eslint-plugin-ai-guard) diverging at upstream v1.1.11. The `@undercurrent` fork drops the general-purpose "AI lint preset" positioning in favor of a **framework-deep, AI-risk-focused policy layer** for agent-written JS/TS application code.

This guide is the migration checklist for users of v1.x.

## TL;DR

1. Uninstall `eslint-plugin-ai-guard`, install `@undercurrent/eslint-plugin-ai-guard@next`.
2. Update `eslint.config.mjs` imports and plugin registrations.
3. (Optional) Add the `compat` preset and enable the upstream replacements for the 5 deprecated rules.
4. Run `npx ai-guard run` and confirm diagnostic counts align with your baseline.

## Step 1 — uninstall the upstream package

```bash
npm uninstall eslint-plugin-ai-guard
npm install --save-dev @undercurrent/eslint-plugin-ai-guard@next
```

Leaving both installed is fine transiently but will emit duplicate diagnostics. `npx ai-guard doctor` (ships in a later v2 beta) will warn if both are present.

## Step 2 — update imports

**Before (v1.x):**

```javascript
import aiGuard from "eslint-plugin-ai-guard";

export default [
  {
    plugins: { "ai-guard": aiGuard },
    rules: { ...aiGuard.configs.recommended.rules },
  },
];
```

**After (v2.x):**

```javascript
import aiGuard from "@undercurrent/eslint-plugin-ai-guard";

export default [
  {
    plugins: { "ai-guard": aiGuard },
    rules: { ...aiGuard.configs.recommended.rules },
  },
];
```

The plugin-registration key (`"ai-guard"`) and the preset shape are unchanged. Only the npm import path differs.

## Step 3 — deprecated rules (5)

The following rules are marked `meta.deprecated: true` in v2.0.0 and will be **removed in v3.0.0**.

| `ai-guard` rule (deprecated) | Upstream replacement |
| --- | --- |
| `ai-guard/no-await-in-loop` | ESLint core [`no-await-in-loop`](https://eslint.org/docs/latest/rules/no-await-in-loop) |
| `ai-guard/no-async-without-await` | [`@typescript-eslint/require-await`](https://typescript-eslint.io/rules/require-await/) |
| `ai-guard/no-redundant-await` | [`@typescript-eslint/return-await`](https://typescript-eslint.io/rules/return-await/) |
| `ai-guard/no-broad-exception` | [`@typescript-eslint/no-explicit-any`](https://typescript-eslint.io/rules/no-explicit-any/) (catches `catch (e: any)`) + TypeScript's [`useUnknownInCatchVariables`](https://www.typescriptlang.org/tsconfig#useUnknownInCatchVariables) compiler option (forces `catch (e)` to be typed as `unknown`) |
| `ai-guard/no-catch-without-use` | [`@typescript-eslint/no-unused-vars`](https://typescript-eslint.io/rules/no-unused-vars/) with `{ caughtErrors: "all" }` |

### Visible changes

- v2 `recommended` and `strict` presets **no longer include** these 5 rules. If you were relying on them through a preset, their coverage drops to zero unless you opt in explicitly.
- If you had any of these 5 rules **explicitly configured** in your own config, they keep firing in v2.x — but each finding's message is prefixed with `[ai-guard deprecated — use <X>]` so your editor and CI surface the migration path.

### Recommended migration

Add the `compat` preset and the upstream replacements to your config:

```javascript
import aiGuard from "@undercurrent/eslint-plugin-ai-guard";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  {
    plugins: { "ai-guard": aiGuard },
    rules: {
      ...aiGuard.configs.recommended.rules,
      ...aiGuard.configs.compat.rules,   // disables the deprecated 5 in case you had them on

      // Upstream replacements — severities are examples; tune to your team
      "no-await-in-loop": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "caughtErrors": "all" }],
      // Also recommended: set "useUnknownInCatchVariables": true in tsconfig.json
      // for the `catch (e: unknown)` narrowing behavior the deprecated
      // ai-guard/no-broad-exception previously offered.
    },
  },
];
```

See [`docs/guides/compat-config.md`](../guides/compat-config.md) for more examples.

## Step 4 — ESLint 8 support is dropped

v2.x supports **ESLint 9 flat config only**. If you are still on ESLint 8 legacy config, stay on the upstream package (`eslint-plugin-ai-guard@1.x`) until you can migrate to flat config.

## Step 5 — verify

```bash
npx ai-guard run --preset=recommended
```

You should see the same rule IDs fire as before (minus the 5 deprecated rules). The finding count for the remaining 12 rules should be stable.

If finding counts diverge significantly, please open an issue with before/after counts at [undercurrentai/eslint-plugin-ai-guard](https://github.com/undercurrentai/eslint-plugin-ai-guard/issues/new) — we track regressions closely via the downstream canary workflow.

## What's coming in later v2.x betas

- **v2.0.0-beta.2** — framework-aware auth/authz/webhook-signature rules for Express 5, Fastify 4/5, NestJS 10/11, Next.js 14/15 App Router, Hono 4. Replaces the generic `require-auth-middleware` and `require-authz-check` with framework-pinned detection.
- **v2.0.0-beta.3** — layered secret detection (provider regex → name heuristic → entropy with split base64/hex thresholds).
- **v2.0.0-beta.4** — `.ai-guard/policy.yaml` compiler emitting ESLint config, semgrep subset, SARIF 2.1.0, and 8-agent instruction files (Claude Code, Cursor, Copilot, Continue, Aider, Windsurf, Zed, JetBrains AI).
- **v2.1.0** — narrowed single-function taint MVP replacing `no-unsafe-deserialize`.

See the [project plan](https://github.com/undercurrentai/eslint-plugin-ai-guard) for the full milestone breakdown.

## What will break in v3.0.0

- The 5 deprecated rules will be **removed** (not just off-by-default).
- `require-auth-middleware` and `require-authz-check` will be removed in favor of the framework-aware trio shipped in v2.0.0-beta.2.
- `no-unsafe-deserialize` will be removed in favor of `no-unvalidated-input-in-risky-sinks` shipped in v2.1.0.

v3.0.0 will ship no earlier than 3 months after v2.0.0 reaches `latest`. The deprecation messages in v2.x give you time.
