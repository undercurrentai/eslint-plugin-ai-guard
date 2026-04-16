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

const VERIFICATION_METHODS = new Set([
  'constructEvent', 'constructEventAsync',
  'verify',
  'timingSafeEqual',
  'createSlackEventAdapter',
]);

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
        'Require signature verification in webhook handlers. Detects Stripe, GitHub, Svix, and Slack patterns. Unverified webhooks allow spoofed payloads.',
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
    let hasSvix = false;
    let hasOctokit = false;

    function getImports() {
      if (importMap) return;
      importMap = buildImportMap(context.sourceCode);
      hasSvix = hasImport(importMap, 'svix');
      hasOctokit = hasImport(importMap, '@octokit/webhooks');
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

    function handlerHasVerification(body: TSESTree.BlockStatement): boolean {
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
          if (allVerifyMethods.has(method)) {
            // For generic 'verify', require the receiver to be a local imported
            // from svix or @octokit/webhooks (or be a `new Webhook(...)` from svix).
            // This avoids false positives where any unrelated `.verify()` call
            // (e.g., `jwt.verify()` of an arbitrary token) silently satisfies the rule.
            if (method === 'verify') {
              return isLocalFromWebhookLib(node.callee.object);
            }
            return true;
          }

          // Check full dotted paths: stripe.webhooks.constructEvent
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

    function isLocalFromWebhookLib(node: TSESTree.Node): boolean {
      // Direct identifier traced to svix/@octokit/webhooks import — strongest signal
      if (node.type === AST_NODE_TYPES.Identifier && importMap) {
        if (
          localComesFrom(importMap, node.name, 'svix') ||
          localComesFrom(importMap, node.name, '@octokit/webhooks')
        ) {
          return true;
        }
      }
      // `new Webhook(secret).verify(...)` — receiver is a NewExpression whose
      // callee is a local imported from svix or @octokit/webhooks
      if (node.type === AST_NODE_TYPES.NewExpression && importMap) {
        if (node.callee.type === AST_NODE_TYPES.Identifier) {
          if (
            localComesFrom(importMap, node.callee.name, 'svix') ||
            localComesFrom(importMap, node.callee.name, '@octokit/webhooks')
          ) {
            return true;
          }
        }
      }
      // Fallback: when svix/octokit is imported but we can't directly trace
      // the receiver to it (common with `const wh = new Webhook(secret); wh.verify()`
      // or `this.wh.verify()`), accept the call ONLY if the receiver name suggests
      // a webhook binding. This prevents false-NEGATIVES where unrelated libraries
      // with a `.verify()` method (e.g., jsonwebtoken's `jwt.verify()`) would be
      // mistakenly accepted as webhook-signature verification just because svix
      // happens to be imported elsewhere in the file.
      if (!hasSvix && !hasOctokit) return false;

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

    return {
      CallExpression(node) {
        getImports();

        if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return;
        if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return;
        const methodName = node.callee.property.name;
        if (!HTTP_METHODS.has(methodName)) return;

        const args = node.arguments;
        if (args.length < 2) return;

        const pathStr = getPathString(args[0]);
        const routeIsWebhook = pathStr
          ? isWebhookRoute(pathStr)
          : isWebhookFile();

        if (!routeIsWebhook) return;

        // Find the handler function (last function arg)
        for (let i = args.length - 1; i >= 1; i--) {
          const arg = args[i];
          if (
            (arg.type === AST_NODE_TYPES.FunctionExpression ||
              arg.type === AST_NODE_TYPES.ArrowFunctionExpression) &&
            arg.body.type === AST_NODE_TYPES.BlockStatement
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
