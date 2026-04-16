import { defineConfig } from 'tsup';

export default defineConfig([
  // Plugin bundle — CJS + ESM dual output.
  //
  // CJS interop: esbuild's default ESM->CJS wrapper yields `module.exports = {default: plugin}`,
  // which breaks `const aiGuard = require('@undercurrent/eslint-plugin-ai-guard')` because
  // consumers then have to reach through `.default`. `tsup`'s `cjsInterop: true` is meant
  // to fix this but does not in our case (src has a default export only, as required, yet
  // the option is a no-op in tsup 8.5.x). We manually append `module.exports = module.exports.default`
  // to the CJS output via esbuild's footer. ESM output is untouched.
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    outDir: 'dist',
    target: 'node18',
    external: ['eslint', '@typescript-eslint/utils'],
    esbuildOptions(options, context) {
      // `context.format` is an internal tsup field; fall back to inspecting
      // the esbuild format directly so we still apply the interop footer if
      // tsup ever drops or renames that field.
      const format = context?.format ?? options.format;
      if (format === 'cjs') {
        options.footer = {
          js:
            '// CJS interop: expose the default export as module.exports directly.\n' +
            '// The `typeof module` guard makes this safe to re-run and no-op under\n' +
            '// ESM hosts where `module` is not defined.\n' +
            'if (typeof module !== "undefined" && module.exports && module.exports.default) { module.exports = module.exports.default; }',
        };
      }
    },
  },
  // CLI bundle — CJS only (required for shebang binary)
  {
    entry: { 'cli/index': 'cli/index.ts' },
    format: ['cjs'],
    dts: false,
    clean: false,
    sourcemap: true,
    splitting: false,
    outDir: 'dist',
    target: 'node18',
    external: ['eslint', '@typescript-eslint/parser'],
    tsconfig: 'tsconfig.cli.json',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
