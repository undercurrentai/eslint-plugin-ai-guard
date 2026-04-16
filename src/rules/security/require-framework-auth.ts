import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import {
  buildImportMap,
  detectFramework,
  hasDecoratorNamed,
  getDecoratorCallName,
  getPathString,
  isCallToName,
  bodyContainsCallTo,
  hasImport,
  safeCompileRegex,
  unwrapTSExpression,
  type ImportMap,
  type FrameworkKind,
} from '../../utils/framework-detectors';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`,
);

const HTTP_METHODS = new Set([
  'get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head',
]);

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

const NEXTJS_EXPORT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE', 'GET']);

const DEFAULT_AUTH_NAMES = new Set([
  'authenticate', 'requireAuth', 'isAuthenticated', 'verifyToken', 'protect',
  'authorized', 'authorize', 'isAdmin', 'ensureAuthenticated', 'ensureLoggedIn',
  'auth', 'authMiddleware', 'requireLogin', 'checkAuth', 'validateToken',
  'passport.authenticate', 'jwt', 'requireSession',
  'clerkMiddleware', 'withAuth', 'requireAuthentication',
]);

const DEFAULT_NEXTJS_AUTH_CALLERS = new Set([
  'auth', 'auth.protect', 'currentUser', 'getServerSession',
  'getToken', 'verifySession', 'getUser', 'supabase.auth.getUser',
]);

const DEFAULT_SKIP_DECORATORS = new Set([
  'Public', 'SkipAuth', 'AllowAnonymous', 'NoAuth',
]);

const NESTJS_HTTP_DECORATORS = new Set([
  'Get', 'Post', 'Put', 'Patch', 'Delete', 'All', 'Options', 'Head',
]);

const NESTJS_MUTATING_DECORATORS = new Set(['Post', 'Put', 'Patch', 'Delete']);

// Anchored with `(\/|$)` so /^\/auth/ does not match /authentication-token,
// /^\/register/ does not match /registry/items, etc. (audit M2)
const DEFAULT_PUBLIC_ROUTE_PATTERNS = [
  /^\/?$/,
  /^\*$/,
  /^\/\*$/,
  /^\/health(\/|$)/,
  /^\/healthz(\/|$)/,
  /^\/ping(\/|$)/,
  /^\/status(\/|$)/,
  /^\/api\/v\d+\/auth(\/|$)/,
  /^\/auth(\/|$)/,
  /^\/login(\/|$)/,
  /^\/register(\/|$)/,
  /^\/signup(\/|$)/,
  /^\/forgot(\/|$)/,
  /^\/reset(\/|$)/,
  /^\/public(\/|$)/,
  /^\/assets(\/|$)/,
  /^\/static(\/|$)/,
  /^\/favicon(\/|$|\.)/,
  /^\/robots(\/|$|\.)/,
  /^\/sitemap(\/|$|\.)/,
  /^\/\.well-known(\/|$)/,
];

const HONO_AUTH_MODULES = new Set([
  'hono/basic-auth', 'hono/bearer-auth', 'hono/jwt',
]);

type Options = [{
  knownAuthCallers?: string[];
  publicRoutePatterns?: string[];
  skipDecorators?: string[];
  assumeGlobalAuth?: boolean;
  mutatingOnly?: boolean;
}];

export const requireFrameworkAuth = createRule<Options, 'missingAuth' | 'missingAuthNextjs' | 'missingAuthNestjs'>({
  name: 'require-framework-auth',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require authentication on route handlers across Express, Fastify, Hono, NestJS, and Next.js App Router. Detects missing auth middleware, guards, or imperative auth calls.',
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          knownAuthCallers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional function/middleware names recognized as auth checks.',
          },
          publicRoutePatterns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Regex patterns for routes that should not require auth.',
          },
          skipDecorators: {
            type: 'array',
            items: { type: 'string' },
            description: 'NestJS decorator names that mark a handler as public.',
          },
          assumeGlobalAuth: {
            type: 'boolean',
            description: 'If true, suppresses reports when global auth may exist.',
          },
          mutatingOnly: {
            type: 'boolean',
            description: 'If true, only check POST/PUT/PATCH/DELETE routes.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingAuth:
        'Route handler `{{method}} {{path}}` has no visible authentication check. Add auth middleware or configure `knownAuthCallers`.',
      missingAuthNextjs:
        'Exported `{{method}}` handler in App Router route file has no visible auth call. Add an auth check (e.g., `auth()`, `getServerSession()`) or configure `knownAuthCallers`.',
      missingAuthNestjs:
        'Method `{{method}}` in `@Controller` class has no `@UseGuards` decorator. Add `@UseGuards(AuthGuard)` at method or class level, or mark with `@Public()`.',
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const customAuthNames = new Set(options.knownAuthCallers ?? []);
    const allAuthNames = new Set([...DEFAULT_AUTH_NAMES, ...customAuthNames]);
    const allNextjsCallers = new Set([...DEFAULT_NEXTJS_AUTH_CALLERS, ...customAuthNames]);
    const skipDecoratorNames = new Set([
      ...DEFAULT_SKIP_DECORATORS,
      ...(options.skipDecorators ?? []),
    ]);
    const assumeGlobalAuth = options.assumeGlobalAuth ?? false;
    const mutatingOnly = options.mutatingOnly ?? false;

    const userPublicPatterns = (options.publicRoutePatterns ?? [])
      .map((p) => safeCompileRegex(p))
      .filter((r): r is RegExp => r !== null);
    const allPublicPatterns = [...DEFAULT_PUBLIC_ROUTE_PATTERNS, ...userPublicPatterns];

    let importMap: ImportMap | null = null;
    let framework: FrameworkKind | null = null;
    let hasBlanketAuth = false;
    let hasHonoAuthImport = false;

    function getImportMap() {
      if (!importMap) {
        importMap = buildImportMap(context.sourceCode);
        framework = detectFramework(importMap, context.filename);
        for (const mod of HONO_AUTH_MODULES) {
          if (hasImport(importMap, mod)) {
            hasHonoAuthImport = true;
            break;
          }
        }
      }
      return importMap;
    }

    function isPublicRoute(path: string): boolean {
      return allPublicPatterns.some((p) => p.test(path));
    }

    function isAuthMiddleware(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        return allAuthNames.has(node.name);
      }
      if (node.type === AST_NODE_TYPES.CallExpression) {
        return isCallToName(node, allAuthNames);
      }
      return false;
    }

    function isRouteDefinition(node: TSESTree.CallExpression): boolean {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return false;
      if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return false;
      const methodName = node.callee.property.name;
      if (!HTTP_METHODS.has(methodName)) return false;
      if (mutatingOnly && !MUTATING_METHODS.has(methodName)) return false;

      // Unwrap TS-only wrappers so `(app as Application).get(...)` is treated
      // the same as `app.get(...)`. AI-generated TS code commonly emits these.
      const obj = unwrapTSExpression(node.callee.object);
      if (obj.type === AST_NODE_TYPES.Identifier) {
        const name = obj.name.toLowerCase();
        if (name === 'router' || name === 'app' || name === 'fastify' || name === 'server' || name.includes('router')) {
          return true;
        }
        // Accept any local that was imported from a known framework module
        if (importMap) {
          const sourceMod = importMap.locals.get(obj.name);
          if (sourceMod && (sourceMod === 'express' || sourceMod === 'fastify' || sourceMod === 'hono')) {
            return true;
          }
        }
        return false;
      }
      if (obj.type === AST_NODE_TYPES.CallExpression) return true;
      return false;
    }

    function checkBlanketAuth(node: TSESTree.CallExpression): void {
      if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return;
      if (node.callee.property.type !== AST_NODE_TYPES.Identifier) return;
      const propName = node.callee.property.name;

      // Express/Hono: router.use(auth) or app.use(auth)
      if (propName === 'use') {
        if (node.arguments.some((arg) => isAuthMiddleware(arg))) {
          hasBlanketAuth = true;
        }
        return;
      }

      // Fastify: fastify.addHook('preHandler', auth) or ('onRequest', auth)
      if (propName === 'addHook' && node.arguments.length >= 2) {
        const hookName = node.arguments[0];
        if (
          hookName.type === AST_NODE_TYPES.Literal &&
          typeof hookName.value === 'string' &&
          (hookName.value === 'preHandler' || hookName.value === 'onRequest')
        ) {
          if (node.arguments.slice(1).some((arg) => isAuthMiddleware(arg))) {
            hasBlanketAuth = true;
          }
        }
      }
    }

    function checkFastifyRouteOptions(
      node: TSESTree.CallExpression,
      _methodName: string,
    ): boolean {
      // fastify.METHOD(path, { preHandler: [...] }, handler)
      // or fastify.route({ method, url, preHandler: [...], handler })
      for (const arg of node.arguments) {
        if (arg.type !== AST_NODE_TYPES.ObjectExpression) continue;
        for (const prop of arg.properties) {
          if (prop.type !== AST_NODE_TYPES.Property) continue;
          if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;
          if (prop.key.name !== 'preHandler' && prop.key.name !== 'onRequest') continue;

          if (prop.value.type === AST_NODE_TYPES.ArrayExpression) {
            if (prop.value.elements.some((el) => el && isAuthMiddleware(el))) {
              return true;
            }
          }
          if (isAuthMiddleware(prop.value)) return true;
        }
      }
      return false;
    }

    function checkHonoOnRoute(node: TSESTree.CallExpression): void {
      // app.on(method | method[], path, ...handlers)
      const args = node.arguments;
      if (args.length < 3) return;

      const methodArg = args[0];
      let methodLabel = '';
      let isMutating = false;

      const recordMethod = (s: string) => {
        const lower = s.toLowerCase();
        if (MUTATING_METHODS.has(lower)) isMutating = true;
        methodLabel = methodLabel ? `${methodLabel}|${s.toUpperCase()}` : s.toUpperCase();
      };

      if (methodArg.type === AST_NODE_TYPES.Literal && typeof methodArg.value === 'string') {
        recordMethod(methodArg.value);
      } else if (methodArg.type === AST_NODE_TYPES.ArrayExpression) {
        for (const el of methodArg.elements) {
          if (el && el.type === AST_NODE_TYPES.Literal && typeof el.value === 'string') {
            recordMethod(el.value);
          }
        }
      } else {
        // Dynamic method — assume worst case (mutating) so we still check
        isMutating = true;
        methodLabel = '<dynamic>';
      }

      if (mutatingOnly && !isMutating) return;

      const pathStr = getPathString(args[1]);
      if (pathStr && isPublicRoute(pathStr)) return;

      const middlewareArgs = args.slice(2, -1);
      if (middlewareArgs.some((arg) => isAuthMiddleware(arg))) return;

      context.report({
        node,
        messageId: 'missingAuth',
        data: { method: methodLabel || 'ON', path: pathStr || '<dynamic>' },
      });
    }

    function checkExpressHonoRoute(node: TSESTree.CallExpression): void {
      const callee = node.callee as TSESTree.MemberExpression;
      const method = (callee.property as TSESTree.Identifier).name;
      const args = node.arguments;

      // Express chained route form: router.route('/x').post(auth, handler)
      // Path is inside the inner .route() call; args here are [...middleware, handler] only.
      const obj = unwrapTSExpression(callee.object);
      if (
        obj.type === AST_NODE_TYPES.CallExpression &&
        obj.callee.type === AST_NODE_TYPES.MemberExpression &&
        obj.callee.property.type === AST_NODE_TYPES.Identifier &&
        obj.callee.property.name === 'route'
      ) {
        const inheritedPath = obj.arguments[0]
          ? getPathString(obj.arguments[0])
          : null;
        if (inheritedPath && isPublicRoute(inheritedPath)) return;
        // For chained form, all args are middleware + final handler (no path arg)
        const middlewareArgs = args.slice(0, -1);
        if (args.length === 0) return; // .post() with no handler — invalid syntax, skip
        if (args.length === 1) {
          // Only handler, no middleware
          context.report({
            node,
            messageId: 'missingAuth',
            data: { method: method.toUpperCase(), path: inheritedPath || '<dynamic>' },
          });
          return;
        }
        if (!middlewareArgs.some((arg) => isAuthMiddleware(arg))) {
          context.report({
            node,
            messageId: 'missingAuth',
            data: { method: method.toUpperCase(), path: inheritedPath || '<dynamic>' },
          });
        }
        return;
      }

      if (args.length < 2) return;

      const pathStr = getPathString(args[0]);
      if (pathStr && isPublicRoute(pathStr)) return;

      // Check variadic middleware args (all args between path and last handler)
      const middlewareArgs = args.slice(1, -1);
      if (middlewareArgs.length === 0 && args.length === 2) {
        // Hono: check if any auth middleware was imported
        if (hasHonoAuthImport) return;
        context.report({
          node,
          messageId: 'missingAuth',
          data: { method: method.toUpperCase(), path: pathStr || '<dynamic>' },
        });
        return;
      }

      if (!middlewareArgs.some((arg) => isAuthMiddleware(arg))) {
        context.report({
          node,
          messageId: 'missingAuth',
          data: { method: method.toUpperCase(), path: pathStr || '<dynamic>' },
        });
      }
    }

    function checkFastifyRoute(node: TSESTree.CallExpression): void {
      const callee = node.callee as TSESTree.MemberExpression;
      const method = (callee.property as TSESTree.Identifier).name;
      const args = node.arguments;
      if (args.length < 1) return;

      // fastify.route({ method, url, preHandler, handler })
      if (method === 'route') {
        const optsArg = args[0];
        if (optsArg.type === AST_NODE_TYPES.ObjectExpression) {
          let routeMethod = '';
          let routeUrl = '';
          for (const prop of optsArg.properties) {
            if (prop.type !== AST_NODE_TYPES.Property) continue;
            if (prop.key.type !== AST_NODE_TYPES.Identifier) continue;
            if (prop.key.name === 'method' && prop.value.type === AST_NODE_TYPES.Literal) {
              routeMethod = String(prop.value.value).toUpperCase();
            }
            if (prop.key.name === 'url') {
              routeUrl = getPathString(prop.value) || '<dynamic>';
            }
          }
          if (routeUrl && isPublicRoute(routeUrl)) return;
          if (mutatingOnly && !MUTATING_METHODS.has(routeMethod.toLowerCase())) return;
          if (!checkFastifyRouteOptions(node, routeMethod)) {
            context.report({
              node,
              messageId: 'missingAuth',
              data: { method: routeMethod || 'ROUTE', path: routeUrl || '<dynamic>' },
            });
          }
        }
        return;
      }

      // fastify.METHOD(path, [opts], handler)
      if (args.length < 2) return;
      const pathStr = getPathString(args[0]);
      if (pathStr && isPublicRoute(pathStr)) return;

      if (checkFastifyRouteOptions(node, method)) return;

      // Check variadic middleware (same pattern as Express for compat)
      const middlewareArgs = args.slice(1, -1);
      if (middlewareArgs.some((arg) => isAuthMiddleware(arg))) return;

      context.report({
        node,
        messageId: 'missingAuth',
        data: { method: method.toUpperCase(), path: pathStr || '<dynamic>' },
      });
    }

    return {
      CallExpression(node) {
        getImportMap();
        if (assumeGlobalAuth) return;
        if (framework === 'nestjs' || framework === 'nextjs-app-router') return;

        checkBlanketAuth(node);
        if (hasBlanketAuth) return;

        // Hono multi-method form: app.on(['POST','PUT'], path, ...handlers)
        // or app.on('GET', path, ...handlers). Method is in arg 0, path is arg 1.
        if (
          framework === 'hono' &&
          node.callee.type === AST_NODE_TYPES.MemberExpression &&
          node.callee.property.type === AST_NODE_TYPES.Identifier &&
          node.callee.property.name === 'on'
        ) {
          checkHonoOnRoute(node);
          return;
        }

        if (!isRouteDefinition(node)) return;

        if (framework === 'fastify') {
          checkFastifyRoute(node);
        } else {
          checkExpressHonoRoute(node);
        }
      },

      ClassDeclaration(node) {
        getImportMap();
        if (framework !== 'nestjs') return;
        if (assumeGlobalAuth) return;
        if (!hasDecoratorNamed(node, new Set(['Controller']))) return;

        const classHasGuards = hasDecoratorNamed(node, new Set(['UseGuards']));

        for (const member of node.body.body) {
          if (member.type !== AST_NODE_TYPES.MethodDefinition) continue;
          if (member.kind !== 'method') continue;
          // NestJS doesn't dispatch HTTP requests to static methods. Skip
          // them to avoid over-reports on legal but non-routable members.
          if (member.static) continue;

          const httpDecorators = member.decorators?.filter((d) => {
            const name = getDecoratorCallName(d);
            return name !== null && NESTJS_HTTP_DECORATORS.has(name);
          }) ?? [];

          if (httpDecorators.length === 0) continue;

          const httpDecName = getDecoratorCallName(httpDecorators[0]) ?? 'unknown';

          if (mutatingOnly && !NESTJS_MUTATING_DECORATORS.has(httpDecName)) continue;
          if (hasDecoratorNamed(member, skipDecoratorNames)) continue;
          if (classHasGuards) continue;
          if (hasDecoratorNamed(member, new Set(['UseGuards']))) continue;

          const methodName = member.key.type === AST_NODE_TYPES.Identifier
            ? member.key.name
            : '<computed>';

          context.report({
            node: member,
            messageId: 'missingAuthNestjs',
            data: { method: methodName },
          });
        }
      },

      ExportNamedDeclaration(node) {
        getImportMap();
        if (framework !== 'nextjs-app-router') return;
        if (assumeGlobalAuth) return;

        const decl = node.declaration;
        if (!decl) return;

        if (
          decl.type === AST_NODE_TYPES.FunctionDeclaration &&
          decl.id &&
          NEXTJS_EXPORT_METHODS.has(decl.id.name)
        ) {
          const method = decl.id.name;
          if (mutatingOnly && method === 'GET') return;
          if (decl.body && !bodyContainsCallTo(decl.body, allNextjsCallers)) {
            context.report({
              node: decl,
              messageId: 'missingAuthNextjs',
              data: { method },
            });
          }
        }

        if (decl.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of decl.declarations) {
            if (
              declarator.id.type === AST_NODE_TYPES.Identifier &&
              NEXTJS_EXPORT_METHODS.has(declarator.id.name) &&
              declarator.init
            ) {
              const method = declarator.id.name;
              if (mutatingOnly && method === 'GET') continue;
              const init = declarator.init;
              if (
                (init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
                  init.type === AST_NODE_TYPES.FunctionExpression) &&
                init.body.type === AST_NODE_TYPES.BlockStatement
              ) {
                if (!bodyContainsCallTo(init.body, allNextjsCallers)) {
                  context.report({
                    node: declarator,
                    messageId: 'missingAuthNextjs',
                    data: { method },
                  });
                }
              }
            }
          }
        }
      },
    };
  },
});

export default requireFrameworkAuth;
