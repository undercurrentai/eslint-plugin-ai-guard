import type { TSESLint } from '@typescript-eslint/utils';

const security: TSESLint.ClassicConfig.Config = {
  plugins: ['ai-guard'],
  rules: {
    // Security-only preset:
    // Error = direct high-risk patterns. Warn = security-relevant but context-sensitive.
    'ai-guard/no-hardcoded-secret': 'error',
    'ai-guard/no-eval-dynamic': 'error',
    'ai-guard/no-sql-string-concat': 'error',
    'ai-guard/no-unsafe-deserialize': 'warn',
    'ai-guard/require-framework-auth': 'warn',
    'ai-guard/require-framework-authz': 'warn',
    'ai-guard/require-webhook-signature': 'warn',
  },
};

export default security;
