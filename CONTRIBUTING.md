# Contributing to `@undercurrent/eslint-plugin-ai-guard`

Thanks for contributing! This is the Undercurrent fork of [`eslint-plugin-ai-guard`](https://github.com/YashJadhav21/eslint-plugin-ai-guard) (MIT, originally authored by YashJadhav21). We diverged at upstream v1.1.11 to pursue a framework-deep, AI-risk-focused policy scope — see [`docs/migration/v1-to-v2.md`](./docs/migration/v1-to-v2.md).

## Dual-track contributions

- **Our fork** — all direction-changing work (framework-aware rules, policy compiler, taint MVP, breaking deprecations) ships here at [`undercurrentai/eslint-plugin-ai-guard`](https://github.com/undercurrentai/eslint-plugin-ai-guard).
- **Upstream** — if your fix is a pure bug fix or a broadly useful rule improvement that fits upstream's scope, please also send a courtesy PR to [`YashJadhav21/eslint-plugin-ai-guard`](https://github.com/YashJadhav21/eslint-plugin-ai-guard). Our CHANGELOG notes each upstream cross-PR.

## Development Setup

1. **Fork** [`undercurrentai/eslint-plugin-ai-guard`](https://github.com/undercurrentai/eslint-plugin-ai-guard) on GitHub.
2. **Clone your fork locally**:
   ```sh
   git clone git@github.com:<your-username>/eslint-plugin-ai-guard.git
   cd eslint-plugin-ai-guard
   git remote add upstream git@github.com:undercurrentai/eslint-plugin-ai-guard.git
   ```
3. **Install dependencies** (Node ≥ 18):
   ```sh
   npm install
   ```
4. **Build the project**:
   ```sh
   npm run build
   ```
5. **Run the full verify loop**:
   ```sh
   npm run typecheck && npm test && npm run lint && npm run docs:build
   ```

## Creating a New Rule

New rules use `@typescript-eslint/utils`' `RuleCreator` and should stick to AST-level analysis. We avoid requiring `parserServices` / `project: true` by default to keep editor-speed feedback; framework-aware rules use imports + filename + decorator detection via `src/utils/framework-detectors.ts` (added in v2.0.0-beta.2).

### 1. Identify the AI pattern
What does the AI tool generate that causes issues? (e.g. `catch (e: any)`, un-awaited fetch-prefixed promises, `req.body` into `JSON.parse` without validation.)

### 2. Scaffold the rule
Create `src/rules/<category>/<rule-name>.ts`:
```typescript
import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/undercurrentai/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

export const myNewRule = createRule({
  name: 'my-new-rule',
  meta: {
    type: 'problem', // or 'suggestion'
    docs: { description: '...' },
    schema: [],
    messages: { /* messageId: text */ },
  },
  defaultOptions: [],
  create(context) {
    return { /* visitor */ };
  },
});
```

### 3. Add tests
Create `tests/rules/<rule-name>.test.ts`:
```typescript
import { RuleTester } from '@typescript-eslint/rule-tester';
import { myNewRule } from '../../src/rules/<category>/<rule-name>';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('my-new-rule', myNewRule, { valid: [...], invalid: [...] });
```

### 4. Register and document
- Add an import + entry in `src/rules/index.ts`.
- Add the rule at the intended severity in the appropriate preset (`src/configs/{recommended,strict,security}.ts`).
- Create `docs/rules/<rule-name>.md` describing intent, examples, and options.
- Add an entry to `docs/rules.md` and the Vitepress nav if applicable.

### 5. Deprecating a rule
We use `meta.deprecated: true` + `meta.replacedBy: [...]` on the rule's `meta`, prefix the user-facing message with `[ai-guard deprecated — use <X>]`, and keep the rule code functional for ≥ 2 minor versions before removal in the next major. See the 5 rules deprecated in v2.0.0-beta.1 as reference.

## Running tests

Vitest powers our unit, integration, and CLI tests.

```sh
npm test                                           # full suite
npx vitest run tests/rules/my-new-rule.test.ts     # single rule
npx vitest run --coverage.enabled                  # with coverage
```

## Commit conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/). Use `!` after the type/scope to signal `BREAKING CHANGE`:

- `feat(rules): add require-framework-auth`
- `fix(cli): handle missing ESLint gracefully`
- `feat(m2)!: replace require-auth-middleware with framework-aware trio`
- `docs(migration): update v1→v2 migration checklist`

## Pull Request Process

1. Create a descriptive branch name: `feat/m2-framework-auth` or `fix/no-await-in-loop-false-positive`.
2. Ensure `npm run typecheck && npm test && npm run lint && npm run docs:build` all pass locally.
3. Push to your fork and open a PR against `main`.
4. Include in the PR description:
   - A realistic "before / after" diff of the AI-generated code the rule targets.
   - The rule's FP/TP characteristics if you've benchmarked it on a real codebase.
   - Whether this change should also be offered upstream (dual-track).

## Code Style

TypeScript, ESLint, and tsup are the toolchain. Keep all files passing `npm run build && eslint src cli tests --ext .ts` (covered by `npm run lint`). We don't use Prettier; `@typescript-eslint/parser` + ESLint's built-in stylistic rules are sufficient.
