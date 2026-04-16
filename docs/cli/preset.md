# ai-guard preset

Interactively select and apply a preset to your ESLint configuration.

---

## Usage

```bash
ai-guard preset
```

## What it does

1. Prompts you to select one preset:
   - `recommended`
   - `strict`
   - `security`
2. Detects whether your project uses flat config or legacy config.
3. Creates a config if none exists, or updates your existing config to the selected preset.
4. Creates a `.bak` backup before patching existing config files.

## Preset meanings

| Preset | Purpose | Available via |
|---|---|---|
| `recommended` | Adoption-first, low-noise defaults | CLI prompt + config |
| `strict` | All active rules at `error` | CLI prompt + config |
| `security` | Security-focused rules (incl. framework-aware trio) | CLI prompt + config |
| `framework` | The 3 framework-aware rules only (auth, authz, webhook signature) | Config only — spread `aiGuard.configs.framework.rules` |
| `compat` | Disables all 7 deprecated rules | Config only — spread `aiGuard.configs.compat.rules` |

> `framework` and `compat` are config-level presets — they're meant to be composed with the base presets (e.g., `recommended + compat`) rather than selected alone via the CLI. See [framework-support.md](../guides/framework-support.md) and [compat-config.md](../guides/compat-config.md).

## Example

```bash
npx ai-guard preset
```

Then choose from the interactive menu.

## Notes

- This command is interactive, so it is best for local development.
- For CI and scripting, prefer non-interactive commands like `ai-guard init --preset strict`.
- Existing ai-guard configs are updated in place (for example `recommended` to `strict`) automatically.
