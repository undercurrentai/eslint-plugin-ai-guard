import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import {
  buildImportMap,
  getMemberPath,
  getPathString,
  hasImport,
  AST_SKIP_KEYS,
  isASTNode,
  type ImportMap,
} from '../../utils/framework-detectors';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`,
);

const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

const DEFAULT_AUTHZ_HELPERS = new Set([
  'authorize', 'authorise', 'checkOwnership', 'ensureOwner', 'isOwner',
  'canAccess', 'canModify', 'hasAccess', 'checkPermission', 'checkPermissions',
]);

const CASL_METHODS = new Set(['can', 'cannot', 'throwUnlessCan']);
const CASL_MODULES = new Set(['@casl/ability']);

const CASBIN_METHODS = new Set(['enforce', 'enforceSync']);
const CASBIN_MODULES = new Set(['casbin']);

const CERBOS_METHODS = new Set(['checkResource', 'checkResources', 'isAllowed']);
const CERBOS_MODULES = new Set(['@cerbos/grpc', '@cerbos/http', '@cerbos/core']);

const PERMIT_METHODS = new Set(['check']);
const PERMIT_MODULES = new Set(['permitio']);

type Options = [{
  authzHelperNames?: string[];
}];

function isRouteRegistration(node: TSESTree.CallExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
  if (!ROUTE_METHODS.has(node.callee.property.name)) return false;
  // Accept any object identifier — authz check is conservative anyway (only fires
  // on routes with :id params AND resource access). Restricting to specific names
  // here would be inconsistent with the auth rule's broader detection.
  return true;
}

function hasPathPrefix(path: string[] | null, prefix: readonly string[]): boolean {
  if (!path || path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

const REQUEST_NAMES = ['req', 'request'] as const;
const RESOURCE_FIELDS = ['params', 'body', 'query'] as const;

function isLikelyResourceIdPath(path: string[] | null): boolean {
  if (!path || path.length < 3) return false;
  let matched = false;
  for (const reqName of REQUEST_NAMES) {
    for (const field of RESOURCE_FIELDS) {
      if (hasPathPrefix(path, [reqName, field])) {
        matched = true;
        break;
      }
    }
    if (matched) break;
  }
  if (!matched) return false;
  const last = path[path.length - 1].toLowerCase();
  return last === 'id' || last.endsWith('id');
}

function isReqUserPath(path: string[] | null): boolean {
  return hasPathPrefix(path, ['req', 'user']) || hasPathPrefix(path, ['request', 'user']);
}

export const requireFrameworkAuthz = createRule<Options, 'missingAuthz'>({
  name: 'require-framework-authz',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a visible authorization/ownership check when route handlers access resource identifiers. Supports CASL, Casbin, Cerbos, Permit.io, and custom authz helpers.',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          authzHelperNames: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional function names recognized as authorization checks.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingAuthz:
        'This handler accesses resource identifiers (`{{access}}`) but has no visible authorization check. Add an ownership guard, policy check (CASL, Casbin, Cerbos), or configure `authzHelperNames`.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const customHelpers = new Set(options.authzHelperNames ?? []);
    const allHelpers = new Set([...DEFAULT_AUTHZ_HELPERS, ...customHelpers]);

    let importMap: ImportMap | null = null;
    let hasCasl = false;
    let hasCasbin = false;
    let hasCerbos = false;
    let hasPermit = false;

    function getImports() {
      if (importMap) return;
      importMap = buildImportMap(context.sourceCode);
      for (const mod of CASL_MODULES) { if (hasImport(importMap, mod)) hasCasl = true; }
      for (const mod of CASBIN_MODULES) { if (hasImport(importMap, mod)) hasCasbin = true; }
      for (const mod of CERBOS_MODULES) { if (hasImport(importMap, mod)) hasCerbos = true; }
      for (const mod of PERMIT_MODULES) { if (hasImport(importMap, mod)) hasPermit = true; }
    }

    function hasAuthzCall(body: TSESTree.BlockStatement): boolean {
      return walkForAuthz(body, new WeakSet());
    }

    function walkForAuthz(node: TSESTree.Node, seen: WeakSet<object>): boolean {
      if (seen.has(node)) return false;
      seen.add(node);
      if (node.type === AST_NODE_TYPES.CallExpression) {
        // Direct helper calls
        if (node.callee.type === AST_NODE_TYPES.Identifier && allHelpers.has(node.callee.name)) {
          return true;
        }
        // Member calls: obj.method()
        if (
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          const method = node.callee.property.name;
          if (allHelpers.has(method)) return true;
          if (hasCasl && CASL_METHODS.has(method)) return true;
          if (hasCasbin && CASBIN_METHODS.has(method)) return true;
          if (hasCerbos && CERBOS_METHODS.has(method)) return true;
          if (hasPermit && PERMIT_METHODS.has(method)) return true;
        }
      }

      // Ownership comparison: req.user.id === req.params.id
      if (
        node.type === AST_NODE_TYPES.BinaryExpression &&
        ['===', '==', '!==', '!='].includes(node.operator)
      ) {
        const leftPath = getMemberPath(node.left);
        const rightPath = getMemberPath(node.right);
        const leftIsUser = isReqUserPath(leftPath);
        const rightIsUser = isReqUserPath(rightPath);
        const leftIsResource = isLikelyResourceIdPath(leftPath);
        const rightIsResource = isLikelyResourceIdPath(rightPath);
        if ((leftIsUser && rightIsResource) || (rightIsUser && leftIsResource)) {
          return true;
        }
      }

      for (const key of Object.keys(node)) {
        if (AST_SKIP_KEYS.has(key)) continue;
        const value = (node as unknown as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            if (isASTNode(child) && walkForAuthz(child, seen)) return true;
          }
        } else if (isASTNode(value)) {
          if (walkForAuthz(value, seen)) return true;
        }
      }
      return false;
    }

    function findResourceAccess(body: TSESTree.BlockStatement): string | null {
      return walkForResourceAccess(body, new WeakSet());
    }

    function walkForResourceAccess(node: TSESTree.Node, seen: WeakSet<object>): string | null {
      if (seen.has(node)) return null;
      seen.add(node);
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        const path = getMemberPath(node);
        if (isLikelyResourceIdPath(path)) {
          return path!.join('.');
        }
      }
      for (const key of Object.keys(node)) {
        if (AST_SKIP_KEYS.has(key)) continue;
        const value = (node as unknown as Record<string, unknown>)[key];
        if (Array.isArray(value)) {
          for (const child of value) {
            if (isASTNode(child)) {
              const found = walkForResourceAccess(child, seen);
              if (found) return found;
            }
          }
        } else if (isASTNode(value)) {
          const found = walkForResourceAccess(value, seen);
          if (found) return found;
        }
      }
      return null;
    }

    return {
      CallExpression(node) {
        getImports();
        if (!isRouteRegistration(node)) return;

        const routePath =
          node.arguments[0] ? getPathString(node.arguments[0]) : null;
        const hasRouteIdParam =
          typeof routePath === 'string' && routePath.includes(':');

        for (const arg of node.arguments) {
          if (
            arg.type !== AST_NODE_TYPES.FunctionExpression &&
            arg.type !== AST_NODE_TYPES.ArrowFunctionExpression
          ) {
            continue;
          }
          if (arg.body.type !== AST_NODE_TYPES.BlockStatement) continue;

          const resourceAccess = findResourceAccess(arg.body);
          const isSensitive = hasRouteIdParam && resourceAccess !== null;

          if (isSensitive && !hasAuthzCall(arg.body)) {
            context.report({
              node: arg,
              messageId: 'missingAuthz',
              data: { access: resourceAccess! },
            });
          }
        }
      },
    };
  },
});

export default requireFrameworkAuthz;
