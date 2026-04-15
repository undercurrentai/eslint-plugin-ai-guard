import type { TSESLint } from '@typescript-eslint/utils';

const strict: TSESLint.ClassicConfig.Config = {
  plugins: ['ai-guard'],
  rules: {
    // Strict preset: enforce every active ai-guard rule at error for mature teams
    // that want maximum coverage and are ready to tune exceptions locally.
    //
    // v2.0: 5 deprecated rules removed from strict — users who want them must
    // opt in explicitly in their own config (they remain available). See
    // docs/migration/v1-to-v2.md for the upstream replacements.

    // Error Handling - all at error
    'ai-guard/no-empty-catch': 'error',
    'ai-guard/no-catch-log-rethrow': 'error',
    // Async - all at error
    'ai-guard/no-async-array-callback': 'error',
    'ai-guard/no-floating-promise': 'error',
    // Security - all at error
    'ai-guard/no-hardcoded-secret': 'error',
    'ai-guard/no-eval-dynamic': 'error',
    'ai-guard/no-sql-string-concat': 'error',
    'ai-guard/no-unsafe-deserialize': 'error',
    'ai-guard/require-auth-middleware': 'error',
    'ai-guard/require-authz-check': 'error',
    // Quality - all at error
    'ai-guard/no-console-in-handler': 'error',
    'ai-guard/no-duplicate-logic-block': 'error',
  },
};

export default strict;
