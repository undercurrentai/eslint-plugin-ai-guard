import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/YashJadhav21/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

/**
 * Keywords that strongly suggest SQL query context.
 */
const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|WHERE|FROM|JOIN|INTO|VALUES|SET|TABLE|DATABASE|GRANT|REVOKE|TRUNCATE)\b/i;

export const noSqlStringConcat = createRule({
  name: 'no-sql-string-concat',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow string concatenation or interpolation with variables in SQL query contexts. AI tools frequently generate SQL queries using template literals or string concatenation with user input, creating SQL injection vulnerabilities.',
    },
    fixable: undefined,
    schema: [],
    messages: {
      sqlStringConcat:
        'Potential SQL injection: string concatenation or interpolation detected in a SQL query. AI tools frequently generate this pattern. Use parameterized queries (e.g., `db.query("SELECT * FROM users WHERE id = $1", [id])`) instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      // Template literals: `SELECT * FROM users WHERE id = ${userId}`
      TemplateLiteral(node) {
        // Must have at least one expression (interpolation)
        if (node.expressions.length === 0) return;

        // Check if the static parts contain SQL keywords
        const staticText = node.quasis.map((q) => q.value.raw).join('');
        if (SQL_KEYWORDS.test(staticText)) {
          context.report({
            node,
            messageId: 'sqlStringConcat',
          });
        }
      },

      // Binary expressions: "SELECT * FROM users WHERE id = " + userId
      BinaryExpression(node) {
        if (node.operator !== '+') return;

        // Check if either side is a string literal containing SQL keywords
        const leftStr = getStringLiteralValue(node.left);
        const rightStr = getStringLiteralValue(node.right);

        if (
          (leftStr && SQL_KEYWORDS.test(leftStr)) ||
          (rightStr && SQL_KEYWORDS.test(rightStr))
        ) {
          // Make sure the other side is NOT a string literal (needs to be dynamic)
          const leftIsDynamic = !isStaticString(node.left);
          const rightIsDynamic = !isStaticString(node.right);

          if (leftIsDynamic || rightIsDynamic) {
            context.report({
              node,
              messageId: 'sqlStringConcat',
            });
          }
        }
      },
    };
  },
});

function getStringLiteralValue(node: TSESTree.Expression | TSESTree.PrivateIdentifier): string | null {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  return null;
}

function isStaticString(node: TSESTree.Expression | TSESTree.PrivateIdentifier): boolean {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return true;
  }
  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0
  ) {
    return true;
  }
  return false;
}

export default noSqlStringConcat;
