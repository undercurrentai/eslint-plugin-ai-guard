import { RuleTester } from '@typescript-eslint/rule-tester';
import { requireFrameworkAuth } from '../../src/rules/security/require-framework-auth';
import { describe, it, afterAll } from 'vitest';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

const decoratorRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parser: require('@typescript-eslint/parser'),
    parserOptions: {
      ecmaFeatures: { jsx: false },
    },
  },
});

// ---------------------------------------------------------------------------
// Express
// ---------------------------------------------------------------------------
ruleTester.run('require-framework-auth (Express)', requireFrameworkAuth, {
  valid: [
    // 1. Route with auth middleware
    {
      code: `router.get('/users', protect, handler);`,
    },
    // 2. Public route (health check)
    {
      code: `router.get('/health', handler);`,
    },
    // 3. Blanket auth via router.use(protect) followed by unprotected route
    {
      code: `
        router.use(protect);
        router.get('/users', handler);
      `,
    },
    // 4. Custom auth name via options
    {
      code: `router.get('/users', myAuth, handler);`,
      options: [{ knownAuthCallers: ['myAuth'] }],
    },
    // 5. Auth via passport.authenticate('jwt') call expression
    {
      code: `router.get('/profile', passport.authenticate('jwt'), handler);`,
    },
    // 6. Route with multiple middleware including auth
    {
      code: `router.post('/users', rateLimit, authenticate, validate, createUser);`,
    },
    // 7. Public route - login
    {
      code: `router.post('/login', loginHandler);`,
    },
    // 8. Public route - register
    {
      code: `router.post('/register', registerHandler);`,
    },
    // 9. Root route
    {
      code: `app.get('/', homeHandler);`,
    },
    // 10. Public assets path
    {
      code: `app.get('/public/logo.png', serveStatic);`,
    },
  ],
  invalid: [
    // 1. Route with no middleware
    {
      code: `router.get('/users', handler);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 2. Route with non-auth middleware only
    {
      code: `router.get('/users', logger, handler);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 3. DELETE route without auth
    {
      code: `router.delete('/users/:id', deleteHandler);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 4. POST route with non-auth middleware only
    {
      code: `router.post('/data', logRequest, parseBody, processData);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 5. PUT route without auth
    {
      code: `app.put('/settings', updateSettings);`,
      errors: [{ messageId: 'missingAuth' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Fastify
// ---------------------------------------------------------------------------
// The rule's isRouteDefinition() recognizes object identifiers named "app",
// "router", or names containing "router". Fastify apps commonly use
// `const app = fastify()`, so we use `app` as the receiver throughout.
ruleTester.run('require-framework-auth (Fastify)', requireFrameworkAuth, {
  valid: [
    // 1. Route with preHandler auth
    {
      code: `
        import fastify from 'fastify';
        app.get('/users', { preHandler: [auth] }, handler);
      `,
    },
    // 2. Route with onRequest hook
    {
      code: `
        import fastify from 'fastify';
        app.post('/users', { onRequest: [authenticate] }, handler);
      `,
    },
    // 3. Global hook: app.addHook('preHandler', auth)
    {
      code: `
        import fastify from 'fastify';
        app.addHook('preHandler', auth);
        app.get('/users', handler);
      `,
    },
    // 4. fastify.route() form with preHandler (uses app receiver)
    {
      code: `
        import fastify from 'fastify';
        app.route({ method: 'GET', url: '/users', preHandler: [auth], handler: getUsers });
      `,
    },
    // 5. Public route (health check)
    {
      code: `
        import fastify from 'fastify';
        app.get('/health', handler);
      `,
    },
    // 6. Global addHook with onRequest
    {
      code: `
        import fastify from 'fastify';
        app.addHook('onRequest', authenticate);
        app.get('/data', handler);
      `,
    },
    // 7. preHandler as a direct function (not array)
    {
      code: `
        import fastify from 'fastify';
        app.get('/users', { preHandler: auth }, handler);
      `,
    },
  ],
  invalid: [
    // 1. Route with no options
    {
      code: `
        import fastify from 'fastify';
        app.get('/users', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 2. Route with empty preHandler array
    {
      code: `
        import fastify from 'fastify';
        app.get('/users', { preHandler: [] }, handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 3. DELETE route without auth
    {
      code: `
        import fastify from 'fastify';
        app.delete('/items/:id', deleteItem);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Hono
// ---------------------------------------------------------------------------
ruleTester.run('require-framework-auth (Hono)', requireFrameworkAuth, {
  valid: [
    // 1. Route with middleware
    {
      code: `
        import { Hono } from 'hono';
        app.get('/users', authMiddleware, handler);
      `,
    },
    // 2. Blanket auth via app.use('*', jwt(...))
    {
      code: `
        import { Hono } from 'hono';
        app.use('*', jwt({ secret: 'x' }));
        app.get('/users', handler);
      `,
    },
    // 3. Import from hono/jwt provides auth (built-in auth detection)
    {
      code: `
        import { jwt } from 'hono/jwt';
        app.get('/users', handler);
      `,
    },
    // 4. Import from hono/basic-auth
    {
      code: `
        import { basicAuth } from 'hono/basic-auth';
        app.get('/admin', handler);
      `,
    },
    // 5. Import from hono/bearer-auth
    {
      code: `
        import { bearerAuth } from 'hono/bearer-auth';
        app.post('/data', handler);
      `,
    },
    // 6. Public route (health check)
    {
      code: `
        import { Hono } from 'hono';
        app.get('/health', handler);
      `,
    },
  ],
  invalid: [
    // 1. Route with no middleware (no hono auth import)
    {
      code: `
        import { Hono } from 'hono';
        app.post('/data', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 2. GET route without auth
    {
      code: `
        import { Hono } from 'hono';
        app.get('/secrets', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// NestJS
// ---------------------------------------------------------------------------
decoratorRuleTester.run('require-framework-auth (NestJS)', requireFrameworkAuth, {
  valid: [
    // 1. Method with @UseGuards(AuthGuard) on the method
    {
      code: `
        import { Controller, Get, UseGuards } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          @UseGuards(AuthGuard)
          @Get()
          findAll() { return []; }
        }
      `,
    },
    // 2. Class-level @UseGuards(AuthGuard) covering all methods
    {
      code: `
        import { Controller, Get, Post, UseGuards } from '@nestjs/common';
        @UseGuards(AuthGuard)
        @Controller('users')
        class UsersController {
          @Get()
          findAll() { return []; }

          @Post()
          create() { return {}; }
        }
      `,
    },
    // 3. Method marked with @Public() skip decorator
    {
      code: `
        import { Controller, Get, Post, UseGuards } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          @Public()
          @Get()
          findAll() { return []; }
        }
      `,
    },
    // 4. Method marked with @SkipAuth() skip decorator
    {
      code: `
        import { Controller, Get } from '@nestjs/common';
        @Controller('auth')
        class AuthController {
          @SkipAuth()
          @Get('status')
          status() { return { ok: true }; }
        }
      `,
    },
    // 5. assumeGlobalAuth option suppresses all reports
    {
      code: `
        import { Controller, Post } from '@nestjs/common';
        @Controller('data')
        class DataController {
          @Post()
          create() { return {}; }
        }
      `,
      options: [{ assumeGlobalAuth: true }],
    },
    // 6. Non-HTTP method in controller (no HTTP decorator) should be ignored
    {
      code: `
        import { Controller } from '@nestjs/common';
        @Controller('util')
        class UtilController {
          helperMethod() { return 'helper'; }
        }
      `,
    },
  ],
  invalid: [
    // 1. @Post() method without @UseGuards in @Controller class
    {
      code: `
        import { Controller, Post } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          @Post()
          create() { return {}; }
        }
      `,
      errors: [{ messageId: 'missingAuthNestjs' }],
    },
    // 2. @Delete() method without guards
    {
      code: `
        import { Controller, Delete } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          @Delete()
          remove() { return {}; }
        }
      `,
      errors: [{ messageId: 'missingAuthNestjs' }],
    },
    // 3. @Get() method without guards
    {
      code: `
        import { Controller, Get } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          @Get()
          findAll() { return []; }
        }
      `,
      errors: [{ messageId: 'missingAuthNestjs' }],
    },
    // 4. Multiple methods without guards report multiple errors
    {
      code: `
        import { Controller, Get, Post } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          @Get()
          findAll() { return []; }

          @Post()
          create() { return {}; }
        }
      `,
      errors: [
        { messageId: 'missingAuthNestjs' },
        { messageId: 'missingAuthNestjs' },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Next.js App Router
// ---------------------------------------------------------------------------
ruleTester.run('require-framework-auth (Next.js App Router)', requireFrameworkAuth, {
  valid: [
    // 1. POST handler with auth() call
    {
      filename: '/app/api/users/route.ts',
      code: `
        export async function POST(req) {
          const session = await auth();
          return Response.json({ ok: true });
        }
      `,
    },
    // 2. PUT handler with getServerSession() call
    {
      filename: '/app/api/users/route.ts',
      code: `
        export async function PUT(req) {
          const user = await getServerSession();
          return Response.json({ updated: true });
        }
      `,
    },
    // 3. DELETE handler with currentUser() call
    {
      filename: '/app/api/users/route.ts',
      code: `
        export async function DELETE(req) {
          const u = await currentUser();
          return new Response();
        }
      `,
    },
    // 4. GET handler with getToken() call
    {
      filename: '/app/api/data/route.ts',
      code: `
        export async function GET(req) {
          const token = await getToken();
          return Response.json({ data: [] });
        }
      `,
    },
    // 5. Handler with auth.protect() call
    {
      filename: '/app/api/admin/route.ts',
      code: `
        export async function POST(req) {
          await auth.protect();
          return Response.json({ ok: true });
        }
      `,
    },
    // 6. Non-route file is not flagged even without auth
    {
      filename: 'src/utils/helpers.ts',
      code: `
        export async function POST(req) {
          return Response.json({ ok: true });
        }
      `,
    },
  ],
  invalid: [
    // 1. POST handler without any auth call
    {
      filename: '/app/api/users/route.ts',
      code: `
        export async function POST(req) {
          return Response.json({ ok: true });
        }
      `,
      errors: [{ messageId: 'missingAuthNextjs' }],
    },
    // 2. DELETE handler without any auth call
    {
      filename: '/app/api/users/route.ts',
      code: `
        export async function DELETE(req) {
          await db.delete(req.params.id);
          return new Response();
        }
      `,
      errors: [{ messageId: 'missingAuthNextjs' }],
    },
    // 3. GET handler without auth
    {
      filename: '/app/api/secrets/route.ts',
      code: `
        export async function GET(req) {
          return Response.json({ secret: 'value' });
        }
      `,
      errors: [{ messageId: 'missingAuthNextjs' }],
    },
    // 4. Multiple exported handlers without auth
    {
      filename: '/app/api/items/route.ts',
      code: `
        export async function GET(req) {
          return Response.json([]);
        }
        export async function POST(req) {
          return Response.json({ created: true });
        }
      `,
      errors: [
        { messageId: 'missingAuthNextjs' },
        { messageId: 'missingAuthNextjs' },
      ],
    },
    // 5. Arrow function export without auth
    {
      filename: '/app/api/data/route.ts',
      code: `
        export const PUT = async (req) => {
          return Response.json({ updated: true });
        };
      `,
      errors: [{ messageId: 'missingAuthNextjs' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// mutatingOnly option
// ---------------------------------------------------------------------------
ruleTester.run('require-framework-auth (mutatingOnly)', requireFrameworkAuth, {
  valid: [
    // 1. GET route without auth when mutatingOnly is true — should pass
    {
      code: `router.get('/users', handler);`,
      options: [{ mutatingOnly: true }],
    },
    // 2. HEAD route without auth when mutatingOnly is true — should pass
    {
      code: `router.head('/users', handler);`,
      options: [{ mutatingOnly: true }],
    },
    // 3. OPTIONS route without auth when mutatingOnly is true — should pass
    {
      code: `router.options('/users', handler);`,
      options: [{ mutatingOnly: true }],
    },
    // 4. POST route with auth when mutatingOnly is true — should pass
    {
      code: `router.post('/users', protect, handler);`,
      options: [{ mutatingOnly: true }],
    },
    // 5. Next.js GET without auth when mutatingOnly is true — should pass
    {
      filename: '/app/api/users/route.ts',
      code: `
        export async function GET(req) {
          return Response.json([]);
        }
      `,
      options: [{ mutatingOnly: true }],
    },
  ],
  invalid: [
    // 1. POST route without auth when mutatingOnly is true
    {
      code: `router.post('/users', handler);`,
      options: [{ mutatingOnly: true }],
      errors: [{ messageId: 'missingAuth' }],
    },
    // 2. PUT route without auth when mutatingOnly is true
    {
      code: `router.put('/users', handler);`,
      options: [{ mutatingOnly: true }],
      errors: [{ messageId: 'missingAuth' }],
    },
    // 3. DELETE route without auth when mutatingOnly is true
    {
      code: `router.delete('/users/:id', handler);`,
      options: [{ mutatingOnly: true }],
      errors: [{ messageId: 'missingAuth' }],
    },
    // 4. PATCH route without auth when mutatingOnly is true
    {
      code: `router.patch('/users/:id', handler);`,
      options: [{ mutatingOnly: true }],
      errors: [{ messageId: 'missingAuth' }],
    },
    // 5. Next.js POST without auth when mutatingOnly is true
    {
      filename: '/app/api/users/route.ts',
      code: `
        export async function POST(req) {
          return Response.json({ created: true });
        }
      `,
      options: [{ mutatingOnly: true }],
      errors: [{ messageId: 'missingAuthNextjs' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// NestJS mutatingOnly option
// ---------------------------------------------------------------------------
decoratorRuleTester.run('require-framework-auth (NestJS mutatingOnly)', requireFrameworkAuth, {
  valid: [
    // @Get() without guards when mutatingOnly is true — should pass
    {
      code: `
        import { Controller, Get } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          @Get()
          findAll() { return []; }
        }
      `,
      options: [{ mutatingOnly: true }],
    },
  ],
  invalid: [
    // @Post() without guards when mutatingOnly is true — should report
    {
      code: `
        import { Controller, Post } from '@nestjs/common';
        @Controller('data')
        class DataController {
          @Post()
          create() { return {}; }
        }
      `,
      options: [{ mutatingOnly: true }],
      errors: [{ messageId: 'missingAuthNestjs' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Audit-fix regression tests (ultrathink phase)
// ---------------------------------------------------------------------------

ruleTester.run('require-framework-auth (audit — TS expressions)', requireFrameworkAuth, {
  valid: [
    {
      code: `
        import express from 'express';
        const app = express();
        (app as any).post('/items', protect, handler);
      `,
    },
  ],
  invalid: [
    {
      code: `
        import express from 'express';
        const app = express();
        (app as any).post('/items', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    {
      code: `
        import Fastify from 'fastify';
        const fastify = Fastify();
        fastify!.post('/items', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
  ],
});

ruleTester.run('require-framework-auth (audit — Express .route() chain)', requireFrameworkAuth, {
  valid: [
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.route('/users').post(authenticate, createUser);
      `,
    },
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.route('/health').get(handler);
      `,
    },
  ],
  invalid: [
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.route('/users').post(createUser);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
  ],
});

ruleTester.run('require-framework-auth (audit — Hono app.on)', requireFrameworkAuth, {
  valid: [
    {
      code: `
        import { Hono } from 'hono';
        const app = new Hono();
        app.on(['POST', 'PUT'], '/users/:id', authenticate, updateUser);
      `,
    },
    {
      code: `
        import { Hono } from 'hono';
        const app = new Hono();
        app.on('GET', '/health', handler);
      `,
    },
  ],
  invalid: [
    {
      code: `
        import { Hono } from 'hono';
        const app = new Hono();
        app.on(['POST', 'PUT'], '/users/:id', updateUser);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    {
      code: `
        import { Hono } from 'hono';
        const app = new Hono();
        app.on('DELETE', '/users/:id', deleteUser);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
  ],
});

ruleTester.run('require-framework-auth (audit — public route boundary)', requireFrameworkAuth, {
  invalid: [
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.post('/authentication-token', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.post('/registry/items', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.post('/resetpassword/admin', handler);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
  ],
  valid: [
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.get('/favicon.ico', handler);
      `,
    },
    {
      code: `
        import express from 'express';
        const router = express.Router();
        router.post('/auth/login', handler);
      `,
    },
  ],
});

decoratorRuleTester.run('require-framework-auth (audit — NestJS static methods)', requireFrameworkAuth, {
  valid: [
    {
      code: `
        import { Controller, Post } from '@nestjs/common';
        @Controller('users')
        class UsersController {
          static helper() { return {}; }
        }
      `,
    },
  ],
  invalid: [],
});

decoratorRuleTester.run('require-framework-auth (audit — member-expression decorator)', requireFrameworkAuth, {
  valid: [
    {
      code: `
        import * as Common from '@nestjs/common';
        @Common.Controller('users')
        class UsersController {
          @Common.UseGuards(AuthGuard)
          @Common.Post()
          create() { return {}; }
        }
      `,
    },
  ],
  invalid: [
    {
      code: `
        import * as Common from '@nestjs/common';
        @Common.Controller('users')
        class UsersController {
          @Common.Post()
          create() { return {}; }
        }
      `,
      errors: [{ messageId: 'missingAuthNestjs' }],
    },
  ],
});
