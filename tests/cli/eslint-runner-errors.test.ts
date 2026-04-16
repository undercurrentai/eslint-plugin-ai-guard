import { describe, it, expect } from 'vitest';
import { runEslint } from '../../cli/utils/eslint-runner';

describe('cli eslint-runner errors', () => {
  it('throws a clear error when target path does not exist', async () => {
    await expect(
      runEslint({
        preset: 'recommended',
        targetPath: 'definitely-does-not-exist-12345.js',
      }),
    ).rejects.toThrow('Path not found: definitely-does-not-exist-12345.js');
  });
});

// Regression: loadPluginModuleFromCwd should handle cwd without package.json
// gracefully (M1 bug-hunt).
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

describe('cli eslint-runner loader edge cases', () => {
  it('does not throw when cwd has no package.json (uses cwd as anchor)', async () => {
    const originalCwd = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-guard-no-pkg-'));
    // Create a target file so we get past the path-check
    fs.writeFileSync(path.join(tmp, 'sample.js'), 'const x = 1;\n', 'utf8');
    try {
      process.chdir(tmp);
      // The loader should not reject with a createRequire-related ENOENT; it
      // should fall through to the "not installed" error cleanly.
      const err: unknown = await runEslint({ preset: 'recommended', targetPath: 'sample.js' }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).not.toMatch(/ENOENT/i);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('cli eslint-runner preset alignment', () => {
  it('strict preset does not emit deprecated no-await-in-loop', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-guard-runner-strict-'));
    const filePath = path.join(dir, 'sample.js');

    fs.writeFileSync(
      filePath,
      `
async function syncUsers(users) {
  for (const user of users) {
    await saveUser(user);
  }
}

try {
  maybeFails();
} catch (e) {}
async function saveUser() { return 1; }
function maybeFails() {}
`,
      'utf8',
    );

    try {
      const result = await runEslint({
        preset: 'strict',
        targetPath: filePath,
      });

      const ruleIds = result.files.flatMap((f) => f.issues.map((i) => i.ruleId));
      expect(ruleIds).toContain('ai-guard/no-empty-catch');
      expect(ruleIds).not.toContain('ai-guard/no-await-in-loop');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Regression: CLI RECOMMENDED_RULES preset must not re-enable rules deprecated
// in v2.0.0. The src/configs/recommended.ts preset drops these; the CLI map
// must match.
describe('cli recommended preset deprecated-rule sync', () => {
  it('ai-guard run --preset recommended does not re-enable deprecated rules', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-guard-recrun-'));
    const code = [
      'async function syncUsers(users) {',
      '  for (const u of users) { await save(u); }',
      '}',
      'async function f() { return 1; }',
      'try { bad(); } catch (e) {}',
    ].join('\n');
    fs.writeFileSync(path.join(tmp, 'sample.js'), code, 'utf8');
    try {
      const result = await runEslint({ preset: 'recommended', targetPath: tmp });
      const ruleIds = result.files.flatMap((f) => f.issues.map((i) => i.ruleId));
      // These 5 are deprecated in v2.0 and must NOT fire in the zero-config
      // recommended run — the CLI map must stay in sync with src/configs/recommended.ts.
      expect(ruleIds).not.toContain('ai-guard/no-await-in-loop');
      expect(ruleIds).not.toContain('ai-guard/no-async-without-await');
      expect(ruleIds).not.toContain('ai-guard/no-redundant-await');
      expect(ruleIds).not.toContain('ai-guard/no-broad-exception');
      expect(ruleIds).not.toContain('ai-guard/no-catch-without-use');
      // Sanity: an active recommended rule still fires.
      expect(ruleIds).toContain('ai-guard/no-empty-catch');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
