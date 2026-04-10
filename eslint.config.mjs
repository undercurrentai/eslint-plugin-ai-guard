import aiGuard from 'eslint-plugin-ai-guard';

export default [
  // Ignore generated / dependency directories
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'out/**',
    ],
  },

  // ai-guard: catch AI-generated code patterns
  {
    plugins: {
      'ai-guard': aiGuard.default,
    },
    rules: {
      ...aiGuard.recommended.rules,
    },
  },
];
