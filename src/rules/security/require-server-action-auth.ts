import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import { bodyContainsCallTo } from '../../utils/framework-detectors';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`,
);

// Auth/session calls that, if present anywhere in a Server Action body, mark it as
// performing its own verification. Mirrors require-framework-auth's Next.js caller set
// plus the App Router `unauthorized()` / `forbidden()` helpers used inside actions.
const DEFAULT_AUTH_CALLERS = new Set([
  'auth', 'auth.protect', 'currentUser', 'getServerSession',
  'getToken', 'verifySession', 'getUser', 'supabase.auth.getUser',
  'getSession', 'requireUser', 'requireSession', 'requireAuth',
  'unauthorized', 'forbidden',
]);

type Options = [{
  authCallers?: string[];
  assumeMiddlewareAuth?: boolean;
}];

export const requireServerActionAuth = createRule<Options, 'missingServerActionAuth'>({
  name: 'require-server-action-auth',
  meta: {
    type: 'problem',
    docs: {
      description:
        "Require an authentication/authorization check inside Next.js Server Actions ('use server'). Server Actions are POST-reachable independently of the UI, so auth must be verified inside each one — a missing check is an unauthenticated mutation endpoint.",
    },
    fixable: undefined,
    schema: [
      {
        type: 'object',
        properties: {
          authCallers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional function/method names recognized as an auth or session check.',
          },
          assumeMiddlewareAuth: {
            type: 'boolean',
            description:
              'If true, suppress this rule (you attest that a middleware/Data-Access-Layer gate protects all Server Actions). Default false: Next.js middleware most often does i18n/redirects, not auth, and the framework docs require verifying auth INSIDE every Server Action — so auto-trusting an unseen middleware would convert a false positive into a far worse missed-auth false negative.',
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingServerActionAuth:
        "Server Action `{{name}}` has no visible authentication check. Server Actions are reachable via direct POST requests, not just your UI — verify the session inside the action (e.g. `await auth()`, `verifySession()`, `unauthorized()`) or configure `authCallers` / `assumeMiddlewareAuth`.",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const assumeMiddlewareAuth = options.assumeMiddlewareAuth ?? false;
    const allAuthCallers = new Set([
      ...DEFAULT_AUTH_CALLERS,
      ...(options.authCallers ?? []),
    ]);

    // A file-level `'use server'` directive makes EVERY exported async function in the
    // file a Server Action. Computed once on Program entry.
    let fileLevelUseServer = false;

    // Returns the run of leading string-literal directives at the start of a statement list.
    function leadingDirectives(body: TSESTree.Statement[]): string[] {
      const dirs: string[] = [];
      for (const stmt of body) {
        if (
          stmt.type === AST_NODE_TYPES.ExpressionStatement &&
          stmt.expression.type === AST_NODE_TYPES.Literal &&
          typeof stmt.expression.value === 'string'
        ) {
          dirs.push(stmt.expression.value);
        } else {
          break; // directives must be the leading statements
        }
      }
      return dirs;
    }

    // A block-bodied function with its own leading `'use server'` directive is an inline
    // Server Action regardless of the file-level directive.
    function hasFunctionLevelUseServer(
      fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
    ): boolean {
      if (fn.body.type !== AST_NODE_TYPES.BlockStatement) return false;
      return leadingDirectives(fn.body.body).includes('use server');
    }

    // Only async functions are Server Actions; only exported ones are POST-reachable.
    // Async GENERATORS are excluded — a Server Action cannot be an async generator,
    // so flagging one would be a false positive.
    function isAsyncFn(
      fn: TSESTree.Node,
    ): fn is TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression {
      if (
        fn.type !== AST_NODE_TYPES.FunctionDeclaration &&
        fn.type !== AST_NODE_TYPES.FunctionExpression &&
        fn.type !== AST_NODE_TYPES.ArrowFunctionExpression
      ) {
        return false;
      }
      if (fn.async !== true) return false;
      // ArrowFunctionExpression has no `generator`; the other two do.
      if ('generator' in fn && fn.generator === true) return false;
      return true;
    }

    // Top-level async functions declared (not inline-exported) at module scope, keyed
    // by local name. Lets us resolve `export { foo }` specifiers and
    // `export default foo` to the underlying async fn — a Server Action declared then
    // exported separately is just as POST-reachable as an inline export, and missing
    // it is a false negative. Populated once on Program entry (hoisting-safe).
    const topLevelAsyncByName = new Map<
      string,
      TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression
    >();

    // Guards against double-reporting one underlying action that is exposed through
    // more than one export surface (e.g. `export { foo }` AND `export default foo`).
    const reportedFns = new WeakSet<object>();

    // Report `fn` (named `name`) if it is a Server Action lacking a visible auth call.
    function checkAction(
      fn: TSESTree.FunctionDeclaration | TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
      name: string,
      reportNode: TSESTree.Node,
    ): void {
      const isAction = fileLevelUseServer || hasFunctionLevelUseServer(fn);
      if (!isAction) return;
      if (reportedFns.has(fn)) return;
      if (!bodyContainsCallTo(fn.body, allAuthCallers)) {
        reportedFns.add(fn);
        context.report({
          node: reportNode,
          messageId: 'missingServerActionAuth',
          data: { name },
        });
      }
    }

    return {
      Program(node) {
        fileLevelUseServer = leadingDirectives(node.body).includes('use server');
        // Collect top-level async fns declared separately from their export, so
        // `export { foo }` / `export default foo` can be resolved back to them.
        // (Inline `export async function`/`export const` are nested in export nodes,
        // not direct Program.body children, so they aren't collected here — no double
        // counting; the inline export visitors below handle those.)
        for (const stmt of node.body) {
          if (
            stmt.type === AST_NODE_TYPES.FunctionDeclaration &&
            stmt.id &&
            isAsyncFn(stmt)
          ) {
            topLevelAsyncByName.set(stmt.id.name, stmt);
          } else if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
            for (const d of stmt.declarations) {
              if (
                d.id.type === AST_NODE_TYPES.Identifier &&
                d.init &&
                isAsyncFn(d.init)
              ) {
                topLevelAsyncByName.set(d.id.name, d.init);
              }
            }
          }
        }
      },

      // export async function foo() { ... }
      ExportNamedDeclaration(node) {
        if (assumeMiddlewareAuth) return;
        const decl = node.declaration;

        // export { foo } / export { foo as bar } — no inline declaration; resolve each
        // specifier's local name to a separately-declared top-level async fn.
        // `export { x } from '...'` is a re-export whose body lives in another module
        // (unreachable to an AST-only rule), so specifiers with a `source` are skipped.
        if (!decl) {
          if (node.source) return;
          for (const spec of node.specifiers) {
            if (spec.local.type !== AST_NODE_TYPES.Identifier) continue;
            const fn = topLevelAsyncByName.get(spec.local.name);
            if (fn) {
              const exportedName =
                spec.exported.type === AST_NODE_TYPES.Identifier
                  ? spec.exported.name
                  : spec.local.name;
              checkAction(fn, exportedName, spec);
            }
          }
          return;
        }

        // export async function foo() { ... }
        if (
          decl.type === AST_NODE_TYPES.FunctionDeclaration &&
          decl.id &&
          isAsyncFn(decl)
        ) {
          checkAction(decl, decl.id.name, decl);
          return;
        }

        // export const foo = async () => { ... } / async function () { ... }
        if (decl.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const declarator of decl.declarations) {
            if (
              declarator.id.type === AST_NODE_TYPES.Identifier &&
              declarator.init &&
              isAsyncFn(declarator.init)
            ) {
              checkAction(declarator.init, declarator.id.name, declarator);
            }
          }
        }
      },

      // export default async function foo() { ... }  /  export default async () => { ... }
      // /  export default foo  (foo declared separately above).
      ExportDefaultDeclaration(node) {
        if (assumeMiddlewareAuth) return;
        const decl = node.declaration;
        if (isAsyncFn(decl)) {
          const name =
            decl.type === AST_NODE_TYPES.FunctionDeclaration && decl.id
              ? decl.id.name
              : 'default';
          checkAction(decl, name, decl);
          return;
        }
        // export default <identifier> → resolve to a separately-declared async fn.
        if (decl.type === AST_NODE_TYPES.Identifier) {
          const fn = topLevelAsyncByName.get(decl.name);
          if (fn) checkAction(fn, decl.name, node);
        }
      },
    };
  },
});

export default requireServerActionAuth;
