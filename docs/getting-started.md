# Getting Started

## Install

```bash
npm i -D @undercurrent/eslint-plugin-ai-guard
```

## ESLint 9 Flat Config

```js
import aiGuard from '@undercurrent/eslint-plugin-ai-guard';

export default [
  {
    plugins: { 'ai-guard': aiGuard },
    rules: { ...aiGuard.configs.recommended.rules },
  },
];
```

## Presets

- `recommended`: adoption-first, low-noise defaults
- `strict`: all active rules at error
- `security`: security-only rules (incl. framework-aware trio)
- `framework`: the 3 framework-aware rules only (auth, authz, webhook signature)
- `compat`: disables all 7 deprecated rules so you can enable replacements cleanly
