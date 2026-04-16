import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import aiGuard from '../../src/index';

describe('integration: fastify app', () => {
  it('reports require-framework-auth on unprotected routes but not on routes with preHandler auth', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{ts,js}'],
          languageOptions: {
            parser,
            parserOptions: {
              sourceType: 'module',
            },
          },
          plugins: {
            'ai-guard': aiGuard,
          },
          rules: {
            ...aiGuard.configs.recommended.rules,
          },
        },
      ],
      ignore: false,
    });

    // The rule's isRouteDefinition checks that the callee object name is
    // 'router', 'app', or includes 'router'. Fastify apps commonly use `app`
    // as the instance name, which the rule recognizes. The framework is still
    // detected as 'fastify' via the `import Fastify from 'fastify'` import.
    const code = `
      import Fastify from 'fastify';
      const app = Fastify();

      app.get('/users', async (request, reply) => {
        return { users: [] };
      });

      app.post('/protected', { preHandler: [authenticate] }, async (request, reply) => {
        return { ok: true };
      });
    `;

    const [result] = await eslint.lintText(code, { filePath: 'server.ts' });
    const ruleIds = result.messages.map((m) => m.ruleId);

    // The unprotected GET /users should trigger require-framework-auth
    expect(ruleIds).toContain('ai-guard/require-framework-auth');

    // The protected POST /protected (with preHandler auth) should NOT trigger
    const protectedRouteMessages = result.messages.filter(
      (m) =>
        m.ruleId === 'ai-guard/require-framework-auth' &&
        m.message.includes('/protected'),
    );
    expect(protectedRouteMessages).toHaveLength(0);
  });

  it('does not report when blanket auth hook is registered', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{ts,js}'],
          languageOptions: {
            parser,
            parserOptions: {
              sourceType: 'module',
            },
          },
          plugins: {
            'ai-guard': aiGuard,
          },
          rules: {
            'ai-guard/require-framework-auth': 'error',
          },
        },
      ],
      ignore: false,
    });

    const code = `
      import Fastify from 'fastify';
      const app = Fastify();

      app.addHook('preHandler', authenticate);

      app.get('/users', async (request, reply) => {
        return { users: [] };
      });
    `;

    const [result] = await eslint.lintText(code, { filePath: 'server.ts' });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    expect(authMessages).toHaveLength(0);
  });
});
