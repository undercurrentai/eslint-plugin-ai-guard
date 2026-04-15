import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

function containsAwaitExpression(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return true;
  }

  if (node.type === AST_NODE_TYPES.ForOfStatement && node.await) {
    return true;
  }

  // Do not count await expressions inside nested functions.
  if (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return false;
  }

  const entries = Object.entries(node) as Array<[string, unknown]>;
  for (const [key, value] of entries) {
    if (key === 'parent') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) {
          if (containsAwaitExpression(child as TSESTree.Node)) {
            return true;
          }
        }
      }
      continue;
    }

    if (value && typeof value === 'object' && 'type' in value) {
      if (containsAwaitExpression(value as TSESTree.Node)) {
        return true;
      }
    }
  }

  return false;
}

export const noAsyncWithoutAwait = createRule({
  name: 'no-async-without-await',
  meta: {
    type: 'suggestion',
    deprecated: true,
    replacedBy: ['@typescript-eslint/require-await'],
    docs: {
      description:
        '[DEPRECATED — use `@typescript-eslint/require-await`] Disallow async functions that never use await. Kept for backwards-compatibility in v2.x; removed in v3.0.',
    },
    fixable: undefined,
    schema: [],
    messages: {
      asyncWithoutAwait:
        '[ai-guard deprecated — use `@typescript-eslint/require-await`] Async function does not contain `await`. Remove `async` or add proper await logic.',
    },
  },
  defaultOptions: [],
  create(context) {
    function reportIfNeeded(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
    ): void {
      if (!node.async) {
        return;
      }

      // Async arrow with expression body cannot contain await unless the body itself is AwaitExpression.
      if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
        if (node.body.type !== AST_NODE_TYPES.AwaitExpression) {
          context.report({
            node,
            messageId: 'asyncWithoutAwait',
          });
        }
        return;
      }

      if (!containsAwaitExpression(node.body)) {
        context.report({
          node,
          messageId: 'asyncWithoutAwait',
        });
      }
    }

    return {
      FunctionDeclaration: reportIfNeeded,
      FunctionExpression: reportIfNeeded,
      ArrowFunctionExpression: reportIfNeeded,
    };
  },
});

export default noAsyncWithoutAwait;
