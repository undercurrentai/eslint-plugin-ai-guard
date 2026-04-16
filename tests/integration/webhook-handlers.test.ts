import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';
import aiGuard from '../../src/index';

describe('integration: webhook handlers', () => {
  it('reports require-webhook-signature on unverified webhook but not on verified one', async () => {
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
            ...aiGuard.configs.strict.rules,
          },
        },
      ],
      ignore: false,
    });

    const code = `
      import express from 'express';
      const router = express.Router();

      router.post('/webhook', (req, res) => {
        const event = JSON.parse(req.body);
        processEvent(event);
        res.sendStatus(200);
      });

      router.post('/webhook/verified', (req, res) => {
        const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
        processEvent(event);
        res.sendStatus(200);
      });
    `;

    const [result] = await eslint.lintText(code, { filePath: 'webhooks.ts' });
    const webhookMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-webhook-signature',
    );

    // The unverified /webhook route should fire
    const unverifiedMessages = webhookMessages.filter((m) =>
      m.message.includes('/webhook') && !m.message.includes('/webhook/verified'),
    );
    expect(unverifiedMessages.length).toBeGreaterThan(0);

    // The verified /webhook/verified route with stripe.webhooks.constructEvent should NOT fire
    const verifiedMessages = webhookMessages.filter((m) =>
      m.message.includes('/webhook/verified'),
    );
    expect(verifiedMessages).toHaveLength(0);
  });

  it('does not report when webhook handler uses crypto.timingSafeEqual', async () => {
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
            'ai-guard/require-webhook-signature': 'error',
          },
        },
      ],
      ignore: false,
    });

    const code = `
      import express from 'express';
      const router = express.Router();

      router.post('/webhook', (req, res) => {
        const sig = req.headers['x-hook-signature'];
        const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
          return res.sendStatus(401);
        }
        processEvent(JSON.parse(req.body));
        res.sendStatus(200);
      });
    `;

    const [result] = await eslint.lintText(code, { filePath: 'webhooks.ts' });
    const webhookMessages = result.messages.filter(
      (m) => m.ruleId === 'ai-guard/require-webhook-signature',
    );

    expect(webhookMessages).toHaveLength(0);
  });
});
