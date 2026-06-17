# require-server-action-auth

**Category:** Security | **Severity:** `off` (recommended), `warn` (security, framework), `error` (strict)

---

## What it does

Flags **Next.js Server Actions** (`'use server'`) that contain no visible authentication / authorization check.

A Server Action is an exported `async` function in a file with a top-level `'use server'` directive, or any exported `async` function whose own body begins with `'use server'`. Per the [Next.js docs](https://nextjs.org/docs/app/api-reference/directives/use-server), a Server Action is **reachable via a direct `POST` request, not just through your UI** — so authentication and authorization must be verified **inside every action**, exactly as you would for a public API route. UI-level gating (hiding a button) does nothing.

The rule recognizes a check when the action body calls one of: `auth`, `currentUser`, `getServerSession`, `getToken`, `verifySession`, `getUser`, `getSession`, `requireUser`, `requireSession`, `requireAuth`, `supabase.auth.getUser`, `auth.protect`, or the App Router `unauthorized()` / `forbidden()` helpers. Extend the set with the `authCallers` option.

## Why it matters

```ts
// ❌ Unauthenticated mutation endpoint — anyone who can POST can delete any account.
'use server';
export async function deleteAccount(id: string) {
  return db.account.delete(id);   // ← no session check
}
```

```ts
// ✅ Verified inside the action.
'use server';
import { auth } from '@/lib/auth';
export async function deleteAccount(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error('Unauthorized');
  return db.account.delete(id);
}
```

AI assistants frequently scaffold a Server Action that does the mutation and skips the session check, because the directive *looks* like a framework boundary that "must" be protected. It is not — the action is a public POST endpoint.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `authCallers` | `string[]` | `[]` | Additional function/method names recognized as an auth or session check. |
| `assumeMiddlewareAuth` | `boolean` | `false` | If `true`, suppress the rule entirely (you attest a middleware / Data-Access-Layer gate protects all Server Actions). |

**Why `assumeMiddlewareAuth` defaults to `false`:** Next.js `middleware.ts` most often does i18n, redirects, and rewrites — *not* auth — and the framework documentation explicitly requires verifying auth **inside** each Server Action. Auto-trusting an unseen middleware would convert a false positive into a far more dangerous missed-auth **false negative**. Enable it only when you genuinely centralize auth in a gate the linter cannot see.

## Scope & known limitations

- **Exported `async` functions only.** A Server Action must be exported (to be client-reachable) and `async`. Non-exported helpers and synchronous exports in a `'use server'` file are not flagged. Inline server-action closures assigned to variables and not exported are out of scope (they are not directly POST-reachable as a named action).
- **Call-presence, not result-gating (name-matched).** Like the other framework-aware rules, this confirms an auth call *exists* in the body by name; it cannot prove (at AST level, with no type info) that the result actually blocks the mutation, nor that the call is the real auth library. So `await auth()` whose result is ignored, a local `function auth(){}`, or an unrelated `logger.auth()` will all read as "an auth step is present." Treat a clean result as "an auth step is present," not "auth is correctly enforced." This is a deliberate, family-wide heuristic shared with `require-framework-auth`.
- **Re-exports across modules.** `export { foo } from './actions'` is not analyzed (the action body lives in another module the rule can't see without type information). `export { foo }` / `export default foo` of a *locally* declared async function **are** resolved and checked.
- **Off by default in `recommended`.** Because Server Actions legitimately vary in how they centralize auth, the rule is `off` in the adoption-first `recommended` preset and opt-in via `strict` / `security` / `framework` (or an explicit enable).
