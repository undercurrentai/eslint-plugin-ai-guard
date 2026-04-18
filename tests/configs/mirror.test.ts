import { describe, it, expect } from 'vitest';
import recommended from '../../src/configs/recommended';
import strict from '../../src/configs/strict';
import security from '../../src/configs/security';
import {
  RECOMMENDED_RULES,
  STRICT_RULES,
  SECURITY_RULES,
} from '../../cli/utils/eslint-runner';

// CLAUDE.md §4 invariant #2 + tasks/lessons.md L003:
// `cli/utils/eslint-runner.ts` rule maps MUST mirror `src/configs/*` severities
// for the 3 CLI-exposed presets (framework/compat are plugin-import-only).
//
// The CLI maps only list active rules (error/warn); rules set to 'off' in a
// config are intentionally absent from the CLI side, which is behaviorally
// equivalent under ESLint flat config. This test normalizes both sides by
// dropping 'off' entries before comparison — so:
//   - adding/removing an active rule on one side but not the other FAILS
//   - changing severity (error <-> warn) on one side FAILS
//   - flipping a rule between 'off' and 'error'/'warn' without updating both
//     sides FAILS (because normalization changes membership)
//
// A rule kept at 'off' on both sides is correctly ignored.

type ActiveLevel = 'error' | 'warn';

function normalizeActive(rules: Record<string, unknown> | undefined): Record<string, ActiveLevel> {
  const out: Record<string, ActiveLevel> = {};
  if (!rules) return out;
  for (const [id, level] of Object.entries(rules)) {
    if (level === 'error' || level === 'warn') {
      out[id] = level;
    }
  }
  return out;
}

describe('CLI ↔ configs mirror invariant (CLAUDE.md §4 #2)', () => {
  it('RECOMMENDED_RULES mirrors active rules of src/configs/recommended.ts', () => {
    expect(normalizeActive(RECOMMENDED_RULES)).toEqual(
      normalizeActive(recommended.rules),
    );
  });

  it('STRICT_RULES mirrors active rules of src/configs/strict.ts', () => {
    expect(normalizeActive(STRICT_RULES)).toEqual(
      normalizeActive(strict.rules),
    );
  });

  it('SECURITY_RULES mirrors active rules of src/configs/security.ts', () => {
    expect(normalizeActive(SECURITY_RULES)).toEqual(
      normalizeActive(security.rules),
    );
  });

  it('CLI maps contain no "off" entries (off-rules belong in configs, absent from CLI)', () => {
    const maps: Array<[string, Record<string, string>]> = [
      ['RECOMMENDED_RULES', RECOMMENDED_RULES],
      ['STRICT_RULES', STRICT_RULES],
      ['SECURITY_RULES', SECURITY_RULES],
    ];
    for (const [mapName, map] of maps) {
      for (const [rule, level] of Object.entries(map)) {
        expect(
          level,
          `${mapName}['${rule}'] is '${level}' — CLI maps should list only active rules`,
        ).not.toBe('off');
      }
    }
  });

  it('CLI maps reference only rules registered on the plugin', async () => {
    const { allRules } = await import('../../src/rules');
    const registered = new Set(Object.keys(allRules).map((k) => `ai-guard/${k}`));
    const maps: Array<[string, Record<string, string>]> = [
      ['RECOMMENDED_RULES', RECOMMENDED_RULES],
      ['STRICT_RULES', STRICT_RULES],
      ['SECURITY_RULES', SECURITY_RULES],
    ];
    for (const [mapName, map] of maps) {
      for (const rule of Object.keys(map)) {
        expect(
          registered.has(rule),
          `${mapName} references '${rule}' which is not in src/rules/index.ts allRules`,
        ).toBe(true);
      }
    }
  });
});
