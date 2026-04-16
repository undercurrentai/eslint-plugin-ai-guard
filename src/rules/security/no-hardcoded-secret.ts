import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);



/**
 * Single-token identifier names that suggest a secret (whole token, not substring).
 * Matched after tokenizing the variable name on camel/Pascal case boundaries and
 * snake/kebab separators — so `secretary` / `passwordless` / `keyboard` no longer
 * trigger on their substring overlap with `secret` / `password` / `key`.
 */
const SECRET_TOKENS = new Set([
  'secret',
  'password',
  'passwd',
  'apikey',
  'authtoken',
  'accesstoken',
  'privatekey',
  'clientsecret',
  'jwtsecret',
  'encryptionkey',
  'signingkey',
]);

/**
 * Adjacent-token pairs that together identify a secret — for camel/snake/kebab
 * forms (`apiKey`, `api_key`, `api-key`, `MY_API_KEY` → tokens `api, key`).
 */
const SECRET_TOKEN_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['api', 'key'],
  ['auth', 'token'],
  ['access', 'token'],
  ['private', 'key'],
  ['client', 'secret'],
  ['jwt', 'secret'],
  ['encryption', 'key'],
  ['signing', 'key'],
];

function tokenizeIdentifier(name: string): string[] {
  return name
    // camelCase → camel_Case
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    // HTTPServer → HTTP_Server (acronym-to-word boundary)
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .split(/[_\-]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0);
}

function isSecretName(name: string): boolean {
  const tokens = tokenizeIdentifier(name);
  for (const t of tokens) {
    if (SECRET_TOKENS.has(t)) return true;
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    for (const [a, b] of SECRET_TOKEN_PAIRS) {
      if (tokens[i] === a && tokens[i + 1] === b) return true;
    }
  }
  return false;
}

/**
 * Patterns that are definitely NOT secrets — common false positives.
 */
const FALSE_POSITIVE_VALUES = new Set([
  'password',
  'secret',
  'token',
  'key',
  'api_key',
  'apikey',
  '',
  'undefined',
  'null',
  'test',
  'example',
  'placeholder',
  'changeme',
  'your-api-key',
  'your-secret',
  'YOUR_API_KEY',
  'YOUR_SECRET',
  'xxx',
  'TODO',
]);

export const noHardcodedSecret = createRule({
  name: 'no-hardcoded-secret',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded secrets, API keys, passwords, and tokens in source code. AI tools frequently generate placeholder credentials that get committed to version control, creating security vulnerabilities.',
    },
    fixable: undefined,
    schema: [],
    messages: {
      hardcodedSecret:
        'Possible hardcoded secret in variable `{{name}}`. AI tools frequently generate placeholder credentials that get committed to version control. Use environment variables (e.g., `process.env.{{envName}}`) instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      VariableDeclarator(node) {
        // Only check: const SECRET = 'literal_value'
        if (!node.init) return;
        if (!node.id || node.id.type !== AST_NODE_TYPES.Identifier) return;

        const varName = node.id.name;

        // Check if variable name suggests a secret
        if (!isSecretName(varName)) return;

        // Only flag string literals and template literals with no expressions
        const value = getStringValue(node.init);
        if (value === null) return;

        // Skip obviously fake/placeholder values
        if (FALSE_POSITIVE_VALUES.has(value)) return;
        if (value.length < 8) return;

        // Skip process.env references (already using env vars)
        if (isProcessEnvAccess(node.init)) return;

        context.report({
          node: node.init,
          messageId: 'hardcodedSecret',
          data: {
            name: varName,
            envName: toEnvVarName(varName),
          },
        });
      },

      // Also check: obj.secret = 'literal_value'
      AssignmentExpression(node) {
        if (node.left.type !== AST_NODE_TYPES.MemberExpression) return;
        if (node.left.property.type !== AST_NODE_TYPES.Identifier) return;

        const propName = node.left.property.name;
        if (!isSecretName(propName)) return;

        const value = getStringValue(node.right);
        if (value === null) return;
        if (FALSE_POSITIVE_VALUES.has(value)) return;
        if (value.length < 8) return;
        if (isProcessEnvAccess(node.right)) return;

        context.report({
          node: node.right,
          messageId: 'hardcodedSecret',
          data: {
            name: propName,
            envName: toEnvVarName(propName),
          },
        });
      },

      // Check property assignments in object literals: { secret: 'value' }
      Property(node) {
        if (node.key.type !== AST_NODE_TYPES.Identifier) return;
        if (isRuleMetaMessagesProperty(node)) return;

        const propName = node.key.name;
        if (!isSecretName(propName)) return;

        const value = getStringValue(node.value as TSESTree.Expression);
        if (value === null) return;
        if (FALSE_POSITIVE_VALUES.has(value)) return;
        if (value.length < 8) return;
        if (isProcessEnvAccess(node.value as TSESTree.Expression)) return;

        context.report({
          node: node.value,
          messageId: 'hardcodedSecret',
          data: {
            name: propName,
            envName: toEnvVarName(propName),
          },
        });
      },
    };
  },
});

function getStringValue(node: TSESTree.Expression): string | null {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked ?? null;
  }
  return null;
}

function isRuleMetaMessagesProperty(node: TSESTree.Property): boolean {
  if (!node.parent || node.parent.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }

  const parentProperty = node.parent.parent;
  if (!parentProperty || parentProperty.type !== AST_NODE_TYPES.Property) {
    return false;
  }

  return (
    parentProperty.key.type === AST_NODE_TYPES.Identifier &&
    parentProperty.key.name === 'messages'
  );
}

function isProcessEnvAccess(node: TSESTree.Expression): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.MemberExpression &&
    node.object.object.type === AST_NODE_TYPES.Identifier &&
    node.object.object.name === 'process' &&
    node.object.property.type === AST_NODE_TYPES.Identifier &&
    node.object.property.name === 'env'
  );
}

function toEnvVarName(name: string): string {
  // Convert camelCase/PascalCase to UPPER_SNAKE_CASE
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[-\s]/g, '_')
    .toUpperCase();
}

export default noHardcodedSecret;
