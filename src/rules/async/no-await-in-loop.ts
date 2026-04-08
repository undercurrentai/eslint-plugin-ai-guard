import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/YashJadhav21/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

const LOOP_TYPES = new Set([
  AST_NODE_TYPES.ForStatement,
  AST_NODE_TYPES.ForInStatement,
  AST_NODE_TYPES.ForOfStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.DoWhileStatement,
]);

export const noAwaitInLoop = createRule({
  name: 'no-await-in-loop',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow `await` inside loops. AI tools frequently generate sequential awaits inside for/while loops where `Promise.all()` would be more efficient and correct. Each iteration waits for the previous one to complete, causing O(n) latency instead of O(1).',
    },
    fixable: undefined,
    schema: [],
    messages: {
      awaitInLoop:
        'Unexpected `await` inside a {{loopType}}. AI tools frequently generate sequential awaits in loops, causing O(n) latency. Consider collecting promises and using `Promise.all()` for parallel execution.',
    },
  },
  defaultOptions: [],
  create(context) {
    /**
     * Track ancestor scope boundaries (functions) so we don't flag await
     * expressions inside a nested async function that happens to be inside a loop.
     */
    const functionBoundary: TSESTree.Node[] = [];

    function enterFunction(node: TSESTree.Node) {
      functionBoundary.push(node);
    }
    function exitFunction() {
      functionBoundary.pop();
    }

    return {
      FunctionDeclaration: enterFunction,
      FunctionExpression: enterFunction,
      ArrowFunctionExpression: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      'FunctionExpression:exit': exitFunction,
      'ArrowFunctionExpression:exit': exitFunction,

      AwaitExpression(node) {
        // Walk up ancestors looking for a loop, but stop at any function boundary
        const ancestors = context.sourceCode.getAncestors(node);
        const currentFunction = functionBoundary[functionBoundary.length - 1];

        for (let i = ancestors.length - 1; i >= 0; i--) {
          const ancestor = ancestors[i];

          // Stop if we hit the current function boundary
          if (ancestor === currentFunction) {
            break;
          }

          if (LOOP_TYPES.has(ancestor.type as AST_NODE_TYPES)) {
            const loopName = getLoopName(ancestor.type as AST_NODE_TYPES);
            context.report({
              node,
              messageId: 'awaitInLoop',
              data: { loopType: loopName },
            });
            return;
          }
        }
      },
    };
  },
});

function getLoopName(type: AST_NODE_TYPES): string {
  switch (type) {
    case AST_NODE_TYPES.ForStatement:
      return 'for loop';
    case AST_NODE_TYPES.ForInStatement:
      return 'for...in loop';
    case AST_NODE_TYPES.ForOfStatement:
      return 'for...of loop';
    case AST_NODE_TYPES.WhileStatement:
      return 'while loop';
    case AST_NODE_TYPES.DoWhileStatement:
      return 'do...while loop';
    default:
      return 'loop';
  }
}

export default noAwaitInLoop;
