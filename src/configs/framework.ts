import type { TSESLint } from '@typescript-eslint/utils';

const framework: TSESLint.ClassicConfig.Config = {
  plugins: ['ai-guard'],
  rules: {
    'ai-guard/require-framework-auth': 'error',
    'ai-guard/require-framework-authz': 'warn',
    'ai-guard/require-webhook-signature': 'error',
  },
};

export default framework;
