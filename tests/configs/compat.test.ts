import { describe, it, expect } from 'vitest';
import plugin from '../../src/index';
import compat from '../../src/configs/compat';

const DEPRECATED_RULE_IDS = [
  'ai-guard/no-await-in-loop',
  'ai-guard/no-async-without-await',
  'ai-guard/no-redundant-await',
  'ai-guard/no-broad-exception',
  'ai-guard/no-catch-without-use',
] as const;

describe('configs/compat', () => {
  it('is exposed on the plugin as aiGuard.configs.compat', () => {
    expect(plugin.configs.compat).toBeDefined();
    expect(plugin.configs.compat).toBe(compat);
  });

  it('registers the ai-guard plugin identifier', () => {
    expect(compat.plugins).toEqual(['ai-guard']);
  });

  it('turns off each of the 5 deprecated v2.0 rules', () => {
    const rules = compat.rules ?? {};
    for (const id of DEPRECATED_RULE_IDS) {
      expect(rules[id]).toBe('off');
    }
  });

  it('does not enable any cross-plugin rules (semantics must be stable)', () => {
    const rules = compat.rules ?? {};
    for (const [id, level] of Object.entries(rules)) {
      expect(id.startsWith('ai-guard/')).toBe(true);
      expect(level).toBe('off');
    }
  });

  it('does not disable any non-deprecated rule', () => {
    const rules = compat.rules ?? {};
    const configured = new Set(Object.keys(rules));
    const deprecated = new Set<string>(DEPRECATED_RULE_IDS);
    for (const id of configured) {
      expect(deprecated.has(id)).toBe(true);
    }
  });
});

describe('deprecated rules', () => {
  it('mark all 5 rules as deprecated in their meta', () => {
    const ruleNames = [
      'no-await-in-loop',
      'no-async-without-await',
      'no-redundant-await',
      'no-broad-exception',
      'no-catch-without-use',
    ] as const;

    for (const name of ruleNames) {
      const rule = plugin.rules[name];
      expect(rule, `rule ${name} missing from plugin.rules`).toBeDefined();
      expect(
        (rule as { meta: { deprecated?: boolean } }).meta.deprecated,
        `rule ${name} must have meta.deprecated=true`
      ).toBe(true);
    }
  });

  it('rules remain functional (still export a create function)', () => {
    const ruleNames = [
      'no-await-in-loop',
      'no-async-without-await',
      'no-redundant-await',
      'no-broad-exception',
      'no-catch-without-use',
    ] as const;
    for (const name of ruleNames) {
      const rule = plugin.rules[name] as { create: unknown };
      expect(typeof rule.create).toBe('function');
    }
  });

  it.each([
    ['no-await-in-loop', 'awaitInLoop'],
    ['no-async-without-await', 'asyncWithoutAwait'],
    ['no-redundant-await', 'redundantAwait'],
    ['no-broad-exception', 'broadException'],
    ['no-catch-without-use', 'unusedCatchParam'],
  ] as const)(
    'rule %s includes `[ai-guard deprecated` prefix in message id `%s`',
    (ruleName, messageId) => {
      const rule = plugin.rules[ruleName] as {
        meta: { messages: Record<string, string> };
      };
      const text = rule.meta.messages[messageId];
      expect(text, `rule ${ruleName} has no message for id ${messageId}`).toBeDefined();
      expect(text.startsWith('[ai-guard deprecated')).toBe(true);
    }
  );

  it.each([
    ['no-await-in-loop', ['no-await-in-loop']],
    ['no-async-without-await', ['@typescript-eslint/require-await']],
    ['no-redundant-await', ['@typescript-eslint/return-await']],
    ['no-broad-exception', ['@typescript-eslint/no-explicit-any']],
    ['no-catch-without-use', ['@typescript-eslint/no-unused-vars']],
  ] as const)(
    'rule %s declares a non-empty replacedBy meta pointing at verified upstream rule(s)',
    (ruleName, expected) => {
      const rule = plugin.rules[ruleName] as {
        meta: { replacedBy?: readonly string[] };
      };
      expect(rule.meta.replacedBy).toEqual(expected);
    }
  );

  it('are NOT present in recommended preset', () => {
    const rules = plugin.configs.recommended.rules ?? {};
    for (const id of DEPRECATED_RULE_IDS) {
      expect(rules[id]).toBeUndefined();
    }
  });

  it('are NOT present in strict preset', () => {
    const rules = plugin.configs.strict.rules ?? {};
    for (const id of DEPRECATED_RULE_IDS) {
      expect(rules[id]).toBeUndefined();
    }
  });
});
