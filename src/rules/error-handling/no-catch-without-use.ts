import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

export const noCatchWithoutUse = createRule({
  name: 'no-catch-without-use',
  meta: {
    type: 'suggestion',
    deprecated: true,
    replacedBy: ['@typescript-eslint/no-unused-vars'],
    docs: {
      description:
        '[DEPRECATED — use `@typescript-eslint/no-unused-vars` with `caughtErrors: "all"`] Disallow catch parameters that are never used. Kept for backwards-compatibility in v2.x; removed in v3.0.',
    },
    fixable: undefined,
    schema: [],
    messages: {
      unusedCatchParam:
        '[ai-guard deprecated — use `@typescript-eslint/no-unused-vars` with `caughtErrors: "all"`] Catch parameter `{{name}}` is never used.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CatchClause(node) {
        if (!node.param || node.param.type !== AST_NODE_TYPES.Identifier) {
          return;
        }

        const catchParamName = node.param.name;

        // `_error` naming is a common convention to intentionally ignore values.
        if (catchParamName.startsWith('_')) {
          return;
        }

        // Token-based check is intentionally conservative: if the identifier appears
        // anywhere in the catch body, we treat it as used to avoid false positives.
        const tokens = context.sourceCode.getTokens(node.body);
        const hasUsage = tokens.some(
          (token) => token.type === 'Identifier' && token.value === catchParamName
        );

        if (!hasUsage) {
          context.report({
            node: node.param,
            messageId: 'unusedCatchParam',
            data: { name: catchParamName },
          });
        }
      },
    };
  },
});

export default noCatchWithoutUse;
