import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { log } from './logger.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type RuleLevel = 'error' | 'warn' | 'off';

export type Preset = 'recommended' | 'strict' | 'security';

export interface RunOptions {
  preset: Preset;
  targetPath: string;
  maxWarnings?: number;
  jsonOutput?: boolean;
}

export interface IssueDetail {
  ruleId: string;
  severity: 1 | 2;
  message: string;
  line: number;
  column: number;
}

export interface FileResult {
  filePath: string;
  issues: IssueDetail[];
  errorCount: number;
  warningCount: number;
}

export interface RunResult {
  files: FileResult[];
  totalErrors: number;
  totalWarnings: number;
  totalIssues: number;
  ruleBreakdown: Map<string, number>;
  topFiles: Array<{ path: string; count: number }>;
  durationMs: number;
}

// ─── Plugin normalizer ────────────────────────────────────────────────────────
// Plugin exports `default` (ESM). When require()'d in CJS context it arrives as
// { default: { rules, configs, meta } }. We normalise both shapes.

type AiGuardPlugin = {
  rules: Record<string, unknown>;
  configs?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizePlugin(raw: unknown): AiGuardPlugin {
  if (isRecord(raw) && isRecord(raw.default) && isRecord(raw.default.rules)) {
    return raw.default as AiGuardPlugin;
  }
  if (isRecord(raw) && isRecord(raw.rules)) {
    return raw as AiGuardPlugin;
  }
  throw new Error(
    'Could not load @undercurrent/eslint-plugin-ai-guard. Run: npm install @undercurrent/eslint-plugin-ai-guard',
  );
}

// ─── Preset rule maps ─────────────────────────────────────────────────────────

// v2.0: kept in sync with src/configs/recommended.ts. The 5 deprecated rules
// (no-await-in-loop, no-async-without-await, no-redundant-await,
// no-broad-exception, no-catch-without-use) are intentionally absent — they
// remain available via explicit rule-level configuration but are no longer
// enabled by the CLI's zero-config run.
export const RECOMMENDED_RULES: Record<string, RuleLevel> = {
  'ai-guard/no-empty-catch': 'error',
  'ai-guard/no-floating-promise': 'error',
  'ai-guard/no-hardcoded-secret': 'error',
  'ai-guard/no-eval-dynamic': 'error',
  'ai-guard/require-framework-auth': 'warn',
  'ai-guard/no-sql-string-concat': 'warn',
  'ai-guard/no-async-array-callback': 'warn',
  'ai-guard/no-unsafe-deserialize': 'warn',
  'ai-guard/require-framework-authz': 'warn',
  'ai-guard/require-webhook-signature': 'warn',
};

export const STRICT_RULES: Record<string, RuleLevel> = {
  'ai-guard/no-empty-catch': 'error',
  'ai-guard/no-catch-log-rethrow': 'error',
  'ai-guard/no-async-array-callback': 'error',
  'ai-guard/no-floating-promise': 'error',
  'ai-guard/no-hardcoded-secret': 'error',
  'ai-guard/no-eval-dynamic': 'error',
  'ai-guard/no-sql-string-concat': 'error',
  'ai-guard/no-unsafe-deserialize': 'error',
  'ai-guard/require-framework-auth': 'error',
  'ai-guard/require-framework-authz': 'error',
  'ai-guard/require-webhook-signature': 'error',
  'ai-guard/no-console-in-handler': 'error',
  'ai-guard/no-duplicate-logic-block': 'error',
};

export const SECURITY_RULES: Record<string, RuleLevel> = {
  'ai-guard/no-hardcoded-secret': 'error',
  'ai-guard/no-eval-dynamic': 'error',
  'ai-guard/no-sql-string-concat': 'error',
  'ai-guard/no-unsafe-deserialize': 'warn',
  'ai-guard/require-framework-auth': 'warn',
  'ai-guard/require-framework-authz': 'warn',
  'ai-guard/require-webhook-signature': 'warn',
};

function getRules(
  preset: Preset,
): Record<string, RuleLevel> {
  if (preset === 'strict') return STRICT_RULES;
  if (preset === 'security') return SECURITY_RULES;
  return RECOMMENDED_RULES;
}

// ─── Default ignores ──────────────────────────────────────────────────────────

const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/out/**',
  '**/.git/**',
];

// Some ESLint pattern scans should be skipped (not treated as fatal), e.g.:
// - pattern has no matching files
// - matched files are ignored by config/ignore rules
export function isSkippablePatternError(error: Error): boolean {
  const msg = error.message.toLowerCase();

  const hasNoFilesSignal =
    msg.includes('no files') ||
    msg.includes('no files matching');

  const hasIgnoredSignal =
    msg.includes('ignored') ||
    msg.includes('all files matched by') ||
    msg.includes('are ignored') ||
    msg.includes('was ignored') ||
    msg.includes('file ignored');

  return hasNoFilesSignal || hasIgnoredSignal;
}

async function loadPluginModuleFromCwd(cwd: string): Promise<unknown> {
  const { createRequire } = await import('module');
  const { PLUGIN_NAMES } = await import('./constants.js');

  // Anchor createRequire on package.json when present; otherwise use the cwd
  // directory itself as the resolution root. This prevents silent fall-through
  // to the local dist/src fallbacks when the user is in a workspace root
  // without a package.json.
  const cwdPkg = path.join(cwd, 'package.json');
  const anchor = fs.existsSync(cwdPkg) ? cwdPkg : path.join(cwd, 'index.js');
  const requireFromCwd = createRequire(anchor);

  // Try the scoped name first (v2.x), falling back to the legacy unscoped name
  // (v1.x / upstream) so users mid-migration don't get stuck. We resolve AND
  // require from the resolved path: if resolve succeeds but loading that
  // specific file fails (broken package, missing exports target), we let the
  // error propagate rather than silently retrying a different candidate or
  // falling through to a local copy.
  let lastResolveError: unknown = null;
  for (const pkgName of PLUGIN_NAMES) {
    let resolved: string;
    try {
      resolved = requireFromCwd.resolve(pkgName);
    } catch (err) {
      lastResolveError = err;
      continue;
    }
    return requireFromCwd(resolved);
  }

  const localDistEntry = path.join(cwd, 'dist', 'index.js');
  if (fs.existsSync(localDistEntry)) {
    // createRequire() gives a vanilla Node CJS require — bypasses any vite-node
    // ESM-wrapping that would otherwise produce `{default: {default: plugin}}`.
    return requireFromCwd(localDistEntry);
  }

  const localSrcEntry = path.join(cwd, 'src', 'index.ts');
  if (fs.existsSync(localSrcEntry)) {
    try {
      return await import(pathToFileURL(localSrcEntry).href);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      log.debug(`Local src plugin import failed: ${reason}`);
    }
  }

  const detail = lastResolveError instanceof Error ? ` (${lastResolveError.message})` : '';
  throw new Error(
    `@undercurrent/eslint-plugin-ai-guard is not installed${detail}. Run: npm install --save-dev @undercurrent/eslint-plugin-ai-guard`,
  );
}

// ─── Core runner ──────────────────────────────────────────────────────────────

export async function runEslint(options: RunOptions): Promise<RunResult> {
  const { ESLint } = await import('eslint').catch(() => {
    throw new Error(
      'ESLint is not installed. Run: npm install --save-dev eslint',
    );
  });

  // Load the plugin — resolve relative to the user's cwd so it finds their install
  const rawPlugin = await loadPluginModuleFromCwd(process.cwd());

  const plugin = normalizePlugin(rawPlugin);
  const rules = getRules(options.preset);
  const resolvedTargetPath = path.resolve(options.targetPath);

  if (!fs.existsSync(resolvedTargetPath)) {
    throw new Error(`Path not found: ${options.targetPath}`);
  }

  const targetStat = fs.statSync(resolvedTargetPath);
  const isSingleFileTarget = targetStat.isFile();
  const eslintCwd = isSingleFileTarget
    ? path.dirname(resolvedTargetPath)
    : resolvedTargetPath;

  const startMs = Date.now();

  const JS_TS_FILES = [
    '**/*.js',
    '**/*.jsx',
    '**/*.ts',
    '**/*.tsx',
    '**/*.mts',
    '**/*.cts',
    '**/*.mjs',
    '**/*.cjs',
  ];

  // ESLint v9 programmatic API: use overrideConfigFile to disable config file
  // discovery and overrideConfig to inject our plugin config.
  // For single-file scans, set cwd to the file's directory and lint only that file.

  // Try to load TypeScript parser for .ts/.tsx files
  let tsParser: unknown = null;
  try {
    // Try user's project first, then our own node_modules
    try {
      tsParser = require(path.join(
        process.cwd(),
        'node_modules',
        '@typescript-eslint',
        'parser',
      ));
    } catch {
      tsParser = require('@typescript-eslint/parser');
    }
  } catch {
    // TypeScript parser not available — ts files will use default espree parser
  }

  const configBlocks: Array<Record<string, unknown>> = [
    // JS/JSX files — default espree parser
    {
      files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
      plugins: { 'ai-guard': plugin } as Record<string, unknown>,
      languageOptions: {
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
      },
      rules: rules as Record<string, unknown>,
    },
    // Ignore generated directories
    { ignores: DEFAULT_IGNORE_PATTERNS },
  ];

  if (tsParser) {
    configBlocks.splice(1, 0, {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      plugins: { 'ai-guard': plugin } as Record<string, unknown>,
      languageOptions: {
        parser: tsParser,
        parserOptions: {
          // project: true would be needed for type-aware rules — skip for speed
          ecmaVersion: 'latest',
          sourceType: 'module',
        },
      },
      rules: rules as Record<string, unknown>,
    });
  } else {
    // No TS parser — still lint ts files but they may fail to parse
    configBlocks.splice(1, 0, {
      files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
      plugins: { 'ai-guard': plugin } as Record<string, unknown>,
      rules: rules as Record<string, unknown>,
    });
  }

  const eslint = new ESLint({
    cwd: eslintCwd,
    overrideConfigFile: true as unknown as string,
    overrideConfig: configBlocks,
  });

  // Use relative glob patterns for directory scans, and a direct file pattern for file scans.
  const patterns = isSingleFileTarget
    ? [path.basename(resolvedTargetPath)]
    : JS_TS_FILES;

  // ESLint v9 throws if no files match a pattern — run each glob independently
  // and collect results, silently skipping 'no files found' errors
  const perPatternResults = await Promise.all(
    patterns.map(async (pattern) => {
      try {
        return await eslint.lintFiles([pattern]);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));

        if (isSkippablePatternError(error)) {
          log.debug(`Skipping pattern '${pattern}' (no lintable files)`);
          return [];
        }

        // Real ESLint runtime/config/parser errors should fail fast.
        throw error;
      }
    }),
  );

  const rawResults = perPatternResults.flat();

  const durationMs = Date.now() - startMs;

  // ─── Process results ─────────────────────────────────────────────────────

  const files: FileResult[] = [];
  const ruleBreakdown = new Map<string, number>();
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const result of rawResults) {
    if (result.messages.length === 0) continue;

    const issues: IssueDetail[] = result.messages.map((m) => ({
      ruleId: m.ruleId ?? 'unknown',
      severity: m.severity as 1 | 2,
      message: m.message,
      line: m.line,
      column: m.column,
    }));

    const errorCount = result.errorCount;
    const warningCount = result.warningCount;
    totalErrors += errorCount;
    totalWarnings += warningCount;

    for (const issue of issues) {
      ruleBreakdown.set(
        issue.ruleId,
        (ruleBreakdown.get(issue.ruleId) ?? 0) + 1,
      );
    }

    const relPath = path.relative(process.cwd(), result.filePath);
    files.push({ filePath: relPath, issues, errorCount, warningCount });
  }

  // Top files by issue count (top 10)
  const topFiles = [...files]
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, 10)
    .map((f) => ({ path: f.filePath, count: f.issues.length }));

  return {
    files,
    totalErrors,
    totalWarnings,
    totalIssues: totalErrors + totalWarnings,
    ruleBreakdown,
    topFiles,
    durationMs,
  };
}
