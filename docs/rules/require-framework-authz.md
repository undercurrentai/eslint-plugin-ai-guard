# require-framework-authz

**Category:** Security | **Severity:** `warn` (recommended, security), `error` (strict)

---

## What it does

Flags route handlers that look up a resource by an identifier from request input (`req.params.id`, `c.req.param('id')`, `@Param('id')`, Next.js dynamic segments) without a visible **authorization** check — i.e., without verifying that the authenticated user is permitted to access that specific resource.

The rule recognizes authorization through:

- **Inline ownership checks** — `resource.userId === req.user.id`, `resource.ownerId !== session.user.id`, etc.
- **Query-scoped lookups** — `findOne({ id, userId: req.user.id })`, `where: { id, authorId: session.user.id }`
- **Helper functions** — common names (`can`, `cannot`, `authorize`, `checkPermission`, `assertOwnership`, `enforceAccess`) plus configurable additions via `authzHelperNames`.
- **Policy libraries** — when the corresponding import is present in the file:
  - **CASL** (`@casl/ability`) — `ability.can('read', resource)`, `ForbiddenError.from(ability).throwUnlessCan(...)`
  - **Casbin** (`casbin`) — `enforcer.enforce(sub, obj, act)`
  - **Cerbos** (`@cerbos/grpc`, `@cerbos/http`) — `cerbos.checkResource({...})`, `cerbos.isAllowed({...})`
  - **Permit.io** (`permitio`) — `permit.check(user, action, resource)`

## Why it matters

Authentication ("are you logged in?") and authorization ("are you allowed to touch *this* resource?") are two separate checks. AI-generated handlers regularly pass the auth check, then fetch and return any resource by ID without verifying it belongs to the requesting user.

This is **Broken Object-Level Authorization (BOLA)** — OWASP API Security Top 10 #1. An authenticated user can access any other user's data by changing the ID in the URL. It is one of the most common vulnerabilities in AI-generated CRUD code.

## ❌ Bad Example

```typescript
// Express — authenticated, no ownership check
app.get('/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findById(req.params.id); // ← any user can read any order
  res.json(order);
});

// NestJS — guard enforces auth, but no per-resource check
@Controller('posts')
@UseGuards(AuthGuard('jwt'))
export class PostsController {
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.postsService.remove(id); // ← deletes any user's post
  }
}

// Next.js App Router — session checked, but resource not scoped to user
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const doc = await db.document.findUnique({ where: { id: params.id } }); // ← BOLA
  return NextResponse.json(doc);
}
```

## ✅ Good Example

```typescript
// Express — ownership in the query
app.get('/orders/:id', authenticate, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
  if (!order) return res.status(404).json({ error: 'Not found' });
  res.json(order);
});

// NestJS — explicit policy library check
import { defineAbility } from '@casl/ability';

@Controller('posts')
@UseGuards(AuthGuard('jwt'))
export class PostsController {
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req) {
    const post = await this.postsService.findOne(id);
    const ability = defineAbility((can) => {
      if (post.authorId === req.user.id) can('delete', 'Post');
    });
    if (ability.cannot('delete', 'Post')) {
      throw new ForbiddenException();
    }
    return this.postsService.remove(id);
  }
}

// Next.js — query scoped to session user
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const doc = await db.document.findFirst({
    where: { id: params.id, ownerId: session.user.id }, // ← scoped lookup
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}

// Hono — Casbin enforcer
import { Hono } from 'hono';
import { newEnforcer } from 'casbin';
const app = new Hono();
const enforcer = await newEnforcer('model.conf', 'policy.csv');

app.delete('/files/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const allowed = await enforcer.enforce(c.get('userId'), `file:${id}`, 'delete');
  if (!allowed) return c.json({ error: 'Forbidden' }, 403);
  await db.file.delete({ where: { id } });
  return c.json({ ok: true });
});
```

## How to fix

After fetching a resource by ID, verify the authenticated user is permitted to access it:

1. **Scope the query** — include `userId: req.user.id` (or equivalent) in the `where` clause.
2. **Inline check** — `if (resource.ownerId !== req.user.id) return 403`.
3. **Policy library** — call `ability.can(...)`, `enforcer.enforce(...)`, `cerbos.isAllowed(...)`, or `permit.check(...)` and reject when denied.

Return `403` for owned-but-not-permitted, `404` for not-found-or-not-permitted (preferred — does not leak existence).

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `authzHelperNames` | `string[]` | `[]` | Additional function names that count as authorization checks. Merged with the built-in list (`can`, `cannot`, `authorize`, `checkPermission`, `assertOwnership`, `enforceAccess`, `requirePermission`). |

### Example configuration

```js
rules: {
  'ai-guard/require-framework-authz': ['error', {
    authzHelperNames: ['canAccess', 'mustOwn', 'verifyTenant'],
  }],
}
```

### Destructured request parameters

The rule recognizes resource-ID extraction whether you read directly from the request or destructure first:

```typescript
// All of these trigger the BOLA check (and require an authz call):
router.get('/users/:id', (req, res) => {
  const x = req.params.id;          // direct member access
  const { id } = req.params;        // basic destructure
  const { id: userId } = req.params; // aliased destructure (source key 'id' is id-like)
  const { foo: id } = req.params;   // aliased — binding 'id' is id-like
  const { ['id']: id } = req.params; // computed-string destructure
  const { id = 'default' } = req.params; // default-value destructure
});
```

The check runs against BOTH the source key name AND the local binding name, so any field named `id` or ending in `id` (like `userId`, `accountId`, `documentId`) is detected. Fastify's `request.params.X` and `request.body.X` are also recognized.

Nested destructuring like `const { params: { id } } = req` is **not** currently detected — the destructure init must trace directly to `req.params|body|query` (path length 2). This is a known limitation; if you encounter it frequently, file an issue.

### Policy library detection requires the import

The CASL / Casbin / Cerbos / Permit.io detectors **only activate when the corresponding package is imported in the file under analysis**. The rule does not scan `node_modules`, `package.json`, or other files for indirect usage.

If you wrap a policy library in your own helper module (e.g., `import { can } from './lib/abac'`), the wrapper file's import of CASL is invisible to a route file that imports only the wrapper. Add your wrapper's check function name to `authzHelperNames`:

```js
'ai-guard/require-framework-authz': ['error', {
  authzHelperNames: ['can', 'cannot'], // names exported by your ./lib/abac wrapper
}],
```

## Replaces

This rule **supersedes** [`require-authz-check`](require-authz-check.md), which only handled Express and Fastify and only recognized inline ownership checks (no policy libraries, no NestJS decorators, no Next.js App Router, no Hono).

`require-authz-check` is marked `meta.deprecated: true` in v2.0.0-beta.2 and will be **removed in v3.0.0**. Migration:

```js
// Before
'ai-guard/require-authz-check': 'warn',

// After
'ai-guard/require-framework-authz': ['warn', {
  // optional — only needed if you use custom helpers
  authzHelperNames: ['myOwnershipHelper'],
}],
```

Every finding the old rule produced is reproduced by the new rule. The new rule additionally catches BOLA in NestJS controllers, Next.js App Router handlers, Hono routes, and any handler that uses CASL / Casbin / Cerbos / Permit.io.
