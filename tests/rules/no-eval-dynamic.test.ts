import { RuleTester } from '@typescript-eslint/rule-tester';
import { noEvalDynamic } from '../../src/rules/security/no-eval-dynamic';
import { describe, it, afterAll } from 'vitest';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

ruleTester.run('no-eval-dynamic', noEvalDynamic, {
  valid: [
    // 1. eval with string literal — rare but technically safe
    {
      code: `eval('console.log("hello")');`,
    },
    // 2. eval with no arguments
    {
      code: `eval();`,
    },
    // 3. new Function with all literal arguments
    {
      code: `const fn = new Function('a', 'b', 'return a + b');`,
    },
    // 4. No eval or Function usage at all
    {
      code: `const result = JSON.parse(data);`,
    },
    // 5. Function as regular identifier (not constructor)
    {
      code: `const myFunction = createFunction();`,
    },
    // 6. eval as property name (not a call)
    {
      code: `const obj = { eval: true };`,
    },
    // 7. Template literal with no expressions in eval
    {
      code: 'eval(`console.log("static")`);',
    },
    // 8. new Function with no args
    {
      code: `const noop = new Function();`,
    },
  ],
  invalid: [
    // 1. eval with variable
    {
      code: `eval(userInput);`,
      errors: [{ messageId: 'evalDynamic' }],
    },
    // 2. eval with template literal containing expression
    {
      code: 'eval(`console.log(${userVar})`);',
      errors: [{ messageId: 'evalDynamic' }],
    },
    // 3. eval with concatenation
    {
      code: `eval('console.log(' + value + ')');`,
      errors: [{ messageId: 'evalDynamic' }],
    },
    // 4. window.eval with variable
    {
      code: `window.eval(code);`,
      errors: [{ messageId: 'evalDynamic' }],
    },
    // 5. globalThis.eval with variable
    {
      code: `globalThis.eval(dynamicCode);`,
      errors: [{ messageId: 'evalDynamic' }],
    },
    // 6. new Function with dynamic argument
    {
      code: `const fn = new Function(userCode);`,
      errors: [{ messageId: 'newFunctionDynamic' }],
    },
    // 7. new Function with mixed literal and dynamic args
    {
      code: `const fn = new Function('a', dynamicBody);`,
      errors: [{ messageId: 'newFunctionDynamic' }],
    },
    // 8. eval with function call result
    {
      code: `eval(getCode());`,
      errors: [{ messageId: 'evalDynamic' }],
    },
    // 9. new Function with template literal body
    {
      code: 'const fn = new Function(`return ${expr}`);',
      errors: [{ messageId: 'newFunctionDynamic' }],
    },
    // 10. eval inside a function
    {
      code: `
        function execute(code) {
          return eval(code);
        }
      `,
      errors: [{ messageId: 'evalDynamic' }],
    },
  ],
});
