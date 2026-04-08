# Contributing to eslint-plugin-ai-guard

Thank you for your interest in contributing to `eslint-plugin-ai-guard`! We welcome contributions from the community. Below you'll find the guidelines and processes for contributing.

## Development Setup

1. **Fork the repository**
2. **Clone your fork locally**:
   ```sh
   git clone https://github.com/YOUR_USERNAME/eslint-plugin-ai-guard.git
   cd eslint-plugin-ai-guard
   ```
3. **Install dependencies**:
   ```sh
   npm install
   ```
4. **Build the project**:
   ```sh
   npm run build
   ```

## Creating a New Rule

If you are proposing a new rule, please follow the AI Guard Rule Anatomy guidelines outline! New rules are built using the robust `@typescript-eslint/utils` framework and should stick strictly to AST parsing. We avoid type-aware rules to maintain fast lint times and 0-configuration.

### 1. Identify the AI Pattern
What does the AI tool typically generate that causes issues? (e.g. `e: any` or un-awaited variables starting with 'fetch').

### 2. Scaffold the Rule
Create a new file in the appropriate directory (e.g. `/src/rules/async/my-new-rule.ts`):
```typescript
import { ESLintUtils, AST_NODE_TYPES } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/YashJadhav21/eslint-plugin-ai-guard/blob/main/docs/rules/${name}.md`
);

export const myNewRule = createRule({
  // rule definition
});
```

### 3. Add Tests
Create a test file under `/tests/rules/my-new-rule.test.ts`. Use Vitest paired with ESLint's `RuleTester`:
```typescript
import { RuleTester } from '@typescript-eslint/rule-tester';
import { myNewRule } from '../../src/rules/async/my-new-rule';
// define ruleTester and run valid/invalid cases
```

Run tests to watch them fail, then pass:
```sh
npm run test
```

### 4. Register the Rule
Update the following files to register the new rule:
- `src/rules/index.ts`
- `src/configs/recommended.ts` (and any other preset configs where applicable)

## Running Tests

We use Vitest. To run all tests:
```sh
npm run test
```

To run a specific test suite while developing:
```sh
npx vitest run tests/rules/your-rule-name.test.ts
```

## Pull Request Process

1. Create a descriptive branch name: `feat/no-new-rule-name` or `fix/rule-name-bug`
2. Ensure all your tests pass.
3. Push to your fork and submit a PR!
4. In your PR description, try to show an example of the bad code that an AI tool commonly generates. This helps us ensure the rule is impactful.

## Code Style

This project utilizes `typescript` and typical linting config format. Ensure all files pass the build check before submitting your changes.
