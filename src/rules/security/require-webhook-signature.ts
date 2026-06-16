import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import {
  buildImportMap,
  getPathString,
  hasImport,
  AST_SKIP_KEYS,
  STOP_DESCENT_NODE_TYPES,
  isASTNode,
  localComesFrom,
  safeCompileRegex,
  type ImportMap,
} from '../../utils/framework-detectors';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`,
);

const HTTP_METHODS = new Set([
  'get', 'post', 'put', 'patch', 'delete', 'all',
]);

const DEFAULT_WEBHOOK_PATTERNS = [
  /\/webhook/i,
  /\/webhooks/i,
  /\/api\/webhook/i,
  /\/api\/webhooks/i,
];

// DISTINCTIVE verification method names — accepted unguarded (bare-identifier OR
// member call). Each is specific enough to webhook-signature verification that no
// general-purpose auth/validation library reuses it, so an unqualified match is a
// trustworthy signal. (Generic names like `verify`/`validate`/`verifySignature` are
// NOT here — see GATED_GENERIC_METHODS.)
const VERIFICATION_METHODS = new Set([
  'constructEvent', 'constructEventAsync',   // Stripe
  'timingSafeEqual',                          // crypto (HMAC compare — GitHub/Mailgun/Segment hand-rolled)
  'createSlackEventAdapter',                  // Slack
  'verifyKey',                                // Discord (discord-interactions, Ed25519) — distinctive
  'verifyWebhook',                            // Clerk (@clerk/backend) — distinctive
  'isValidWebhookEventSignature',             // Square (square SDK, WebhooksHelper) — distinctive
  // NB: `validateRequest` (Twilio) was deliberately NOT added here — it collides
  // with express-validator and generic body-validation middleware, so accepting it
  // unguarded would be a false negative. Twilio handlers are recognized only if the
  // user adds `validateRequest` (or `twilio.validateRequest`) via `verificationFunctions`.
]);

// GENERIC verification method names that DO collide with general auth/validation
// (`jwt.verify`, `joi.validate`, `schema.validate`, etc.). These are accepted ONLY
// in a member call AND ONLY when the receiver provably traces to a webhook library
// (import-traced) or an exact dotted caller path below — NEVER as a bare identifier
// and NEVER on an arbitrary receiver. This is the anti-`jwt.verify` discipline: a
// generic `.verify()`/`.validate()`/`.verifySignature()` must not silently satisfy
// the rule just because the name matches.
const GATED_GENERIC_METHODS = new Set(['verify', 'validate', 'verifySignature']);

// Webhook libraries whose `.verify()/.validate()/.verifySignature()` calls are
// trusted when the RECEIVER PROVABLY TRACES to one of them (import binding,
// `new Ctor()`, or a one-hop `const x = new Ctor()`). This is provenance — never
// name-only matching. Covers SendGrid (EventWebhook.verifySignature), AWS SNS
// (MessageValidator.validate), Square (WebhooksHelper.verifySignature), Linear
// (LinearWebhooks.verify), Clerk legacy (Webhook.verify), svix, @octokit/webhooks.
const WEBHOOK_VERIFY_MODULES = [
  'svix',
  '@octokit/webhooks',
  '@sendgrid/eventwebhook',
  'sns-validator',
  'square',
  '@linear/sdk',
  '@clerk/backend',
];

// Exact dotted caller paths. These are matched by name only (no provenance), so
// every entry MUST be distinctive enough that forging a local object with the same
// shape is implausible — `constructEvent`/`timingSafeEqual`/`createHmac` qualify.
// Generic leaves (`.validate`/`.verify`) must NOT be added here (they are forgeable
// via a trivial local object literal); route those through WEBHOOK_VERIFY_MODULES.
const VERIFICATION_CALLERS = new Set([
  'stripe.webhooks.constructEvent',
  'stripe.webhooks.constructEventAsync',
  'crypto.timingSafeEqual',
  'crypto.createHmac',
]);

type Options = [{
  webhookRoutePatterns?: string[];
  verificationFunctions?: string[];
}];

export const requireWebhookSignature = createRule<Options, 'missingWebhookSig'>({
  name: 'require-webhook-signature',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require signature verification in webhook handlers. Detects Stripe, GitHub, Svix, Slack, Discord, Clerk, Square, SendGrid, AWS SNS, and Linear patterns (generic verbs provenance-gated to a recognized webhook library). Unverified webhooks allow spoofed payloads.',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          webhookRoutePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional regex patterns for webhook route paths.',
          },
          verificationFunctions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional function names recognized as signature verification.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingWebhookSig:
        'Webhook handler `{{method}} {{path}}` has no visible signature verification. Verify the payload signature (e.g., `stripe.webhooks.constructEvent()`, `crypto.timingSafeEqual()`) to prevent spoofing.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const userPatterns = (options.webhookRoutePatterns ?? [])
      .map((p) => {
        const safe = safeCompileRegex(p);
        if (!safe) return null;
        // Reconstruct with 'i' flag for case-insensitive matching
        return new RegExp(safe.source, 'i');
      })
      .filter((r): r is RegExp => r !== null);
    const allPatterns = [...DEFAULT_WEBHOOK_PATTERNS, ...userPatterns];

    const userVerifyFns = new Set(options.verificationFunctions ?? []);
    const allVerifyMethods = new Set([...VERIFICATION_METHODS, ...userVerifyFns]);
    const allVerifyCallers = new Set([...VERIFICATION_CALLERS, ...userVerifyFns]);

    let importMap: ImportMap | null = null;
    let hasWebhookLib = false;

    function getImports() {
      if (importMap) return;
      importMap = buildImportMap(context.sourceCode);
      hasWebhookLib = WEBHOOK_VERIFY_MODULES.some((m) => hasImport(importMap!, m));
    }

    function isWebhookRoute(path: string): boolean {
      return allPatterns.some((p) => p.test(path));
    }

    function isWebhookFile(): boolean {
      const fn = context.filename.toLowerCase();
      // Skip test/spec/fixture files — they often contain `webhook` in the path
      // but are intentional test fixtures that don't represent real route handlers.
      if (
        /[/\\]__tests__[/\\]/.test(fn) ||
        /\.(test|spec)\.[cm]?[jt]sx?$/.test(fn) ||
        /[/\\](tests?|fixtures?|mocks?|__mocks__)[/\\]/.test(fn)
      ) {
        return false;
      }
      return fn.includes('webhook');
    }

    function handlerHasVerification(body: TSESTree.Node): boolean {
      return walkForVerification(body, new WeakSet());
    }

    function walkForVerification(node: TSESTree.Node, seen: WeakSet<object>): boolean {
      if (seen.has(node)) return false;
      seen.add(node);
      if (node.type === AST_NODE_TYPES.CallExpression) {
        // Direct function call
        if (
          node.callee.type === AST_NODE_TYPES.Identifier &&
          allVerifyMethods.has(node.callee.name)
        ) {
          return true;
        }

        // Member expression: obj.method()
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          const method = node.callee.property.name;

          // Distinctive method name → accept unguarded.
          if (allVerifyMethods.has(method)) return true;

          // Generic name (verify/validate/verifySignature) → accept ONLY when the
          // receiver provably traces to a webhook library. A failed gate does NOT
          // early-return false: we fall through to the dotted-path check and then
          // continue scanning the subtree (so a real verification elsewhere is still
          // found). This is the anti-`jwt.verify` guard — an arbitrary `.verify()`
          // on a non-webhook receiver never satisfies the rule.
          if (GATED_GENERIC_METHODS.has(method) && isLocalFromWebhookLib(node.callee.object, method)) {
            return true;
          }

          // Exact dotted caller paths (distinctive only — see VERIFICATION_CALLERS):
          // stripe.webhooks.constructEvent[Async], crypto.timingSafeEqual, crypto.createHmac.
          const path = buildCallPath(node.callee);
          if (path && allVerifyCallers.has(path)) return true;
        }
      }

      for (const key of Object.keys(node)) {
        if (AST_SKIP_KEYS.has(key)) continue;
        const value = (node as unknown as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            if (isASTNode(child) && !STOP_DESCENT_NODE_TYPES.has(child.type)) {
              if (walkForVerification(child, seen)) return true;
            }
          }
        } else if (isASTNode(value) && !STOP_DESCENT_NODE_TYPES.has(value.type)) {
          if (walkForVerification(value, seen)) return true;
        }
      }
      return false;
    }

    function localFromAnyWebhookModule(name: string): boolean {
      if (!importMap) return false;
      return WEBHOOK_VERIFY_MODULES.some((m) => localComesFrom(importMap!, name, m));
    }

    // One-hop, single-definition `const` resolution: is `idNode` bound by
    // `const x = new <Ctor>(...)` where <Ctor> is import-traced to a webhook lib?
    // Provenance-based (NOT name-based) — handles the common instantiate-then-verify
    // pattern (`const ew = new EventWebhook(); ew.verifySignature(...)`) without
    // widening trust to arbitrary receivers. Only ever ACCEPTS MORE under airtight
    // constructor provenance, so it cannot introduce a false negative.
    function receiverIsConstNewOfWebhookLib(idNode: TSESTree.Identifier): boolean {
      let scope: ReturnType<typeof context.sourceCode.getScope> | null =
        context.sourceCode.getScope(idNode);
      while (scope) {
        const variable = scope.variables.find((v) => v.name === idNode.name);
        if (variable) {
          if (variable.defs.length !== 1) return false;
          const decl = variable.defs[0].node;
          if (
            decl.type === AST_NODE_TYPES.VariableDeclarator &&
            decl.init?.type === AST_NODE_TYPES.NewExpression &&
            decl.init.callee.type === AST_NODE_TYPES.Identifier &&
            decl.parent.type === AST_NODE_TYPES.VariableDeclaration &&
            decl.parent.kind === 'const'
          ) {
            return localFromAnyWebhookModule(decl.init.callee.name);
          }
          return false;
        }
        scope = scope.upper;
      }
      return false;
    }

    // `method` is the generic verb being gated (verify | validate | verifySignature).
    // STRONG provenance (import binding / `new Ctor()` / one-hop `const x = new Ctor()`)
    // accepts for ANY verb. The weaker NAME-BASED fallback (receiver merely *named*
    // webhook-ish while a webhook lib is imported) is restricted to `verify` ONLY —
    // `validate` is overwhelmingly an input-validation verb (Joi/Zod/Mongoose) and
    // `verifySignature` is library-specific, so accepting EITHER on a name-only basis
    // would manufacture a false negative (a `webhooks`-named Joi schema calling
    // `.validate()` is not signature verification). Those two require strong provenance.
    function isLocalFromWebhookLib(node: TSESTree.Node, method: string): boolean {
      // Direct identifier traced to a webhook-lib import — strongest signal
      if (node.type === AST_NODE_TYPES.Identifier && localFromAnyWebhookModule(node.name)) {
        return true;
      }
      // Identifier bound to `const x = new <WebhookLibCtor>()` — provenance-traced
      if (node.type === AST_NODE_TYPES.Identifier && receiverIsConstNewOfWebhookLib(node)) {
        return true;
      }
      // `new Webhook(secret).verify(...)` — receiver is a NewExpression whose
      // callee is a local imported from a webhook lib
      if (
        node.type === AST_NODE_TYPES.NewExpression &&
        node.callee.type === AST_NODE_TYPES.Identifier &&
        localFromAnyWebhookModule(node.callee.name)
      ) {
        return true;
      }

      // NAME-BASED FALLBACK — `verify` only. Accepts `const wh = new Webhook(); wh.verify()`
      // / `this.wh.verify()` where the receiver can't be directly traced but is named
      // webhook-ish AND a webhook lib is imported. Deliberately NOT applied to
      // `validate` / `verifySignature` (see function comment) to avoid false negatives.
      if (method !== 'verify') return false;
      if (!hasWebhookLib) return false;

      // Identifier — accept webhook-named locals (`wh`, `webhook`, `hook`, etc.)
      if (node.type === AST_NODE_TYPES.Identifier) {
        return isWebhookBindingName(node.name);
      }
      // MemberExpression — accept when the immediate property is webhook-named
      // (e.g., `this.wh.verify`, `services.webhook.verify`)
      if (
        node.type === AST_NODE_TYPES.MemberExpression &&
        node.property.type === AST_NODE_TYPES.Identifier
      ) {
        return isWebhookBindingName(node.property.name);
      }
      // ThisExpression alone (`this.verify(...)`) — too generic to accept
      return false;
    }

    function isWebhookBindingName(name: string): boolean {
      const lower = name.toLowerCase();
      // Common webhook-binding identifiers. Excludes generic crypto/jwt/token names.
      return (
        lower === 'wh' ||
        lower === 'webhook' ||
        lower === 'webhooks' ||
        lower === 'hook' ||
        lower === 'svix' ||
        lower === 'octokit' ||
        lower.endsWith('webhook') ||
        lower.endsWith('webhooks')
      );
    }

    function buildCallPath(node: TSESTree.MemberExpression): string | null {
      const parts: string[] = [];
      let current: TSESTree.Node = node;
      while (
        current.type === AST_NODE_TYPES.MemberExpression &&
        current.property.type === AST_NODE_TYPES.Identifier &&
        !current.computed
      ) {
        parts.unshift(current.property.name);
        current = current.object;
      }
      if (current.type === AST_NODE_TYPES.Identifier) {
        parts.unshift(current.name);
        return parts.join('.');
      }
      return null;
    }

    function getRoutePathFromChain(start: TSESTree.Node): string | null | undefined {
      let current: TSESTree.Node = start;
      while (current.type === AST_NODE_TYPES.CallExpression) {
        if (
          current.callee.type !== AST_NODE_TYPES.MemberExpression ||
          current.callee.property.type !== AST_NODE_TYPES.Identifier
        ) {
          return undefined;
        }

        const propName = current.callee.property.name;
        if (propName === 'route') {
          return current.arguments[0] ? getPathString(current.arguments[0]) : null;
        }

        if (!HTTP_METHODS.has(propName)) return undefined;
        current = current.callee.object;
      }
      return undefined;
    }

    return {
      CallExpression(node) {
        getImports();

        if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return;
        if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return;
        const methodName = node.callee.property.name;
        if (!HTTP_METHODS.has(methodName)) return;

        const args = node.arguments;
        let pathStr: string | null = null;
        let firstHandlerArgIndex = 1;
        const inheritedPath = getRoutePathFromChain(node.callee.object);
        if (inheritedPath !== undefined) {
          if (args.length < 1) return;
          pathStr = inheritedPath;
          firstHandlerArgIndex = 0;
        } else {
          if (args.length < 2) return;
          pathStr = getPathString(args[0]);
        }

        const routeIsWebhook = pathStr
          ? isWebhookRoute(pathStr)
          : isWebhookFile();

        if (!routeIsWebhook) return;

        // Find the handler function (last function arg). Accept both
        // BlockStatement bodies and concise-arrow expression bodies — the
        // latter is common in AI-codegen and previously bypassed the rule
        // entirely (e.g., `(req, res) => res.status(200).end()` on a
        // webhook route silently passed).
        for (let i = args.length - 1; i >= firstHandlerArgIndex; i--) {
          const arg = args[i];
          if (
            arg.type === AST_NODE_TYPES.FunctionExpression ||
            arg.type === AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            if (!handlerHasVerification(arg.body)) {
              context.report({
                node,
                messageId: 'missingWebhookSig',
                data: {
                  method: methodName.toUpperCase(),
                  path: pathStr || '<dynamic>',
                },
              });
            }
            return;
          }
        }
      },
    };
  },
});

export default requireWebhookSignature;
