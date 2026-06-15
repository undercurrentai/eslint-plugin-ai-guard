import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

// Bare identifiers that commonly hold untrusted input.
const UNTRUSTED_IDENTIFIER_NAMES = [
  'input',
  'userInput',
  'rawBody',
  'payload',
  'body',
  'query',
  'param',
  'params',
  'data',
  'requestBody',
] as const;

// Single source of truth for untrusted request-object property names — used by
// the member-expression branch so it can no longer drift from the identifier
// list (previously `param` was in the identifier list but the inline member
// check only matched `params`).
const UNTRUSTED_REQUEST_OBJECTS = ['req', 'request'] as const;
const UNTRUSTED_REQUEST_PROPERTIES = ['body', 'query', 'params', 'param'] as const;

// Browser URL-derived taint sources (attacker-influenceable).
const UNTRUSTED_LOCATION_PROPERTIES = ['hash', 'search', 'href'] as const;
const UNTRUSTED_DOCUMENT_PROPERTIES = ['URL', 'referrer'] as const;

function includesName(list: readonly string[], name: string): boolean {
  return list.includes(name);
}

function isJsonParseCall(node: TSESTree.CallExpression): boolean {
  return (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.object.type === AST_NODE_TYPES.Identifier &&
    node.callee.object.name === 'JSON' &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'parse'
  );
}

// Unwrap no-op string coercions — `String(x)` and `x.toString()` — to the inner
// expression. AI-generated code frequently wraps untrusted input in a coercion
// that does not sanitize it (`JSON.parse(String(req.body))`), which previously
// bypassed detection because the outer call was never inspected.
function unwrapCoercion(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  // Bounded to guard against pathological nesting.
  for (let depth = 0; depth < 5; depth += 1) {
    if (current.type !== AST_NODE_TYPES.CallExpression) {
      break;
    }

    // String(x)
    if (
      current.callee.type === AST_NODE_TYPES.Identifier &&
      current.callee.name === 'String' &&
      current.arguments.length === 1 &&
      current.arguments[0].type !== AST_NODE_TYPES.SpreadElement
    ) {
      current = current.arguments[0];
      continue;
    }

    // x.toString()
    if (
      current.callee.type === AST_NODE_TYPES.MemberExpression &&
      current.callee.property.type === AST_NODE_TYPES.Identifier &&
      current.callee.property.name === 'toString' &&
      current.arguments.length === 0
    ) {
      current = current.callee.object;
      continue;
    }

    break;
  }
  return current;
}

function isUntrustedMemberExpression(node: TSESTree.MemberExpression): boolean {
  // req.body / request.query / req.param / ...
  if (
    node.object.type === AST_NODE_TYPES.Identifier &&
    includesName(UNTRUSTED_REQUEST_OBJECTS, node.object.name) &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    includesName(UNTRUSTED_REQUEST_PROPERTIES, node.property.name)
  ) {
    return true;
  }

  // Bare location.hash / location.search / location.href
  if (
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === 'location' &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    includesName(UNTRUSTED_LOCATION_PROPERTIES, node.property.name)
  ) {
    return true;
  }

  // window.location.hash / window.location.search / window.location.href
  if (
    node.object.type === AST_NODE_TYPES.MemberExpression &&
    node.object.object.type === AST_NODE_TYPES.Identifier &&
    node.object.object.name === 'window' &&
    node.object.property.type === AST_NODE_TYPES.Identifier &&
    node.object.property.name === 'location' &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    includesName(UNTRUSTED_LOCATION_PROPERTIES, node.property.name)
  ) {
    return true;
  }

  // document.URL / document.referrer
  if (
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === 'document' &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    includesName(UNTRUSTED_DOCUMENT_PROPERTIES, node.property.name)
  ) {
    return true;
  }

  // Tainted-property access: reading a property off an already-untrusted source
  // is itself untrusted (e.g. `req.body.data`, `ctx.request.body` where the
  // base resolves untrusted). Recurses up the member chain; terminates because
  // each step strips one property.
  if (isLikelyUntrustedSource(node.object)) {
    return true;
  }

  return false;
}

function isLikelyUntrustedSource(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return includesName(UNTRUSTED_IDENTIFIER_NAMES, node.name);
  }

  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return isUntrustedMemberExpression(node);
  }

  return false;
}

export const noUnsafeDeserialize = createRule({
  name: 'no-unsafe-deserialize',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow JSON.parse() on likely untrusted input without visible validation. AI tools frequently parse request/user payloads directly, which can introduce unsafe deserialization and downstream injection risks.',
    },
    fixable: undefined,
    schema: [],
    messages: {
      unsafeDeserialize:
        'Potential unsafe deserialization: JSON.parse() is used on likely untrusted input without visible schema validation. AI tools frequently generate this shortcut. Validate input before parsing.',
    },
  },
  defaultOptions: [],
  create(context) {
    // Conservative one-level alias resolution: a `const` initialized directly
    // from an untrusted source is treated as untrusted at the parse site
    // (`const b = req.body; JSON.parse(b);`). Restricted to single-definition
    // `const` bindings so reassignment / sanitization can never be a false
    // positive. Deeper data-flow taint tracking is intentionally out of scope.
    //
    // This resolution is ADDITIVE ONLY: it runs after `isLikelyUntrustedSource`
    // short-circuits (see the `||` at the report site), so it can add findings
    // (an untrusted-initialized `const`) but cannot SUPPRESS a finding on a bare
    // identifier that merely shares an untrusted-sounding name. Provenance-aware
    // suppression of name-matched identifiers is a deliberate detection-policy
    // tradeoff tracked as a known limitation in the rule doc, not done here.
    function resolvesToUntrustedConst(idNode: TSESTree.Identifier): boolean {
      let scope: ReturnType<typeof context.sourceCode.getScope> | null =
        context.sourceCode.getScope(idNode);

      while (scope) {
        const variable = scope.variables.find((v) => v.name === idNode.name);
        if (variable) {
          if (variable.defs.length !== 1) {
            return false;
          }
          const declNode = variable.defs[0].node;
          if (
            declNode.type === AST_NODE_TYPES.VariableDeclarator &&
            declNode.init !== null &&
            declNode.parent.type === AST_NODE_TYPES.VariableDeclaration &&
            declNode.parent.kind === 'const'
          ) {
            return isLikelyUntrustedSource(declNode.init);
          }
          return false;
        }
        scope = scope.upper;
      }
      return false;
    }

    return {
      CallExpression(node) {
        if (!isJsonParseCall(node)) {
          return;
        }

        const rawArg = node.arguments[0];
        if (!rawArg || rawArg.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }

        const inputArg = unwrapCoercion(rawArg);

        const flagged =
          isLikelyUntrustedSource(inputArg) ||
          (inputArg.type === AST_NODE_TYPES.Identifier &&
            resolvesToUntrustedConst(inputArg));

        if (flagged) {
          context.report({
            node,
            messageId: 'unsafeDeserialize',
          });
        }
      },
    };
  },
});

export default noUnsafeDeserialize;
