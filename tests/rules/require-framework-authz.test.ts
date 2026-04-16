import { RuleTester } from '@typescript-eslint/rule-tester';
import { requireFrameworkAuthz } from '../../src/rules/security/require-framework-authz';
import { afterAll, describe, it } from 'vitest';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('require-framework-authz', requireFrameworkAuthz, {
  valid: [
    // 1. Ownership check: req.user.id === req.params.id
    {
      code: `
        router.get('/users/:id', (req, res) => {
          if (req.user.id === req.params.id) {
            return res.json(loadUser(req.params.id));
          }
          return res.sendStatus(403);
        });
      `,
    },
    // 2. authorize() helper call
    {
      code: `
        router.get('/items/:id', (req, res) => {
          authorize(req.user, req.params.id);
          const item = getItem(req.params.id);
          res.json(item);
        });
      `,
    },
    // 3. checkOwnership() helper call
    {
      code: `
        router.put('/projects/:id', (req, res) => {
          checkOwnership(req.user.id, req.params.id);
          updateProject(req.params.id, req.body);
          res.sendStatus(200);
        });
      `,
    },
    // 4. Route without ID parameter -- no-op, should not report
    {
      code: `
        router.get('/health', (req, res) => {
          res.send('ok');
        });
      `,
    },
    // 5. Route with body only, no params ID access
    {
      code: `
        router.post('/users', (req, res) => {
          createUser(req.body);
          res.sendStatus(201);
        });
      `,
    },
    // 6. CASL with import: ability.can()
    {
      code: `
        import { defineAbility } from '@casl/ability';
        router.get('/items/:id', (req, res) => {
          ability.can('read', item);
          const data = getItem(req.params.id);
          res.json(data);
        });
      `,
    },
    // 7. Casbin with import: enforcer.enforce()
    {
      code: `
        import { newEnforcer } from 'casbin';
        router.get('/items/:id', (req, res) => {
          enforcer.enforce(sub, obj, act);
          res.json(getItem(req.params.id));
        });
      `,
    },
    // 8. Cerbos with import from @cerbos/grpc: cerbos.isAllowed()
    {
      code: `
        import { GRPC } from '@cerbos/grpc';
        router.get('/items/:id', (req, res) => {
          cerbos.isAllowed({ principal, resource, action });
          res.json(getItem(req.params.id));
        });
      `,
    },
    // 9. Permit.io with import: permit.check()
    {
      code: `
        import { Permit } from 'permitio';
        router.get('/items/:id', (req, res) => {
          permit.check(user, action, resource);
          res.json(getItem(req.params.id));
        });
      `,
    },
    // 10. Custom helper via options: authzHelperNames
    {
      code: `
        router.get('/items/:id', (req, res) => {
          myAuthz(req.user, req.params.id);
          res.json(getItem(req.params.id));
        });
      `,
      options: [{ authzHelperNames: ['myAuthz'] }],
    },
    // 11. ensureOwner() helper call
    {
      code: `
        router.patch('/accounts/:id', (req, res) => {
          ensureOwner(req.user, req.params.id);
          update(req.params.id, req.body);
          res.sendStatus(204);
        });
      `,
    },
    // 12. canAccess() helper call
    {
      code: `
        app.get('/projects/:id', (req, res) => {
          canAccess(req.user, req.params.id);
          res.json({ id: req.params.id });
        });
      `,
    },
    // 13. Ownership check with !== (not-equal comparison)
    {
      code: `
        router.get('/users/:id', (req, res) => {
          if (req.user.id !== req.params.id) return res.sendStatus(403);
          return res.json(loadUser(req.params.id));
        });
      `,
    },
    // 14. Route accesses req.params but without an ID-like field name
    {
      code: `
        router.get('/items/:slug', (req, res) => {
          const item = getItem(req.params.slug);
          res.json(item);
        });
      `,
    },
    // 15. Cerbos with import from @cerbos/http: checkResource()
    {
      code: `
        import { HTTP } from '@cerbos/http';
        router.delete('/resources/:id', (req, res) => {
          cerbos.checkResource({ principal, resource, actions: ['delete'] });
          remove(req.params.id);
          res.sendStatus(204);
        });
      `,
    },
    // 16. CASL throwUnlessCan() with import
    {
      code: `
        import { PureAbility } from '@casl/ability';
        router.patch('/docs/:id', (req, res) => {
          ability.throwUnlessCan('update', subject);
          updateDoc(req.params.id, req.body);
          res.sendStatus(200);
        });
      `,
    },
    // 17. Ownership check with == (loose equality)
    {
      code: `
        app.get('/items/:id', (req, res) => {
          if (req.user.id == req.params.id) {
            return res.json(get(req.params.id));
          }
          return res.sendStatus(403);
        });
      `,
    },
  ],
  invalid: [
    // 1. Route accesses req.params.id with route param but NO authz
    {
      code: `
        router.get('/users/:id', (req, res) => {
          const user = db.find(req.params.id);
          res.json(user);
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 2. Route with const assignment but no ownership comparison
    {
      code: `
        router.get('/items/:id', (req, res) => {
          const id = req.params.id;
          res.json(get(id));
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 3. CASL .can() called WITHOUT @casl/ability import (should fire)
    {
      code: `
        router.get('/items/:id', (req, res) => {
          thing.can('x');
          const x = req.params.id;
          res.json(x);
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 4. Route accesses req.params.userId (ends with 'id') without authz
    {
      code: `
        router.get('/accounts/:userId', (req, res) => {
          const account = loadAccount(req.params.userId);
          res.json(account);
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 5. delete route with no authz check
    {
      code: `
        router.delete('/posts/:id', (req, res) => {
          remove(req.params.id);
          res.sendStatus(204);
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 6. req.query.id access with route param, no authz
    {
      code: `
        app.get('/items/:id', (req, res) => {
          const data = getById(req.query.id);
          res.json(data);
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 7. req.body.deviceId access with route param, no authz
    {
      code: `
        app.get('/devices/:id', (req, res) => {
          const id = req.body.deviceId;
          res.json(loadDevice(id));
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 8. Casbin .enforce() called WITHOUT casbin import (should fire)
    {
      code: `
        router.put('/items/:id', (req, res) => {
          enforcer.enforce(sub, obj, act);
          update(req.params.id, req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 9. Presence of req.user alone is not an authz check
    {
      code: `
        app.get('/profile/:id', (req, res) => {
          const isSelf = req.user;
          return res.json(load(req.params.id));
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
    // 10. Checking req.user exists (truthy) is not an ownership comparison
    {
      code: `
        app.get('/files/:id', (req, res) => {
          if (req.user) {
            return res.json(readFile(req.params.id));
          }
        });
      `,
      errors: [{ messageId: 'missingAuthz' }],
    },
  ],
});
