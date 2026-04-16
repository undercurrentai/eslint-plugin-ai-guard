import type { TSESLint } from '@typescript-eslint/utils';

/**
 * Compat config: explicitly disables the 5 ai-guard rules that were deprecated
 * in v2.0.0 because they overlap with ESLint core / @typescript-eslint.
 *
 * This preset exists for users who:
 *   (a) Had these rules enabled via their own config in v1.x and want a
 *       one-line opt-out.
 *   (b) Run @typescript-eslint alongside ai-guard and want to pre-empt any
 *       chance of duplicate diagnostics.
 *
 * Replacements (you must enable these in your own config — this preset does
 * NOT auto-enable cross-plugin rules, by design):
 *
 *   ai-guard/no-await-in-loop       → eslint core: no-await-in-loop
 *   ai-guard/no-async-without-await → @typescript-eslint/require-await
 *   ai-guard/no-redundant-await     → @typescript-eslint/return-await
 *   ai-guard/no-broad-exception     → @typescript-eslint/no-explicit-any
 *                                    + @typescript-eslint/use-unknown-in-catch-callback-variable
 *   ai-guard/no-catch-without-use   → @typescript-eslint/no-unused-vars
 *                                    ({ caughtErrors: 'all' })
 *
 * See docs/guides/compat-config.md for usage examples.
 */
const compat: TSESLint.ClassicConfig.Config = {
  plugins: ['ai-guard'],
  rules: {
    'ai-guard/no-await-in-loop': 'off',
    'ai-guard/no-async-without-await': 'off',
    'ai-guard/no-redundant-await': 'off',
    'ai-guard/no-broad-exception': 'off',
    'ai-guard/no-catch-without-use': 'off',
  },
};

export default compat;
