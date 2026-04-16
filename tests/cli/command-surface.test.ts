import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { detect } from '../../cli/utils/detector';
import {
  addIgnoresToFlatConfig,
  addIgnoresToLegacyConfig,
  generateFlatConfig,
  generateLegacyConfig,
} from '../../cli/utils/config-manager';
import {
  RECOMMENDED_RULES,
  STRICT_RULES,
  SECURITY_RULES,
} from '../../cli/utils/eslint-runner';

const DEPRECATED_RULE_IDS = [
  'ai-guard/no-broad-exception',
  'ai-guard/no-catch-without-use',
  'ai-guard/no-await-in-loop',
  'ai-guard/no-async-without-await',
  'ai-guard/no-redundant-await',
  'ai-guard/require-auth-middleware',
  'ai-guard/require-authz-check',
];

describe('cli command surface helpers', () => {
  it('ignore helper injects ignores into flat config when missing', () => {
    const base = `import js from '@eslint/js';\n\nexport default [js.configs.recommended];\n`;
    const patched = addIgnoresToFlatConfig(base);

    expect(patched).toContain('ignores');
    expect(patched).toContain('node_modules/**');
  });

  it('ignore helper injects ignorePatterns into legacy config when missing', () => {
    const base = `module.exports = {\n  plugins: ['ai-guard']\n};\n`;
    const patched = addIgnoresToLegacyConfig(base);

    expect(patched).toContain('ignorePatterns');
    expect(patched).toContain('node_modules/');
  });

  it('doctor-style detection reports no config in a fresh directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-guard-detect-'));
    try {
      const result = detect(dir);
      expect(result.configType).toBe('none');
      expect(result.configPath).toBeNull();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects legacy unscoped plugin installs for migration compatibility', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-guard-legacy-plugin-'));
    try {
      const legacyPkgDir = path.join(dir, 'node_modules', 'eslint-plugin-ai-guard');
      fs.mkdirSync(legacyPkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(legacyPkgDir, 'package.json'),
        JSON.stringify({ name: 'eslint-plugin-ai-guard', version: '1.1.11' }),
        'utf8',
      );

      const result = detect(dir);
      expect(result.pluginInstalled).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generated configs include ai-guard presets for preset command flow', () => {
    const flat = generateFlatConfig('strict');
    const legacy = generateLegacyConfig('security');

    expect(flat).toContain('aiGuard.configs.strict.rules');
    expect(legacy).toContain('plugin:ai-guard/security');
  });

  // Preset UI (preset command) builds its "Preset Details" list dynamically
  // from these rule maps — if a deprecated ID leaks back in, the UI will
  // show a rule the CLI won't actually enforce.
  it('preset rule maps do not reference deprecated rule IDs', () => {
    for (const ruleMap of [RECOMMENDED_RULES, STRICT_RULES, SECURITY_RULES]) {
      for (const deprecatedId of DEPRECATED_RULE_IDS) {
        expect(Object.keys(ruleMap)).not.toContain(deprecatedId);
      }
    }
  });
});
