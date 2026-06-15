import { RuleTester } from '@typescript-eslint/rule-tester';
import { noUnsafeDeserialize } from '../../src/rules/security/no-unsafe-deserialize';
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

ruleTester.run('no-unsafe-deserialize', noUnsafeDeserialize, {
  valid: [
    {
      code: `JSON.parse('{"safe":true}');`,
    },
    {
      code: `JSON.parse(rawFromTrustedConfig);`,
    },
    {
      code: `const value = JSON.parse(envJson);`,
    },
    {
      code: `parseJson(req.body);`,
    },
    {
      code: `
        const x = JSON.parse(source);
        validateSchema(x);
      `,
    },
    {
      code: `window.JSON.parse(source);`,
    },
    {
      code: `
        function parseData(raw) {
          return JSON.parse(raw);
        }
      `,
    },
    {
      code: `
        const body = '{"a":1}';
        JSON.parse(bodyString);
      `,
    },
    {
      code: `
        const requestBodySafe = getTrustedString();
        JSON.parse(requestBodySafe);
      `,
    },
    {
      code: `
        const response = await fetch('/api');
        const txt = await response.text();
        JSON.parse(txt);
      `,
    },
    // FP guards for the coercion-unwrap path: only the INNER expression decides.
    {
      code: `JSON.parse(String(42));`,
    },
    {
      code: `JSON.parse(config.toString());`,
    },
    // FP guard for one-level const aliasing: a const from a trusted source.
    {
      code: `
        const safe = getConfig();
        JSON.parse(safe);
      `,
    },
    // FP guard: `let` reassignment is not resolved (could have been sanitized).
    {
      code: `
        let m = req.body;
        m = sanitize(m);
        JSON.parse(m);
      `,
    },
    // FP guard: document.title is not a URL-derived taint source.
    {
      code: `JSON.parse(document.title);`,
    },
    // FP guard: `data` as a property of a trusted object is not the bare
    // `data` identifier and the base object is trusted.
    {
      code: `JSON.parse(config.data);`,
    },
  ],
  invalid: [
    {
      code: `JSON.parse(req.body);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(req.query);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(req.params);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(request.body);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(userInput);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(input);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(payload);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(rawBody);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(window.location.hash);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(window.location.search);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    // Coercion-wrapping bypass (AFA dogfood finding #2).
    {
      code: `JSON.parse(String(req.body));`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(req.body.toString());`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    // Tainted-property access off an untrusted source (finding #1, member form).
    {
      code: `JSON.parse(req.body.data);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    // param/params list-drift fix (finding #3).
    {
      code: `JSON.parse(req.param);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    // Browser taint sources (finding #4).
    {
      code: `JSON.parse(document.URL);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(document.referrer);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(location.href);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(location.hash);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    {
      code: `JSON.parse(window.location.href);`,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
    // One-level const aliasing of an untrusted source (finding #1, alias form).
    {
      code: `
        const b = req.body;
        JSON.parse(b);
      `,
      errors: [{ messageId: 'unsafeDeserialize' }],
    },
  ],
});
