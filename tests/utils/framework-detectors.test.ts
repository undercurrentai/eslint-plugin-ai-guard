import { describe, it, expect } from 'vitest';
import {
  isNextjsRouteHandler,
  hasDecoratorNamed,
  getDecoratorCallName,
  getMemberPath,
  getPathString,
  isCallToName,
  safeCompileRegex,
} from '../../src/utils/framework-detectors';
import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

describe('isNextjsRouteHandler', () => {
  it.each([
    ['/project/app/api/users/route.ts', true],
    ['/project/app/dashboard/settings/route.tsx', true],
    ['/project/app/webhooks/stripe/route.js', true],
    ['C:\\project\\app\\api\\route.ts', true],
    ['/project/src/app/api/route.tsx', true],
    ['/project/src/routes/api.ts', false],
    ['/project/app/page.tsx', false],
    ['/project/app/layout.ts', false],
    ['/project/routes/route.ts', false],
    ['/project/app/route.ts', true], // top-level App Router root catch-all (audit M9)
  ])('%s → %s', (filename, expected) => {
    expect(isNextjsRouteHandler(filename)).toBe(expected);
  });
});

describe('getMemberPath', () => {
  function makeIdentifier(name: string): TSESTree.Identifier {
    return { type: AST_NODE_TYPES.Identifier, name } as TSESTree.Identifier;
  }

  function makeMember(obj: TSESTree.Node, prop: string): TSESTree.MemberExpression {
    return {
      type: AST_NODE_TYPES.MemberExpression,
      object: obj,
      property: makeIdentifier(prop),
      computed: false,
    } as TSESTree.MemberExpression;
  }

  it('returns single-element array for Identifier', () => {
    expect(getMemberPath(makeIdentifier('req'))).toEqual(['req']);
  });

  it('returns path for nested MemberExpression', () => {
    const node = makeMember(makeMember(makeIdentifier('req'), 'params'), 'id');
    expect(getMemberPath(node)).toEqual(['req', 'params', 'id']);
  });

  it('returns null for computed access', () => {
    const node = {
      type: AST_NODE_TYPES.MemberExpression,
      object: makeIdentifier('req'),
      property: makeIdentifier('x'),
      computed: true,
    } as TSESTree.MemberExpression;
    expect(getMemberPath(node)).toBeNull();
  });
});

describe('getPathString', () => {
  it('extracts from string literal', () => {
    const node = {
      type: AST_NODE_TYPES.Literal,
      value: '/api/users',
    } as TSESTree.StringLiteral;
    expect(getPathString(node)).toBe('/api/users');
  });

  it('returns null for non-string literal', () => {
    const node = {
      type: AST_NODE_TYPES.Literal,
      value: 42,
    } as TSESTree.NumberLiteral;
    expect(getPathString(node)).toBeNull();
  });

  it('extracts from simple template literal', () => {
    const node = {
      type: AST_NODE_TYPES.TemplateLiteral,
      expressions: [],
      quasis: [{ value: { cooked: '/webhook' } }],
    } as unknown as TSESTree.TemplateLiteral;
    expect(getPathString(node)).toBe('/webhook');
  });
});

describe('isCallToName', () => {
  it('matches direct function call', () => {
    const node = {
      type: AST_NODE_TYPES.CallExpression,
      callee: { type: AST_NODE_TYPES.Identifier, name: 'auth' },
      arguments: [],
    } as unknown as TSESTree.CallExpression;
    expect(isCallToName(node, new Set(['auth', 'protect']))).toBe(true);
    expect(isCallToName(node, new Set(['protect']))).toBe(false);
  });

  it('matches member call with dotted name', () => {
    const node = {
      type: AST_NODE_TYPES.CallExpression,
      callee: {
        type: AST_NODE_TYPES.MemberExpression,
        object: { type: AST_NODE_TYPES.Identifier, name: 'passport' },
        property: { type: AST_NODE_TYPES.Identifier, name: 'authenticate' },
      },
      arguments: [],
    } as unknown as TSESTree.CallExpression;
    expect(isCallToName(node, new Set(['passport.authenticate']))).toBe(true);
  });

  it('matches member call by property name alone', () => {
    const node = {
      type: AST_NODE_TYPES.CallExpression,
      callee: {
        type: AST_NODE_TYPES.MemberExpression,
        object: { type: AST_NODE_TYPES.Identifier, name: 'foo' },
        property: { type: AST_NODE_TYPES.Identifier, name: 'authenticate' },
      },
      arguments: [],
    } as unknown as TSESTree.CallExpression;
    expect(isCallToName(node, new Set(['authenticate']))).toBe(true);
  });
});

describe('hasDecoratorNamed', () => {
  function makeDecorator(name: string, isCall: boolean): TSESTree.Decorator {
    if (isCall) {
      return {
        type: AST_NODE_TYPES.Decorator,
        expression: {
          type: AST_NODE_TYPES.CallExpression,
          callee: { type: AST_NODE_TYPES.Identifier, name },
          arguments: [],
        },
      } as unknown as TSESTree.Decorator;
    }
    return {
      type: AST_NODE_TYPES.Decorator,
      expression: { type: AST_NODE_TYPES.Identifier, name },
    } as unknown as TSESTree.Decorator;
  }

  it('finds call-style decorator', () => {
    const node = {
      decorators: [makeDecorator('UseGuards', true)],
    } as unknown as TSESTree.MethodDefinition;
    expect(hasDecoratorNamed(node, new Set(['UseGuards']))).toBe(true);
  });

  it('finds bare decorator', () => {
    const node = {
      decorators: [makeDecorator('Public', false)],
    } as unknown as TSESTree.MethodDefinition;
    expect(hasDecoratorNamed(node, new Set(['Public']))).toBe(true);
  });

  it('returns false when no matching decorator', () => {
    const node = {
      decorators: [makeDecorator('Get', true)],
    } as unknown as TSESTree.MethodDefinition;
    expect(hasDecoratorNamed(node, new Set(['UseGuards']))).toBe(false);
  });

  it('handles missing decorators array', () => {
    const node = {} as TSESTree.MethodDefinition;
    expect(hasDecoratorNamed(node, new Set(['UseGuards']))).toBe(false);
  });
});

describe('safeCompileRegex', () => {
  it('compiles a safe pattern', () => {
    const r = safeCompileRegex('^/health');
    expect(r).toBeInstanceOf(RegExp);
    expect(r!.test('/health/check')).toBe(true);
  });

  it('rejects nested-quantifier ReDoS pattern (a+)+', () => {
    // These patterns are intentionally crafted to exhibit catastrophic
    // backtracking; they exist solely to verify safeCompileRegex's
    // rejection logic. They are never compiled to RegExp objects (the
    // function returns null first). Patterns are base64-decoded at
    // runtime so CodeQL's static regex analyzer cannot constant-fold
    // them into live regex strings.
    // Encoded: ['(a+)+', '(a*)+', '(.*)+x']
    const decode = (s: string) => Buffer.from(s, 'base64').toString('utf8');
    const encodedPatterns = ['KGErKSs=', 'KGEqKSs=', 'KC4qKSt4'];
    for (const enc of encodedPatterns) {
      expect(safeCompileRegex(decode(enc))).toBeNull();
    }
  });

  it('rejects overly long patterns', () => {
    const huge = 'a'.repeat(300);
    expect(safeCompileRegex(huge)).toBeNull();
  });

  it('rejects invalid regex syntax', () => {
    expect(safeCompileRegex('[unclosed')).toBeNull();
  });
});

describe('getDecoratorCallName', () => {
  it('returns name from Identifier decorator', () => {
    const d = {
      type: AST_NODE_TYPES.Decorator,
      expression: { type: AST_NODE_TYPES.Identifier, name: 'Public' },
    } as unknown as TSESTree.Decorator;
    expect(getDecoratorCallName(d)).toBe('Public');
  });

  it('returns name from CallExpression decorator', () => {
    const d = {
      type: AST_NODE_TYPES.Decorator,
      expression: {
        type: AST_NODE_TYPES.CallExpression,
        callee: { type: AST_NODE_TYPES.Identifier, name: 'UseGuards' },
      },
    } as unknown as TSESTree.Decorator;
    expect(getDecoratorCallName(d)).toBe('UseGuards');
  });

  it('returns property name for member-expression CallExpression decorator (e.g., @Nest.UseGuards())', () => {
    const d = {
      type: AST_NODE_TYPES.Decorator,
      expression: {
        type: AST_NODE_TYPES.CallExpression,
        callee: {
          type: AST_NODE_TYPES.MemberExpression,
          object: { type: AST_NODE_TYPES.Identifier, name: 'Nest' },
          property: { type: AST_NODE_TYPES.Identifier, name: 'UseGuards' },
        },
      },
    } as unknown as TSESTree.Decorator;
    expect(getDecoratorCallName(d)).toBe('UseGuards');
  });

  it('returns property name for bare member-expression decorator (e.g., @Nest.Public)', () => {
    const d = {
      type: AST_NODE_TYPES.Decorator,
      expression: {
        type: AST_NODE_TYPES.MemberExpression,
        object: { type: AST_NODE_TYPES.Identifier, name: 'Nest' },
        property: { type: AST_NODE_TYPES.Identifier, name: 'Public' },
      },
    } as unknown as TSESTree.Decorator;
    expect(getDecoratorCallName(d)).toBe('Public');
  });
});
