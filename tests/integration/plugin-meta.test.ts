import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import plugin from '../../src/index';

describe('plugin metadata', () => {
  it('keeps meta.name and meta.version aligned with package.json', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      name: string;
      version: string;
    };

    expect(plugin.meta.name).toBe(pkg.name);
    expect(plugin.meta.version).toBe(pkg.version);
  });

  it('declares an engines.node floor that covers the CLI runtime floor (>= 20.12.0)', () => {
    // Regression guard (bug-hunt 2026-06-16): the CLI's @inquirer/core does a
    // top-level `import { styleText } from 'node:util'`, and `styleText` is only a
    // named export of node:util from Node 20.12.0. A declared floor below 20.12.0
    // advertises a support window (20.0–20.11) where `ai-guard init-context`/`preset`
    // crash at module load. Do NOT loosen this back to >=20.0.0.
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      engines?: { node?: string };
    };
    const floor = pkg.engines?.node ?? '';
    const match = floor.match(/(\d+)\.(\d+)\.(\d+)/);
    expect(match, `engines.node should declare a concrete floor, got "${floor}"`).not.toBeNull();
    const [major, minor] = [Number(match![1]), Number(match![2])];
    // major > 20, or 20.x with x >= 12
    expect(major > 20 || (major === 20 && minor >= 12)).toBe(true);
  });
});
