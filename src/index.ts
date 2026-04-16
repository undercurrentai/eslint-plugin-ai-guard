import { allRules } from './rules';
import recommended from './configs/recommended';
import strict from './configs/strict';
import security from './configs/security';
import compat from './configs/compat';
import framework from './configs/framework';

// NOTE: only a single default export. Named exports mix poorly with `tsup`'s
// `cjsInterop: true`, which is how we keep CJS consumers reading the plugin
// directly via `require()` (instead of having to reach through `.default`).
// Access named parts via the plugin object: `aiGuard.rules`, `aiGuard.configs.compat`, etc.
const plugin = {
  meta: {
    name: '@undercurrent/eslint-plugin-ai-guard',
    version: '2.0.0-beta.2',
  },
  rules: allRules,
  configs: {
    recommended,
    strict,
    security,
    compat,
    framework,
  },
};

export default plugin;
