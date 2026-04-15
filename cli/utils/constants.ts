/**
 * Shared constants for CLI string identity.
 *
 * v2.0.0 introduced the scoped package name `@undercurrent/eslint-plugin-ai-guard`
 * as a hard fork of upstream `eslint-plugin-ai-guard@1.1.11`. CLI code paths that
 * detect the plugin in a user's project must support BOTH names during the
 * v2.x deprecation window so users mid-migration are not stranded.
 */

export const PLUGIN_NAME = '@undercurrent/eslint-plugin-ai-guard' as const;
export const LEGACY_PLUGIN_NAME = 'eslint-plugin-ai-guard' as const;

/** Ordered list of candidate names for resolution/detection (scoped first). */
export const PLUGIN_NAMES: readonly string[] = [PLUGIN_NAME, LEGACY_PLUGIN_NAME];

/**
 * Check whether a content string references the plugin by either name.
 * Used by CLI detectors that scan user ESLint configs / project files.
 */
export function contentReferencesPlugin(content: string): boolean {
  return content.includes(PLUGIN_NAME) || content.includes(LEGACY_PLUGIN_NAME);
}
