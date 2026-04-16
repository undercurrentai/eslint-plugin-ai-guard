import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree, TSESLint } from '@typescript-eslint/utils';

export type FrameworkKind =
  | 'express'
  | 'fastify'
  | 'hono'
  | 'nestjs'
  | 'nextjs-app-router'
  | 'unknown';

export interface ImportMap {
  modules: Map<string, Set<string>>;
  locals: Map<string, string>;
}

const FRAMEWORK_MODULES: Record<string, FrameworkKind> = {
  express: 'express',
  fastify: 'fastify',
  hono: 'hono',
  '@nestjs/common': 'nestjs',
  '@nestjs/core': 'nestjs',
};

// Match Next.js App Router route handlers. Allows top-level `app/route.ts`
// (root catch-all) by using `.*` instead of `.+` (audit M9).
const NEXTJS_ROUTE_PATTERN = /[/\\]app[/\\](.*[/\\])?route\.(ts|tsx|js|jsx)$/;

export function buildImportMap(
  sourceCode: TSESLint.SourceCode,
): ImportMap {
  const modules = new Map<string, Set<string>>();
  const locals = new Map<string, string>();

  for (const node of sourceCode.ast.body) {
    if (node.type !== AST_NODE_TYPES.ImportDeclaration) continue;
    const mod = node.source.value;
    if (!modules.has(mod)) {
      modules.set(mod, new Set());
    }
    const names = modules.get(mod)!;
    for (const spec of node.specifiers) {
      switch (spec.type) {
        case AST_NODE_TYPES.ImportDefaultSpecifier:
          names.add('default');
          locals.set(spec.local.name, mod);
          break;
        case AST_NODE_TYPES.ImportSpecifier:
          names.add(spec.imported.type === AST_NODE_TYPES.Identifier
            ? spec.imported.name
            : spec.imported.value);
          locals.set(spec.local.name, mod);
          break;
        case AST_NODE_TYPES.ImportNamespaceSpecifier:
          names.add('*');
          locals.set(spec.local.name, mod);
          break;
      }
    }
  }

  return { modules, locals };
}

export function detectFramework(
  importMap: ImportMap,
  filename: string,
): FrameworkKind {
  for (const [mod, kind] of Object.entries(FRAMEWORK_MODULES)) {
    if (importMap.modules.has(mod)) return kind;
  }
  if (isNextjsRouteHandler(filename)) return 'nextjs-app-router';
  return 'unknown';
}

export function isNextjsRouteHandler(filename: string): boolean {
  return NEXTJS_ROUTE_PATTERN.test(filename);
}

export function hasImport(importMap: ImportMap, moduleName: string): boolean {
  return importMap.modules.has(moduleName);
}

export function localComesFrom(
  importMap: ImportMap,
  localName: string,
  moduleName: string,
): boolean {
  return importMap.locals.get(localName) === moduleName;
}

export function hasDecoratorNamed(
  node: TSESTree.ClassDeclaration | TSESTree.MethodDefinition,
  names: Set<string>,
): boolean {
  const decorators = node.decorators;
  if (!decorators) return false;
  return decorators.some((d) => {
    const name = getDecoratorCallName(d);
    return name !== null && names.has(name);
  });
}

export function getDecoratorCallName(decorator: TSESTree.Decorator): string | null {
  const expr = decorator.expression;
  // @Public
  if (expr.type === AST_NODE_TYPES.Identifier) {
    return expr.name;
  }
  // @Foo.Public — bare member access
  if (
    expr.type === AST_NODE_TYPES.MemberExpression &&
    expr.property.type === AST_NODE_TYPES.Identifier
  ) {
    return expr.property.name;
  }
  if (expr.type === AST_NODE_TYPES.CallExpression) {
    // @UseGuards(...)
    if (expr.callee.type === AST_NODE_TYPES.Identifier) {
      return expr.callee.name;
    }
    // @Common.Get(...) or @Some.UseGuards(...)
    if (
      expr.callee.type === AST_NODE_TYPES.MemberExpression &&
      expr.callee.property.type === AST_NODE_TYPES.Identifier
    ) {
      return expr.callee.property.name;
    }
  }
  return null;
}

export function getMemberPath(node: TSESTree.Node): string[] | null {
  // Unwrap TS-only wrapper expressions (`req!.id`, `(req as Req).id`, `<Req>req.id`,
  // `req satisfies Req`) so authz/resource-access comparisons in AI-generated TS
  // code are traced to the underlying member path.
  const unwrapped = unwrapTSExpression(node);
  if (unwrapped.type === AST_NODE_TYPES.Identifier) {
    return [unwrapped.name];
  }
  if (unwrapped.type !== AST_NODE_TYPES.MemberExpression || unwrapped.computed) {
    return null;
  }
  const objectPath = getMemberPath(unwrapped.object);
  if (!objectPath) return null;
  if (unwrapped.property.type !== AST_NODE_TYPES.Identifier) return null;
  return [...objectPath, unwrapped.property.name];
}

export function getPathString(node: TSESTree.Node): string | null {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    if (node.expressions.length === 0 && node.quasis.length === 1) {
      return node.quasis[0].value.cooked ?? null;
    }
    if (node.quasis.length > 0) {
      const first = node.quasis[0].value.cooked ?? null;
      // Dynamic templates such as `/${base}/admin` previously collapsed to `/`
      // and matched the default public-root pattern, skipping auth checks.
      if (first === '' || first === '/') return null;
      return first;
    }
  }
  return null;
}

export function isCallToName(
  node: TSESTree.CallExpression,
  names: Set<string>,
): boolean {
  if (node.callee.type === AST_NODE_TYPES.Identifier) {
    return names.has(node.callee.name);
  }
  if (
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    node.callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    if (names.has(node.callee.property.name)) return true;
    if (node.callee.object.type === AST_NODE_TYPES.Identifier) {
      return names.has(`${node.callee.object.name}.${node.callee.property.name}`);
    }
  }
  return false;
}

export function bodyContainsCallTo(
  body: TSESTree.Node,
  names: Set<string>,
): boolean {
  return walkForCall(body, names);
}

// Skip metadata, parent links, and TypeScript type nodes (which can contain
// CallExpression in TSConditionalType / TSTypeQuery and produce false positives).
export const AST_SKIP_KEYS = new Set([
  'parent', 'loc', 'range',
  'typeAnnotation', 'returnType', 'typeParameters', 'typeArguments',
]);

// Node types to stop descent at. Nested FunctionDeclarations are declared but
// not invoked inline — finding an authz/verification call inside them is a
// false positive (dead code). Arrow functions and function expressions are
// commonly passed as callbacks (await, .then, transaction, etc.) so we DO
// descend into those. This is a pragmatic trade-off; see security audit H1.
export const STOP_DESCENT_NODE_TYPES = new Set([
  AST_NODE_TYPES.FunctionDeclaration,
]);

function walkForCall(
  node: TSESTree.Node,
  names: Set<string>,
  seen: WeakSet<object> = new WeakSet(),
): boolean {
  if (seen.has(node)) return false;
  seen.add(node);

  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    isCallToName(node, names)
  ) {
    return true;
  }

  for (const key of Object.keys(node)) {
    if (AST_SKIP_KEYS.has(key)) continue;
    const value = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isASTNode(child) && !STOP_DESCENT_NODE_TYPES.has(child.type)) {
          if (walkForCall(child, names, seen)) return true;
        }
      }
    } else if (isASTNode(value) && !STOP_DESCENT_NODE_TYPES.has(value.type)) {
      if (walkForCall(value, names, seen)) return true;
    }
  }
  return false;
}

/**
 * Compile a user-supplied regex string with basic safety checks.
 * Rejects patterns that look likely to ReDoS (catastrophic backtracking)
 * to prevent CI hangs from malicious or careless config in shared presets.
 *
 * Heuristic — rejects patterns containing nested quantifiers like `(a+)+` or
 * `(a*)+`, or patterns longer than `maxLength`. Returns null if the pattern
 * is unsafe; otherwise returns the compiled RegExp.
 */
export function safeCompileRegex(pattern: string, maxLength = 200): RegExp | null {
  if (pattern.length > maxLength) return null;
  // Detect nested quantifiers: (...)+/* / (...){n,} immediately following another quantifier
  if (/\([^)]*[+*]\)[+*?{]/.test(pattern)) return null;
  // Detect alternation with shared overlap inside repeated group: (a|a)+
  if (/\(([^|)]+)\|\1\)[+*]/.test(pattern)) return null;
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

/**
 * Unwrap TS-only wrapper nodes that don't change runtime semantics:
 * - `(x as Foo)` — TSAsExpression
 * - `<Foo>x` — TSTypeAssertion
 * - `x!` — TSNonNullExpression
 * - `x satisfies Foo` — TSSatisfiesExpression
 *
 * Used by callee-receiver checks so type-asserted code (`(app as Application).get(...)`)
 * is treated identically to plain `app.get(...)`.
 */
export function unwrapTSExpression(node: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression
  ) {
    current = current.expression;
  }
  return current;
}

export function isASTNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  );
}
