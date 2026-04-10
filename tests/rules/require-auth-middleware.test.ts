import { RuleTester } from '@typescript-eslint/rule-tester';
import { requireAuthMiddleware } from '../../src/rules/security/require-auth-middleware';
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

ruleTester.run('require-auth-middleware', requireAuthMiddleware, {
  valid: [
    // 1. Has protect middleware
    {
      code: `router.post('/api/data', protect, validate, handler);`,
    },
    // 2. Has authenticate middleware
    {
      code: `app.get('/api/users', authenticate, getUser);`,
    },
    // 3. Has passport.authenticate
    {
      code: `router.get('/profile', passport.authenticate('jwt', { session: false }), getProfile);`,
    },
    // 4. Public route - login
    {
      code: `router.post('/login', loginHandler);`,
    },
    // 5. Public route - webhook (dynamic path)
    {
      code: 'router.post(`/webhook/${provider}`, webhookHandler);',
    },
    // 6. Root route - often public
    {
      code: `app.get('/', homeHandler);`,
    },
    // 7. Health check
    {
      code: `router.get('/health', (req, res) => res.send('OK'));`,
    },
    // 8. Custom middleware name (via options)
    {
      code: `router.post('/secret', myCustomAuth, handler);`,
      options: [{ authMiddlewareNames: ['myCustomAuth'] }],
    },
    // 9. router.use() blanket auth
    {
      code: `
        router.use(protect);
        router.get('/data', handler);
        router.post('/data', handler);
      `,
    },
    // 10. express.Router() usage with auth
    {
      code: `
        const router = express.Router();
        router.put('/update', requireAuth, updateHandler);
      `,
    },
    // 11. SPA fallback wildcard route should be considered public
    {
      code: `app.get('*', serveFrontend);`,
    },
    // 12. Wildcard slash fallback route should be considered public
    {
      code: `app.get('/*', serveFrontend);`,
    },
  ],
  invalid: [
    // 1. Basic route with no middleware at all
    {
      code: `router.post('/api/users', createUser);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 2. Route with non-auth middleware
    {
      code: `app.get('/api/admin', validateInput, getAdmin);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 3. put/patch/delete needs auth
    {
      code: `router.delete('/delete/:id', deleteHandler);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 4. Custom middleware not in options
    {
      code: `router.post('/secret', customAuthCheck, handler);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 5. express.Router chain without auth
    {
      code: `
        express.Router()
          .get('/dashboard', renderDashboard);
      `,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 6. Route missing auth, even with multiple valid middlewares
    {
      code: `router.post('/data', logRequest, parseBody, validateSchema, processData);`,
      errors: [{ messageId: 'missingAuth' }],
    },
    // 7. Route containing a function name that looks like auth but isn't middleware
    {
      code: `router.get('/data', (req, res) => { const user = authenticate(req); res.send(user); });`,
      errors: [{ messageId: 'missingAuth' }], // 'authenticate' is inside handler, not as middleware
    },
  ],
});
