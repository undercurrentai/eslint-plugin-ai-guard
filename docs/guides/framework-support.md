# Framework support

`@undercurrent/eslint-plugin-ai-guard` v2.0.0-beta.2 introduced framework-aware versions of the auth, authorization, and webhook-signature rules. This guide covers what is supported, how detection works, and what to do when the analyzer can't see across files.

## Supported frameworks

| Framework | Versions | Detection | Rules that activate |
| --- | --- | --- | --- |
| **Express** | 5.x | `import express from 'express'` / `require('express')` | `require-framework-auth`, `require-framework-authz`, `require-webhook-signature` |
| **Fastify** | 5.x | `import Fastify from 'fastify'` / `import { fastify } from 'fastify'` | `require-framework-auth`, `require-framework-authz`, `require-webhook-signature` |
| **Hono** | 4.x | `import { Hono } from 'hono'` | `require-framework-auth`, `require-framework-authz`, `require-webhook-signature` |
| **NestJS** | 11.x | `import ... from '@nestjs/common'` / `@nestjs/core` | `require-framework-auth`, `require-framework-authz` |
| **Next.js App Router** | 15.x | Filename `app/**/route.{ts,js,tsx,jsx}` (primary) plus `import ... from 'next/server'` (fallback) | `require-framework-auth`, `require-framework-authz`, `require-webhook-signature` |

Older versions are not officially supported but typically work — the rules look for surface-level patterns (decorators, exported HTTP-verb functions, chained `.get/.post` calls) that have been stable across major versions of each framework. If you find a v3-or-earlier idiom the rules miss, please open an issue.

## How framework detection works

Detection runs **per file** at lint time. The decision tree:

1. **Imports first.** The rule scans top-level `ImportDeclaration` and `require(...)` calls for any of the framework-identifying packages above. If a match is found, the file is treated as belonging to that framework for the rest of the lint pass.
2. **Filename fallback (Next.js only).** If no framework import is detected, the rule checks the file path against the Next.js App Router convention (`**/app/**/route.{ts,js,tsx,jsx}`). This catches `route.ts` files that import their own helpers but not `next/server` directly.
3. **No framework detected.** If neither check matches, the framework-aware rules **do not fire** for that file. This is intentional — better to under-report on unrecognized stacks than to spam findings on, say, a CLI tool that happens to define a function called `get`.

You can verify what was detected for a given file by running:

```bash
npx ai-guard run --debug-framework path/to/file.ts
```

(`--debug-framework` ships in v2.0.0-beta.2 and emits one line per file showing the detected framework or `none`.)

### Why import-based and not config-based

The rules deliberately do **not** read your `package.json` to choose a framework. A monorepo with one Express service and one Fastify service would lint both correctly, file by file, because each file's imports tell the truth. A `package.json`-based heuristic would either pick one or require complex per-package config.

## The `compat` preset for v1 migrations

If you're upgrading from v1.x and want a one-line opt-out of the deprecated rules, use the `compat` preset. The framework-aware rules are **off by default** in `compat` so you can adopt them on your own schedule:

```javascript
// eslint.config.mjs
import aiGuard from "@undercurrent/eslint-plugin-ai-guard";

export default [
  {
    plugins: { "ai-guard": aiGuard },
    rules: {
      ...aiGuard.configs.recommended.rules,
      ...aiGuard.configs.compat.rules, // turns off the 7 deprecated rules

      // Framework-aware rules — opt in when you're ready
      "ai-guard/require-framework-auth": "warn",
      "ai-guard/require-framework-authz": "warn",
      "ai-guard/require-webhook-signature": "warn",

      // Old generic rules — leave on transitionally, or turn off
      "ai-guard/require-auth-middleware": "off", // superseded by require-framework-auth
      "ai-guard/require-authz-check": "off",     // superseded by require-framework-authz
    },
  },
];
```

The two old rules (`require-auth-middleware`, `require-authz-check`) are still **on** in `recommended` for v2.x to avoid breaking existing v1 users who relied on them. They will be **removed in v3.0.0**. See [`docs/migration/v1-to-v2.md`](../migration/v1-to-v2.md) for the full timeline.

For a config that uses **only** the framework-aware rules and has cleanly retired the deprecated ones:

```javascript
import aiGuard from "@undercurrent/eslint-plugin-ai-guard";

export default [
  {
    plugins: { "ai-guard": aiGuard },
    rules: {
      ...aiGuard.configs.recommended.rules,
      ...aiGuard.configs.compat.rules,

      "ai-guard/require-auth-middleware": "off",
      "ai-guard/require-authz-check": "off",

      "ai-guard/require-framework-auth": "error",
      "ai-guard/require-framework-authz": "error",
      "ai-guard/require-webhook-signature": "error",
    },
  },
];
```

## Cross-file limitations

The framework-aware rules are **single-file analyzers**. They do not chase imports, decorator metadata, module wiring, or middleware composition across files. Two patterns are commonly affected:

### 1. NestJS `APP_GUARD`

A global guard registered in `AppModule` providers protects every controller in the application:

```typescript
// app.module.ts
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/jwt.guard';

@Module({
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
```

But `require-framework-auth` analyzes `users.controller.ts` in isolation — it sees no `@UseGuards`, so it flags every handler.

### 2. Next.js root `middleware.ts`

A root `middleware.ts` with a matcher gates every matched route:

```typescript
// middleware.ts
export { auth as middleware } from '@/auth';
export const config = { matcher: ['/api/:path*'] };
```

But `require-framework-auth` analyzes `app/api/users/[id]/route.ts` in isolation — it sees no auth call, so it flags `GET` / `POST`.

### Workaround: `assumeGlobalAuth: true`

Set the rule's `assumeGlobalAuth` option to `true`:

```javascript
rules: {
  'ai-guard/require-framework-auth': ['error', {
    assumeGlobalAuth: true,
    publicRoutePatterns: ['/health', '/api/auth/*'], // routes excluded from your global guard
  }],
}
```

When `assumeGlobalAuth` is on, the rule:

- Assumes authentication is enforced **outside** the file under analysis.
- Only fires when a handler explicitly opts out of auth (e.g., a NestJS controller method decorated with `@Public()` that is **not** in `publicRoutePatterns`).
- Means you must keep `publicRoutePatterns` in sync with your middleware matcher exclusion list / public-route decorators.

### Workaround: scope-based file overrides

If only some files need `assumeGlobalAuth`, use ESLint's `files` overrides:

```javascript
export default [
  // Default: explicit per-handler auth required
  {
    files: ['src/server/express/**/*.ts'],
    rules: { 'ai-guard/require-framework-auth': 'error' },
  },
  // Next.js routes: middleware.ts handles auth globally
  {
    files: ['app/**/route.ts', 'app/**/route.tsx'],
    rules: {
      'ai-guard/require-framework-auth': ['error', { assumeGlobalAuth: true }],
    },
  },
  // NestJS: APP_GUARD handles auth globally
  {
    files: ['src/server/nest/**/*.controller.ts'],
    rules: {
      'ai-guard/require-framework-auth': ['error', { assumeGlobalAuth: true }],
    },
  },
];
```

### What about cross-file authorization?

`require-framework-authz` has the same single-file limitation, but the workaround is different: add your wrapper helper's name to `authzHelperNames`. See [`require-framework-authz`](../rules/require-framework-authz.md#policy-library-detection-requires-the-import) for details.

## Reporting unsupported patterns

If you run into a framework idiom the rules don't recognize — a custom decorator, a router builder, an unusual middleware composition — please open an issue with a 5–10 line minimal repro at [undercurrentai/eslint-plugin-ai-guard](https://github.com/undercurrentai/eslint-plugin-ai-guard/issues/new). Single-file analysis means each new pattern usually only takes a small detector addition.
