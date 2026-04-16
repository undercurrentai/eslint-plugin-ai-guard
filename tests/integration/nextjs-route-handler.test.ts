import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import aiGuard from '../../src/index';

describe('integration: nextjs app router route handler', () => {
  it('reports require-framework-auth on exported handlers without auth calls', async () => {
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

    const code = `
      export async function GET(request) {
        return Response.json({ items: [] });
      }

      export async function POST(request) {
        const data = await request.json();
        return Response.json({ created: true });
      }
    `;

    // The filePath must match the Next.js App Router pattern: app/**/route.ts
    const [result] = await eslint.lintText(code, {
      filePath: 'app/api/items/route.ts',
    });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    // POST without auth should fire
    const postMessages = authMessages.filter((m) => m.message.includes('POST'));
    expect(postMessages.length).toBeGreaterThan(0);
  });

  it('does not report when mutatingOnly is set and handler is GET', async () => {
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
            'ai-guard/require-framework-auth': ['error', { mutatingOnly: true }],
          },
        },
      ],
      ignore: false,
    });

    const code = `
      export async function GET(request) {
        return Response.json({ items: [] });
      }
    `;

    const [result] = await eslint.lintText(code, {
      filePath: 'app/api/items/route.ts',
    });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    // GET should be skipped with mutatingOnly: true
    expect(authMessages).toHaveLength(0);
  });

  it('does not report when handler contains an auth call', async () => {
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
      export async function POST(request) {
        const session = await getServerSession();
        if (!session) {
          return new Response('Unauthorized', { status: 401 });
        }
        const data = await request.json();
        return Response.json({ created: true });
      }
    `;

    const [result] = await eslint.lintText(code, {
      filePath: 'app/api/items/route.ts',
    });
    const authMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-framework-auth',
    );

    expect(authMessages).toHaveLength(0);
  });
});
