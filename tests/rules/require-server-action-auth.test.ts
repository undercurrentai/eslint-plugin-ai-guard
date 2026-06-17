import { RuleTester } from '@typescript-eslint/rule-tester';
import { requireServerActionAuth } from '../../src/rules/security/require-server-action-auth';
import { afterAll, describe, it } from 'vitest';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('require-server-action-auth', requireServerActionAuth, {
  valid: [
    // 1. File-level 'use server' + exported async action WITH auth() — verified.
    {
      code: `
        'use server';
        import { auth } from '@/lib/auth';
        export async function createUser(data) {
          const session = await auth();
          if (!session?.user) throw new Error('Unauthorized');
          return db.user.create({ data });
        }
      `,
    },
    // 2. Function-level 'use server' + verifySession() — verified.
    {
      code: `
        export async function updateProfile(formData) {
          'use server';
          const session = await verifySession();
          if (!session) return null;
          return save(formData);
        }
      `,
    },
    // 3. unauthorized() helper counts as the check.
    {
      code: `
        'use server';
        import { unauthorized } from 'next/navigation';
        export async function remove(id) {
          const s = await verifySession();
          if (!s) unauthorized();
          return db.delete(id);
        }
      `,
    },
    // 4. export default async action with auth — verified.
    {
      code: `
        'use server';
        export default async function action(fd) {
          const u = await currentUser();
          if (!u) throw new Error('no');
          return mutate(fd);
        }
      `,
    },
    // 5. Concise-arrow exported async action with auth in a 'use server' file.
    {
      code: `
        'use server';
        export const doThing = async (x) => (await auth()) ? mutate(x) : null;
      `,
    },
    // 6. FP-GUARD: NON-exported async helper in a 'use server' file is not a Server
    //    Action (not client-reachable) — must NOT flag even without auth.
    {
      code: `
        'use server';
        async function internalHelper(x) { return compute(x); }
        export async function publicAction(x) {
          const s = await auth();
          if (!s) throw new Error('no');
          return internalHelper(x);
        }
      `,
    },
    // 7. FP-GUARD: a SYNC exported fn in a 'use server' file is not a Server Action.
    {
      code: `
        'use server';
        export function helperConst(x) { return x * 2; }
      `,
    },
    // 8. FP-GUARD (the big one): an ordinary module WITHOUT 'use server' — an exported
    //    async fn with no auth is NOT a Server Action and must NOT be flagged. This is
    //    what keeps the rule from firing on every async export in the codebase.
    {
      code: `
        export async function fetchPublicData(id) {
          return db.query(id);
        }
      `,
    },
    // 9. assumeMiddlewareAuth: true → suppressed even when the action lacks auth.
    {
      code: `
        'use server';
        export async function createThing(data) { return db.create(data); }
      `,
      options: [{ assumeMiddlewareAuth: true }],
    },
    // 10. Custom authCallers recognized.
    {
      code: `
        'use server';
        export async function customAction(data) {
          await ensureTenantAccess();
          return db.create(data);
        }
      `,
      options: [{ authCallers: ['ensureTenantAccess'] }],
    },
    // 11. Regression armor: destructured `await auth()` — the most common real auth
    //     shape; must be recognized as verified.
    {
      code: `
        'use server';
        export async function createUser(data) {
          const { userId } = await auth();
          if (!userId) throw new Error('no');
          return db.user.create({ data });
        }
      `,
    },
    // 12. Regression armor: member-path caller auth.protect() / supabase.auth.getUser().
    {
      code: `
        'use server';
        export async function mutate(d) {
          await auth.protect();
          return db.write(d);
        }
      `,
    },
    // 13. declared-then-exported async fn WITH auth, via specifier — verified, no flag.
    {
      code: `
        'use server';
        async function createUser(data) {
          const s = await auth();
          if (!s) throw new Error('no');
          return db.user.create({ data });
        }
        export { createUser };
      `,
    },
    // 14. async GENERATOR export in a 'use server' file — not a valid Server Action;
    //     must NOT be flagged (FP-guard).
    {
      code: `
        'use server';
        export async function* streamThings() {
          yield* db.stream();
        }
      `,
    },
  ],
  invalid: [
    // 1. File-level 'use server' + exported async action with NO auth → flag.
    {
      code: `
        'use server';
        export async function createUser(data) {
          return db.user.create({ data });
        }
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 2. Function-level 'use server' + no auth → flag.
    {
      code: `
        export async function deleteAccount(id) {
          'use server';
          return db.account.delete(id);
        }
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 3. export const = async arrow, file-level 'use server', no auth → flag.
    {
      code: `
        'use server';
        export const updateSettings = async (data) => {
          await db.settings.update(data);
        };
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 4. export default async, 'use server' file, no auth → flag.
    {
      code: `
        'use server';
        export default async function (formData) {
          return db.submit(formData);
        }
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 5. Two exported actions, only one authed → flag exactly the unauthed one.
    {
      code: `
        'use server';
        export async function safeAction(d) {
          const s = await auth();
          if (!s) throw new Error('no');
          return db.a(d);
        }
        export async function unsafeAction(d) {
          return db.b(d);
        }
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 6. FN-1 fix (security-auditor CRITICAL): declared-then-exported action via
    //    `export { foo }` specifier, no auth → must flag (was silently missed).
    {
      code: `
        'use server';
        async function createUser(data) {
          return db.user.create({ data });
        }
        export { createUser };
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 7. FN-1 fix: renamed specifier export of an unauthed action → flag.
    {
      code: `
        'use server';
        async function internal(d) { return db.b(d); }
        export { internal as publicAction };
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 8. FN-1 fix: `export default <identifier>` of a separately-declared unauthed
    //    action → flag.
    {
      code: `
        'use server';
        const act = async (fd) => db.submit(fd);
        export default act;
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
    // 9. Dedupe (ultrathink): one unverified action exposed via BOTH a named specifier
    //    and a default export must report exactly ONCE (not once per export surface).
    {
      code: `
        'use server';
        async function foo(d) { return db.write(d); }
        export { foo };
        export default foo;
      `,
      errors: [{ messageId: 'missingServerActionAuth' }],
    },
  ],
});
