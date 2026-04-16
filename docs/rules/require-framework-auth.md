# require-framework-auth

**Category:** Security | **Severity:** `warn` (recommended, security), `error` (strict)

---

## What it does

Detects route definitions that lack a recognized authentication check across five major Node.js web frameworks:

- **Express 5** — `router.get/post/put/patch/delete`, `app.get/...`
- **Fastify 5** — `fastify.get/...`, `fastify.route({ method, url, handler })`
- **Hono 4** — `app.get/post/...`, `app.use(...)`, `app.on(...)`
- **NestJS 11** — `@Controller` classes with `@Get/@Post/@Put/@Patch/@Delete` handlers
- **Next.js 15 App Router** — `app/**/route.ts` files exporting `GET/POST/PUT/PATCH/DELETE`

Framework detection is import-based (e.g., `import { Hono } from 'hono'`), with filename fallback for Next.js (`app/**/route.{ts,js,tsx,jsx}`).

Recognized auth signals include common middleware names (`authenticate`, `requireAuth`, `isAuthenticated`, `verifyToken`, `authMiddleware`, `checkAuth`, `ensureAuthenticated`, `protect`, `requireLogin`), framework-specific decorators (`@UseGuards`, `@Auth`, `@Authorized`), and configurable custom names (`knownAuthCallers`).

## Why it matters

AI tools generate route handlers focused on the business logic — the CRUD operations, the database queries, the response formatting. The authentication check is a separate concern that often gets omitted, especially when the AI is generating a new route from a description rather than from a reference handler that shows the full chain.

The result is endpoints that are fully functional but completely unauthenticated. Anyone with a browser or `curl` can access them. Framework-aware detection catches these omissions across all five frameworks instead of relying on a single Express/Fastify pattern.

## When to use

Enable this rule on any backend service exposing HTTP endpoints. It is most useful when:

- Your codebase mixes multiple frameworks (e.g., a Next.js front-end with a Fastify API server).
- You use AI tools to scaffold new routes — the detector will surface unauthenticated handlers before they ship.
- You want a single rule that replaces per-framework lint rules from other plugins.

If your application enforces auth globally (a NestJS `APP_GUARD`, a Next.js `middleware.ts` matcher covering all routes), set `assumeGlobalAuth: true` to suppress findings for handlers that are protected outside the local file.

## Express 5

### Bad Example

```typescript
import express from 'express';
const app = express();

// No auth — anyone can read any user's profile
app.get('/users/:id/profile', async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);
});
```

### Good Example

```typescript
import express from 'express';
import { authenticate } from './auth';
const app = express();

// Auth middleware in the chain before the handler
app.get('/users/:id/profile', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);
});

// Chained .route('/x').METHOD() form is also supported. The walker climbs
// the chain to find the originating .route() call and inherits its path,
// so each .METHOD() is checked independently for auth middleware.
router.route('/users/:id')
  .get(authenticate, getUser)
  .post(authenticate, validate, updateUser)
  .delete(authenticate, requireAdmin, deleteUser);
```

## Fastify 5

### Bad Example

```typescript
import Fastify from 'fastify';
const fastify = Fastify();

// No preHandler / onRequest hook — endpoint is open
fastify.post('/orders', async (request, reply) => {
  return Order.create(request.body);
});
```

### Good Example

```typescript
import Fastify from 'fastify';
import { verifyToken } from './auth';
const fastify = Fastify();

// preHandler hook authenticates before the handler runs
fastify.post('/orders', { preHandler: verifyToken }, async (request, reply) => {
  return Order.create(request.body);
});
```

## Hono 4

### Bad Example

```typescript
import { Hono } from 'hono';
const app = new Hono();

// No middleware in the chain — open route
app.get('/admin/users', async (c) => {
  const users = await db.user.findMany();
  return c.json(users);
});
```

### Good Example

```typescript
import { Hono } from 'hono';
import { requireAuth } from './middleware/auth';
const app = new Hono();

// Auth middleware passed positionally before the handler
app.get('/admin/users', requireAuth, async (c) => {
  const users = await db.user.findMany();
  return c.json(users);
});

// Hono multi-method form (single method or array) — same auth check applies
app.on('POST', '/items/:id', requireAuth, updateItem);
app.on(['POST', 'PUT', 'PATCH'], '/items/:id', requireAuth, updateItem);
```

> **Hono `app.on()` semantics under `mutatingOnly: true`**: when the methods
> array contains dynamic elements (e.g., `app.on(['GET', someVar], ...)`), the
> rule fails closed and treats the route as potentially mutating. Empty method
> arrays (`app.on([], ...)`) are treated as dead code and skipped.

## NestJS 11

### Bad Example

```typescript
import { Controller, Get, Param } from '@nestjs/common';

@Controller('orders')
export class OrdersController {
  // No @UseGuards — handler runs without auth
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
```

### Good Example

```typescript
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('orders')
@UseGuards(AuthGuard('jwt')) // class-level guard covers all handlers
export class OrdersController {
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
```

## Next.js 15 App Router

### Bad Example

```typescript
// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';

// No auth check — public route
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await db.user.findUnique({ where: { id: params.id } });
  return NextResponse.json(user);
}
```

### Good Example

```typescript
// app/api/users/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth(); // recognized auth call
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const user = await db.user.findUnique({ where: { id: params.id } });
  return NextResponse.json(user);
}

// Arrow-function exports — both block-body and concise — are detected
// equivalently to function declarations.
export const POST = async (req: NextRequest) => {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });
  return Response.json({ ok: true });
};

// Even concise-arrow body is walked for auth calls
export const DELETE = async (req: NextRequest) =>
  (await auth(), Response.json({ deleted: true }));
```

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `knownAuthCallers` | `string[]` | `[]` | Additional function or middleware names that count as authentication. Merged with the built-in list (`authenticate`, `requireAuth`, `verifyToken`, `auth`, `getServerSession`, etc.). |
| `publicRoutePatterns` | `string[]` | `["/health", "/healthz", "/ready", "/metrics", "/_next/*", "/api/auth/*"]` | Glob patterns for routes that are intentionally public. Matching routes are skipped without a finding. |
| `skipDecorators` | `string[]` | `["Public", "SkipAuth", "AllowAnonymous"]` | NestJS decorator names that mark a handler as intentionally unauthenticated. The rule emits no finding for handlers carrying any of these decorators. |
| `assumeGlobalAuth` | `boolean` | `false` | When `true`, the rule assumes a framework-level global guard (NestJS `APP_GUARD`, Next.js `middleware.ts`, Fastify `addHook('onRequest', ...)` at app scope) is in effect. Findings only fire when a handler **also** explicitly opts out of auth (`@Public()`, `publicRoutePatterns` mismatch). |
| `mutatingOnly` | `boolean` | `false` | When `true`, only flag mutating verbs (`POST`, `PUT`, `PATCH`, `DELETE`). Useful for codebases where read endpoints are intentionally open. |

### Example configuration

```js
rules: {
  'ai-guard/require-framework-auth': ['error', {
    knownAuthCallers: ['myCustomAuth', 'verifyServiceToken'],
    publicRoutePatterns: ['/health', '/v1/public/*'],
    skipDecorators: ['Public', 'NoAuth'],
    assumeGlobalAuth: false,
    mutatingOnly: false,
  }],
}
```

## Replaces

This rule **supersedes** [`require-auth-middleware`](require-auth-middleware.md), which only understood Express and Fastify and did not detect class-based NestJS controllers, Hono middleware chains, or Next.js App Router exports.

`require-auth-middleware` is marked `meta.deprecated: true` in v2.0.0-beta.2 and will be **removed in v3.0.0**. Migration:

```js
// Before
'ai-guard/require-auth-middleware': ['warn', { authMiddlewareNames: ['myAuth'] }],

// After
'ai-guard/require-framework-auth': ['warn', { knownAuthCallers: ['myAuth'] }],
```

The new rule is a strict superset of the old one — every finding the old rule produced is reproduced by the new rule, plus the additional framework coverage.

## Limitations

The detector is **single-file**. It does not chase imports, decorator metadata, or middleware composition across module boundaries. The two patterns most commonly affected are:

1. **NestJS `APP_GUARD`** — a global guard registered in `AppModule` providers will protect every controller, but the rule cannot see across module files. Each controller looks unauthenticated in isolation.
2. **Next.js `middleware.ts`** — a root `middleware.ts` with a matcher covering `/api/*` will gate every route handler, but the rule analyzes `route.ts` files in isolation.

If either pattern describes your codebase, set `assumeGlobalAuth: true`. The rule will then only flag handlers that are explicitly marked public *and* are not in `publicRoutePatterns` — i.e., it relies on you to use `@Public()` (NestJS) or the matcher exclusion list (Next.js) to opt routes out of the global gate.

Other limitations:

- Higher-order middleware factories (`requireAuth({ role: 'admin' })`) are recognized by the **call name**, not the returned function. If you wrap auth in an unusual factory, add the wrapper name to `knownAuthCallers`.
- Express `router.use(auth)` applied to a router defined in another file is not tracked. Apply `router.use(auth)` in the same file as the routes, or use `assumeGlobalAuth`.
- Cross-file Fastify `register(authPlugin)` is not tracked. Same workaround.

## TypeScript expression handling

The rule looks through TypeScript-only expression wrappers when identifying the route receiver, so all of these are detected identically to plain `app.get(...)`:

- `(app as Application).get('/x', handler)` — `TSAsExpression`
- `<Application>app.get('/x', handler)` — `TSTypeAssertion` (legacy angle-bracket form)
- `app!.get('/x', handler)` — `TSNonNullExpression`
- `(app satisfies Application).get('/x', handler)` — `TSSatisfiesExpression`
