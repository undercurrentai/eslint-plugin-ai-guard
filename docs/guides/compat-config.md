# Compat config

The `compat` preset disables the 7 `ai-guard` rules that were deprecated in the v2.x line. The first 5 overlap with rules shipped by ESLint core or `@typescript-eslint`; the last 2 (added in v2.0.0-beta.2) are superseded by the new framework-aware rules.

Use `compat` when you want a **deterministic, one-line opt-out** from the deprecated rules. The preset does *not* magically auto-detect other plugins — it simply turns off `ai-guard`'s duplicates, so you can enable the stronger upstream equivalents in your own config.

## What it disables

**Deprecated in v2.0.0-beta.1 (upstream-covered):**

| `ai-guard` rule (deprecated) | Recommended replacement |
| --- | --- |
| `ai-guard/no-await-in-loop` | ESLint core: [`no-await-in-loop`](https://eslint.org/docs/latest/rules/no-await-in-loop) |
| `ai-guard/no-async-without-await` | [`@typescript-eslint/require-await`](https://typescript-eslint.io/rules/require-await/) |
| `ai-guard/no-redundant-await` | [`@typescript-eslint/return-await`](https://typescript-eslint.io/rules/return-await/) |
| `ai-guard/no-broad-exception` | [`@typescript-eslint/no-explicit-any`](https://typescript-eslint.io/rules/no-explicit-any/) + TypeScript's [`useUnknownInCatchVariables`](https://www.typescriptlang.org/tsconfig#useUnknownInCatchVariables) |
| `ai-guard/no-catch-without-use` | [`@typescript-eslint/no-unused-vars`](https://typescript-eslint.io/rules/no-unused-vars/) with `{ caughtErrors: "all" }` |

**Deprecated in v2.0.0-beta.2 (replaced by framework-aware rules):**

| `ai-guard` rule (deprecated) | Recommended replacement |
| --- | --- |
| `ai-guard/require-auth-middleware` | [`ai-guard/require-framework-auth`](../rules/require-framework-auth.md) |
| `ai-guard/require-authz-check` | [`ai-guard/require-framework-authz`](../rules/require-framework-authz.md) |

## Usage — flat config (ESLint 9)

### Option A: compat preset alongside `ai-guard/recommended`

```javascript
// eslint.config.mjs
import aiGuard from "@undercurrent/eslint-plugin-ai-guard";
import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  {
    plugins: { "ai-guard": aiGuard },
    rules: {
      // ai-guard rules you want on
      ...aiGuard.configs.recommended.rules,
      // Disable ai-guard's deprecated rules
      ...aiGuard.configs.compat.rules,

      // Enable the upstream replacements
      "no-await-in-loop": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { "caughtErrors": "all" }],
      // Also recommended: set "useUnknownInCatchVariables": true in tsconfig.json
      // for the behavior the deprecated ai-guard/no-broad-exception offered for `catch (e: unknown)`.
    },
  },
];
```

### Option B: compat-only (for users who maintain custom ai-guard rule maps)

```javascript
import aiGuard from "@undercurrent/eslint-plugin-ai-guard";

export default [
  {
    plugins: { "ai-guard": aiGuard },
    rules: {
      // Your custom ai-guard rule selection
      "ai-guard/no-empty-catch": "error",
      "ai-guard/no-floating-promise": "error",
      // …
      // Then the compat preset to explicitly disable all deprecated rules
      ...aiGuard.configs.compat.rules,
    },
  },
];
```

## Why compat isn't a drop-in "give me all upstream equivalents" preset

Cross-plugin rule activation from inside an `ai-guard` preset would:

- require `@typescript-eslint/eslint-plugin` as a hard peer dependency,
- break for users who use different style / severity / option choices for the upstream rules,
- make future upstream renames invisible breakages here.

Keeping `compat` as an off-only preset means the semantics are stable: it always turns off the currently-deprecated ai-guard rules (7 as of v2.0.0-beta.2). The replacement rules you add alongside are entirely under your control.

## Why we didn't just delete the deprecated rules

v2.x retains them (marked `meta.deprecated: true`) so that existing configs referencing them keep parsing. Findings emit with an `[ai-guard deprecated — use X]` prefix so users see the migration path in their editor/CI output rather than getting silent zero findings after upgrade.

They will be **removed in v3.0.0**. See [`docs/migration/v1-to-v2.md`](../migration/v1-to-v2.md) for the full migration checklist.
