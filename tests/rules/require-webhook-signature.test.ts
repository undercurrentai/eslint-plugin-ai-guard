import { RuleTester } from '@typescript-eslint/rule-tester';
import { requireWebhookSignature } from '../../src/rules/security/require-webhook-signature';
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

ruleTester.run('require-webhook-signature', requireWebhookSignature, {
  valid: [
    // 1. Stripe constructEvent()
    {
      code: `
        router.post('/webhook', (req, res) => {
          const event = stripe.webhooks.constructEvent(req.body, sig, secret);
          handleEvent(event);
          res.sendStatus(200);
        });
      `,
    },
    // 2. Stripe constructEventAsync()
    {
      code: `
        router.post('/webhook', async (req, res) => {
          const event = await stripe.webhooks.constructEventAsync(req.body, sig, secret);
          handleEvent(event);
          res.sendStatus(200);
        });
      `,
    },
    // 3. crypto.timingSafeEqual()
    {
      code: `
        router.post('/webhook', (req, res) => {
          const verified = crypto.timingSafeEqual(expected, actual);
          if (!verified) return res.sendStatus(401);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
    },
    // 4. Svix wh.verify() with import from 'svix'
    {
      code: `
        import { Webhook } from 'svix';
        router.post('/webhook', (req, res) => {
          wh.verify(body, headers);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
    },
    // 5. createSlackEventAdapter() direct call
    {
      code: `
        router.post('/webhook', (req, res) => {
          createSlackEventAdapter(signingSecret);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
    },
    // 6. Non-webhook route -- should not trigger
    {
      code: `
        router.post('/users', (req, res) => {
          createUser(req.body);
          res.sendStatus(201);
        });
      `,
    },
    // 7. Custom verification function via options
    {
      code: `
        router.post('/webhook', (req, res) => {
          myVerify(req.body, req.headers['x-signature']);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
      options: [{ verificationFunctions: ['myVerify'] }],
    },
    // 8. crypto.createHmac() call in body
    {
      code: `
        router.post('/webhook', (req, res) => {
          const hash = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
          if (hash !== req.headers['x-signature']) return res.sendStatus(401);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
    },
    // 9. Regular API route (not a webhook path)
    {
      code: `
        router.post('/api/orders', (req, res) => {
          createOrder(req.body);
          res.sendStatus(201);
        });
      `,
    },
    // 10. Non-matching route path, even with body processing
    {
      code: `
        router.post('/api/events', (req, res) => {
          const event = JSON.parse(req.body);
          processEvent(event);
          res.sendStatus(200);
        });
      `,
    },
    // 11. Webhook with @octokit/webhooks import and wh.verify()
    {
      code: `
        import { Webhooks } from '@octokit/webhooks';
        router.post('/api/webhooks/github', (req, res) => {
          wh.verify(payload, signature);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
    },
    // 12. Webhook at /api/webhooks path with constructEvent
    {
      code: `
        router.post('/api/webhooks/stripe', (req, res) => {
          const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
          handleStripeEvent(event);
          res.sendStatus(200);
        });
      `,
    },
    // --- Expanded provider coverage (ship #2) ---
    // Discord interactions — verifyKey (Ed25519, discord-interactions). Distinctive name.
    {
      code: `
        router.post('/webhook', (req, res) => {
          const ok = verifyKey(req.rawBody, req.get('X-Signature-Ed25519'), req.get('X-Signature-Timestamp'), PUBLIC_KEY);
          if (!ok) return res.sendStatus(401);
          res.sendStatus(200);
        });
      `,
    },
    // Clerk — verifyWebhook(req). Distinctive name.
    {
      code: `
        import { verifyWebhook } from '@clerk/backend';
        router.post('/webhook', async (req, res) => {
          const evt = await verifyWebhook(req);
          handle(evt);
          res.sendStatus(200);
        });
      `,
    },
    // Square — WebhooksHelper.isValidWebhookEventSignature(...). Distinctive name (member).
    {
      code: `
        router.post('/webhook', (req, res) => {
          const ok = WebhooksHelper.isValidWebhookEventSignature(req.rawBody, sigHeader, key, notificationUrl);
          if (!ok) return res.sendStatus(403);
          res.sendStatus(200);
        });
      `,
    },
    // SendGrid — gated verifySignature; receiver `ew` provenance-traced via the
    // one-hop `const ew = new EventWebhook()` resolver (@sendgrid/eventwebhook).
    {
      code: `
        import { EventWebhook } from '@sendgrid/eventwebhook';
        router.post('/webhook', (req, res) => {
          const ew = new EventWebhook();
          const ok = ew.verifySignature(publicKey, req.body, signature, timestamp);
          if (!ok) return res.sendStatus(403);
          res.sendStatus(200);
        });
      `,
    },
    // Square — gated verifySignature; receiver `WebhooksHelper` is import-traced to
    // the `square` SDK (strong provenance, not name-only).
    {
      code: `
        import { WebhooksHelper } from 'square';
        router.post('/webhook', (req, res) => {
          const ok = WebhooksHelper.verifySignature({ requestBody: req.body, signatureHeader: sig, signatureKey: key, notificationUrl: url });
          if (!ok) return res.sendStatus(403);
          res.sendStatus(200);
        });
      `,
    },
    // AWS SNS — gated validate accepted ONLY via strong provenance: `const v = new
    // MessageValidator()` from sns-validator (NOT the name-based fallback, which
    // deliberately excludes `validate`).
    {
      code: `
        import { MessageValidator } from 'sns-validator';
        router.post('/webhook', (req, res) => {
          const v = new MessageValidator();
          v.validate(req.body, (err) => { if (err) return res.sendStatus(403); res.sendStatus(200); });
        });
      `,
    },
    // Linear — gated verify; receiver `lw` provenance-traced via `const lw = new
    // LinearWebhooks()` (@linear/sdk).
    {
      code: `
        import { LinearWebhooks } from '@linear/sdk';
        router.post('/webhook', (req, res) => {
          const lw = new LinearWebhooks();
          const ok = lw.verify(req.rawBody, req.headers['linear-signature']);
          if (!ok) return res.sendStatus(403);
          res.sendStatus(200);
        });
      `,
    },
  ],
  invalid: [
    // 1. Webhook with no verification at all
    {
      code: `
        router.post('/webhook', (req, res) => {
          const event = JSON.parse(req.body);
          processEvent(event);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 2. Webhook at /api/webhooks/stripe with no verification
    {
      code: `
        router.post('/api/webhooks/stripe', (req, res) => {
          handle(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 3. Webhook at /webhooks path with no verification
    {
      code: `
        router.post('/webhooks', (req, res) => {
          process(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 4. .verify() without svix import (generic verify is not enough)
    {
      code: `
        router.post('/webhook', (req, res) => {
          token.verify(data);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 5. Webhook at /api/webhook with only JSON.parse, no sig check
    {
      code: `
        router.post('/api/webhook', (req, res) => {
          const payload = JSON.parse(req.body);
          emit(payload);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 6. Webhook handler that logs but does not verify
    {
      code: `
        app.post('/webhook', (req, res) => {
          console.log('Webhook received');
          handlePayload(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 7. Webhook at /webhooks/payments with no verification
    {
      code: `
        app.post('/webhooks/payments', (req, res) => {
          processPayment(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // --- FN-GUARDS for the expanded gated-generic handling (ship #2) ---
    // 8. Generic schema.validate() (Joi/zod input validation) must NOT count as
    //    webhook signature verification — EVEN when a webhook lib is imported in the
    //    same file. This is the anti-`jwt.verify` discipline extended to `.validate()`.
    {
      code: `
        import { validateWebhook } from 'svix';
        app.post('/webhook', (req, res) => {
          const { error } = schema.validate(req.body);
          if (error) return res.sendStatus(400);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 9. Generic .verifySignature() on a NON-webhook receiver must NOT count.
    {
      code: `
        app.post('/webhook', (req, res) => {
          const ok = jwtHelper.verifySignature(token);
          if (!ok) return res.sendStatus(401);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 10. Bare verify() Identifier call (e.g. jsonwebtoken's exported verify) must NOT
    //     count — closes the latent unguarded-bare-`verify` gap.
    {
      code: `
        import { verify } from 'jsonwebtoken';
        app.post('/webhook', (req, res) => {
          const decoded = verify(req.headers.authorization, SECRET);
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 11. FN-guard (security-auditor F1): `validateRequest` is NOT distinctive
    //     (express-validator / generic body validation). A bare or arbitrary-receiver
    //     `validateRequest()` must NOT be accepted as signature verification.
    {
      code: `
        app.post('/webhook', (req, res) => {
          validateRequest(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 12. FN-guard (security-auditor F2): a forged local object literal named
    //     `webhooks` with a no-op `.validate()` must NOT match (no provenance).
    {
      code: `
        const webhooks = { validate: (x) => true };
        app.post('/webhook', (req, res) => {
          webhooks.validate(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // 13. FN-guard (security-auditor F4): a Joi schema named `webhooks` doing input
    //     validation, even with a webhook lib imported for an unrelated route, must
    //     NOT be accepted — `validate` is excluded from the name-based fallback.
    {
      code: `
        import { Webhook } from 'svix';
        const webhooks = Joi.object({ type: Joi.string() });
        app.post('/webhook', (req, res) => {
          webhooks.validate(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
  ],
});

// ---------------------------------------------------------------------------
// Bug-hunt regression tests
// ---------------------------------------------------------------------------

ruleTester.run('require-webhook-signature (bug-hunt — class-based and member receiver)', requireWebhookSignature, {
  valid: [
    // svix imported, this.wh.verify(...) — webhook-named ThisExpression receiver accepted.
    {
      code: `
        import { Webhook } from 'svix';
        class WebhookHandler {
          constructor() { this.wh = new Webhook(process.env.WHSEC); }
          register(app) {
            app.post('/webhook', (req, res) => {
              this.wh.verify(req.body, req.headers);
              res.sendStatus(200);
            });
          }
        }
      `,
    },
    // svix imported, services.webhook.verify(...) — webhook-named MemberExpression receiver.
    {
      code: `
        import { Webhook } from 'svix';
        const services = { webhook: new Webhook(process.env.WHSEC) };
        app.post('/webhook', (req, res) => {
          services.webhook.verify(req.body, req.headers);
          res.sendStatus(200);
        });
      `,
    },
  ],
  invalid: [
    // SECURITY REGRESSION (ultrathink F2): when svix is imported, an unrelated
    // jwt.verify() call should NOT be accepted as webhook signature verification.
    // Previously the lenient fallback returned true for ANY Identifier when svix
    // was in the import map.
    {
      code: `
        import { Webhook } from 'svix';
        import jwt from 'jsonwebtoken';
        app.post('/webhook', (req, res) => {
          jwt.verify(req.body.token, SECRET);
          res.json({});
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // Same: token.verify() with a non-webhook receiver name shouldn't pass
    // even when octokit is imported.
    {
      code: `
        import { Webhooks } from '@octokit/webhooks';
        app.post('/webhook', (req, res) => {
          token.verify(req.body.signature);
          res.json({});
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // Concise-arrow webhook handler with no verification — previously silently
    // skipped because the handler-search gated on BlockStatement bodies only.
    {
      code: `
        app.post('/webhooks/stripe', (req, res) => res.status(200).end());
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
    // Express chained route form: router.route('/webhook').post(...)
    // previously bypassed detection because the path is on the .route() call.
    {
      code: `
        router.route('/webhook').post((req, res) => {
          processEvent(req.body);
          res.sendStatus(200);
        });
      `,
      errors: [{ messageId: 'missingWebhookSig' }],
    },
  ],
});
