import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import aiGuard from '../../src/index';

describe('integration: hono app', () => {
  it('reports require-framework-auth on routes with no auth middleware', async () => {
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

    // Note: '/public' matches the rule's DEFAULT_PUBLIC_ROUTE_PATTERNS (/^\/public/)
    // and is automatically skipped. Use non-public paths to verify detection.
    const code = `
      import { Hono } from 'hono';
      const app = new Hono();

      app.get('/dashboard', (c) => c.json({ status: 'ok' }));
      app.post('/secret', (c) => c.json({ data: 'sensitive' }));
    `;

    const [result] = await eslint.lintText(code, { filePath: 'app.ts' });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    // Both routes lack auth middleware, so both should fire
    expect(authMessages.length).toBeGreaterThanOrEqual(2);

    const paths = authMessages.map((m) => m.message);
    expect(paths.some((msg) => msg.includes('/dashboard'))).toBe(true);
    expect(paths.some((msg) => msg.includes('/secret'))).toBe(true);
  });

  it('does not report when hono auth middleware is imported and applied via app.use', async () => {
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
      import { Hono } from 'hono';
      import { basicAuth } from 'hono/basic-auth';
      const app = new Hono();

      app.use(auth);
      app.get('/data', (c) => c.json({ items: [] }));
    `;

    const [result] = await eslint.lintText(code, { filePath: 'app.ts' });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    expect(authMessages).toHaveLength(0);
  });
});
