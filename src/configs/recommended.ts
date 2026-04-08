import type { TSESLint } from '@typescript-eslint/utils';

const recommended: TSESLint.ClassicConfig.Config = {
  plugins: ['ai-guard'],
  rules: {
    // Error Handling
    'ai-guard/no-empty-catch': 'error',
    'ai-guard/no-broad-exception': 'warn',
    // Async
    'ai-guard/no-async-array-callback': 'error',
    'ai-guard/no-floating-promise': 'error',
    'ai-guard/no-await-in-loop': 'warn',
    // Security
    'ai-guard/no-hardcoded-secret': 'error',
    'ai-guard/no-eval-dynamic': 'error',
    'ai-guard/no-sql-string-concat': 'error',
    'ai-guard/require-auth-middleware': 'warn',
  },
};

export default recommended;
