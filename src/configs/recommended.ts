import type { TSESLint } from '@typescript-eslint/utils';

const recommended: TSESLint.ClassicConfig.Config = {
  plugins: ['ai-guard'],
  rules: {
    // Adoption-first default:
    // Keep only high-confidence, high-impact rules at error so first run is actionable,
    // not overwhelming. Context-sensitive rules are warn/off by design.
    //
    // v2.0: removed 5 rules that overlap with typescript-eslint / ESLint core.
    // Those rules remain available in the plugin for backwards compatibility but are
    // not enabled by default. See docs/guides/compat-config.md and
    // docs/migration/v1-to-v2.md for the upstream replacements.

    // Critical (error): low-noise, high-impact correctness/security failures.
    'ai-guard/no-empty-catch': 'error',
    'ai-guard/no-floating-promise': 'error',
    'ai-guard/no-hardcoded-secret': 'error',
    'ai-guard/no-eval-dynamic': 'error',

    // Important but noisier/context-dependent (warn): useful guidance without blocking.
    'ai-guard/require-auth-middleware': 'warn',
    'ai-guard/no-sql-string-concat': 'warn',

    // Kept as warn in recommended to reduce false positives in mixed codebases.
    'ai-guard/no-async-array-callback': 'warn',

    // Optional/contextual (off): available for teams via strict/custom configs.
    'ai-guard/no-console-in-handler': 'off',
    'ai-guard/no-unsafe-deserialize': 'warn',
    'ai-guard/no-catch-log-rethrow': 'off',
    'ai-guard/require-authz-check': 'warn',
    'ai-guard/no-duplicate-logic-block': 'off',
  },
};

export default recommended;
