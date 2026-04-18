import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

/**
 * Shared scope-walking helpers for async-rule detection.
 *
 * Used by `no-async-array-callback` (to flag identifier callbacks bound to async
 * functions) and `no-floating-promise` (to detect async callees + whether they
 * have internal catch handling). Both rules previously carried near-identical
 * copies; consolidating here removes ~50 LOC of duplication and ensures future
 * extensions (e.g. transitive aliases) propagate to both.
 */

export interface VariableLike {
  name: string;
  defs?: Array<{ node?: TSESTree.Node }>;
}

export interface ScopeLike {
  upper: ScopeLike | null;
  set?: Map<string, VariableLike>;
  variables?: VariableLike[];
}

export interface AsyncBindingInfo {
  isAsync: boolean;
  hasInternalErrorHandling: boolean;
}

/**
 * Minimal `context` shape accepted by `isIdentifierBoundToAsyncFunction`.
 *
 * Duck-typed to `RuleContext.sourceCode.getScope` so both rules can pass their
 * own fully-typed `context` without type-parameter gymnastics.
 */
export interface AsyncScopeContextLike {
  sourceCode: {
    getScope(node: TSESTree.Node): unknown;
  };
}

export function isAstNode(value: unknown): value is TSESTree.Node {
  return typeof value === 'object' && value !== null && 'type' in value;
}

/**
 * Function-scope boundary types. When `nodeHasCatchClause` encounters one of
 * these as a CHILD of the search node, it stops descent: a try/catch inside a
 * nested function / arrow / method body handles that inner function's errors,
 * not the outer scope's. Without this guard, `no-floating-promise` would treat
 * `async function foo() { setTimeout(() => { try{}catch{} }, 1); fetch('/x'); }`
 * as "foo handles its own errors" and silently allow the floating `fetch`.
 * Mirrors `STOP_DESCENT_NODE_TYPES` in framework-detectors.ts.
 */
const FUNCTION_SCOPE_BOUNDARY_TYPES = new Set<string>([
  AST_NODE_TYPES.FunctionDeclaration,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

/**
 * True when `node` is a catch-handler-bearing TryStatement, or contains one via
 * structural descent within the SAME function scope. Caller must not pass
 * function-bodies they don't own.
 */
export function nodeHasCatchClause(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.TryStatement && !!node.handler) {
    return true;
  }

  for (const [key, value] of Object.entries(node as unknown as Record<string, unknown>)) {
    if (key === 'parent') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (
          isAstNode(item) &&
          !FUNCTION_SCOPE_BOUNDARY_TYPES.has(item.type) &&
          nodeHasCatchClause(item)
        ) {
          return true;
        }
      }
      continue;
    }

    if (
      isAstNode(value) &&
      !FUNCTION_SCOPE_BOUNDARY_TYPES.has(value.type) &&
      nodeHasCatchClause(value)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Boolean async-check: is `node` an async FunctionDeclaration, async function
 * expression/arrow, or a VariableDeclarator whose init is an async
 * function/arrow?
 */
export function isAsyncFunctionLike(node: TSESTree.Node | undefined): boolean {
  if (!node) return false;

  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    return node.async;
  }
  if (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return node.async;
  }
  if (
    node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.init &&
    (node.init.type === AST_NODE_TYPES.FunctionExpression ||
      node.init.type === AST_NODE_TYPES.ArrowFunctionExpression)
  ) {
    return node.init.async;
  }
  return false;
}

/**
 * Richer async-check: same shapes as {@link isAsyncFunctionLike} but also
 * reports whether the body contains a try/catch (used by `no-floating-promise`
 * to skip reporting when the async helper handles its own errors).
 */
export function getAsyncBindingInfo(node: TSESTree.Node | undefined): AsyncBindingInfo {
  if (!node) {
    return { isAsync: false, hasInternalErrorHandling: false };
  }

  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    return {
      isAsync: node.async,
      hasInternalErrorHandling: node.body ? nodeHasCatchClause(node.body) : false,
    };
  }

  if (
    node.type === AST_NODE_TYPES.FunctionExpression ||
    node.type === AST_NODE_TYPES.ArrowFunctionExpression
  ) {
    return {
      isAsync: node.async,
      hasInternalErrorHandling:
        node.body.type === AST_NODE_TYPES.BlockStatement
          ? nodeHasCatchClause(node.body)
          : false,
    };
  }

  if (
    node.type === AST_NODE_TYPES.VariableDeclarator &&
    node.init &&
    (node.init.type === AST_NODE_TYPES.FunctionExpression ||
      node.init.type === AST_NODE_TYPES.ArrowFunctionExpression)
  ) {
    return {
      isAsync: node.init.async,
      hasInternalErrorHandling:
        node.init.body.type === AST_NODE_TYPES.BlockStatement
          ? nodeHasCatchClause(node.init.body)
          : false,
    };
  }

  return { isAsync: false, hasInternalErrorHandling: false };
}

export function findVariableInScope(scope: ScopeLike, name: string): VariableLike | null {
  const fromMap = scope.set?.get(name);
  if (fromMap) {
    return fromMap;
  }

  if (scope.variables) {
    const fromArray = scope.variables.find((v) => v.name === name);
    if (fromArray) {
      return fromArray;
    }
  }

  return null;
}

/**
 * Walk the scope chain from `identifier` upward. If the binding resolves to an
 * async function/arrow (or VariableDeclarator with async init), return its
 * {@link AsyncBindingInfo}; otherwise return a zero value.
 *
 * Limitations (intentional, matching pre-extraction behavior):
 *  - Imported identifiers return `{ isAsync: false }` — no type info.
 *  - Transitive aliases (`const alias = asyncFn`) are not traced.
 */
export function isIdentifierBoundToAsyncFunction(
  identifier: TSESTree.Identifier,
  context: AsyncScopeContextLike,
): AsyncBindingInfo {
  let scope = context.sourceCode.getScope(identifier) as unknown as ScopeLike | null;

  while (scope) {
    const variable = findVariableInScope(scope, identifier.name);
    if (variable) {
      const defs = variable.defs ?? [];
      for (const def of defs) {
        const info = getAsyncBindingInfo(def.node);
        if (info.isAsync) {
          return info;
        }
      }

      if (defs.length === 0 && isAsyncFunctionLike(variable as unknown as TSESTree.Node)) {
        return getAsyncBindingInfo(variable as unknown as TSESTree.Node);
      }

      return { isAsync: false, hasInternalErrorHandling: false };
    }
    scope = scope.upper;
  }

  return { isAsync: false, hasInternalErrorHandling: false };
}
