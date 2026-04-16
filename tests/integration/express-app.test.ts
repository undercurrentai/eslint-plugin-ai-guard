import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import aiGuard from '../../src/index';

describe('integration: express app sample', () => {
  it('reports representative ai-guard issues end-to-end', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.js'],
          plugins: {
            'ai-guard': aiGuard,
          },
          rules: {
            ...aiGuard.configs.strict.rules,
          },
        },
      ],
      ignore: false,
    });

    const code = `
      const express = require('express');
      const router = express.Router();

      router.get('/users/:id', async (req, res) => {
        console.log('debug');
        const user = await loadUser(req.params.id);
        res.json(user);
      });

      async function syncUsers(users) {
        for (const user of users) {
          await saveUser(user);
        }
      }

      try {
        maybeFails();
      } catch (e) {}
    `;

    const [result] = await eslint.lintText(code, { filePath: 'sample.js' });
    const ruleIds = result.messages.map((m) => m.ruleId);

    expect(ruleIds).toContain('ai-guard/no-empty-catch');
    expect(ruleIds).toContain('ai-guard/no-console-in-handler');
    expect(ruleIds).toContain('ai-guard/require-framework-authz');

    // v2.0: `no-await-in-loop` is deprecated and no longer in the strict preset.
    // Users who want it must opt in explicitly (see the follow-up test).
    expect(ruleIds).not.toContain('ai-guard/no-await-in-loop');
  });

  it('still fires deprecated rules when explicitly opted in, with a deprecation-prefixed message', async () => {
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.js'],
          plugins: {
            'ai-guard': aiGuard,
          },
          rules: {
            'ai-guard/no-await-in-loop': 'error',
          },
        },
      ],
      ignore: false,
    });

    const code = `
      async function syncUsers(users) {
        for (const user of users) {
          await saveUser(user);
        }
      }
    `;

    const [result] = await eslint.lintText(code, { filePath: 'sample.js' });
    const awaitInLoopMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/no-await-in-loop'
    );

    expect(awaitInLoopMessages.length).toBeGreaterThan(0);
    expect(awaitInLoopMessages[0].message).toContain('[ai-guard deprecated');
  });
});
