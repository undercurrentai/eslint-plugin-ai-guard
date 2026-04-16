import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

function isInsideTryLikeBlock(
  returnNode: TSESTree.ReturnStatement,
  context: Readonly<Parameters<ReturnType<typeof createRule>['create']>[0]>
): boolean {
  const ancestors = context.sourceCode.getAncestors(returnNode);

  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestor = ancestors[i];

    if (
      ancestor.type === AST_NODE_TYPES.FunctionDeclaration ||
      ancestor.type === AST_NODE_TYPES.FunctionExpression ||
      ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      break;
    }

    if (ancestor.type === AST_NODE_TYPES.TryStatement) {
      return true;
    }
  }

  return false;
}

function isInsideAsyncFunction(
  returnNode: TSESTree.ReturnStatement,
  context: Readonly<Parameters<ReturnType<typeof createRule>['create']>[0]>
): boolean {
  const ancestors = context.sourceCode.getAncestors(returnNode);

  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const ancestor = ancestors[i];
    if (
      ancestor.type === AST_NODE_TYPES.FunctionDeclaration ||
      ancestor.type === AST_NODE_TYPES.FunctionExpression ||
      ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return ancestor.async;
    }
  }

  return false;
}

export const noRedundantAwait = createRule({
  name: 'no-redundant-await',
  meta: {
    type: 'suggestion',
    deprecated: true,
    replacedBy: ['@typescript-eslint/return-await'],
    docs: {
      description:
        '[DEPRECATED — use `@typescript-eslint/return-await`] Disallow `return await` in async functions when not inside try/catch/finally. Kept for backwards-compatibility in v2.x; removed in v3.0.',
    },
    fixable: undefined,
    schema: [],
    messages: {
      redundantAwait:
        '[ai-guard deprecated — use `@typescript-eslint/return-await`] Redundant `return await` detected. Return the Promise directly unless you need await for try/catch behavior.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ReturnStatement(node) {
        if (!node.argument || node.argument.type !== AST_NODE_TYPES.AwaitExpression) {
          return;
        }

        if (!isInsideAsyncFunction(node, context)) {
          return;
        }

        if (isInsideTryLikeBlock(node, context)) {
          return;
        }

        context.report({
          node: node.argument,
          messageId: 'redundantAwait',
        });
      },

      ArrowFunctionExpression(node) {
        if (!node.async || node.body.type !== AST_NODE_TYPES.AwaitExpression) {
          return;
        }

        context.report({
          node: node.body,
          messageId: 'redundantAwait',
        });
      },
    };
  },
});

export default noRedundantAwait;
