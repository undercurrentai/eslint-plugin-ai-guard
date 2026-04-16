import type { Command } from 'commander';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { detect, isFlat } from '../utils/detector.js';
import {
  backupConfig,
  readConfig,
  writeConfig,
  patchFlatConfig,
  patchLegacyConfig,
  switchFlatPreset,
  switchLegacyPreset,
  generateFlatConfig,
  generateLegacyConfig,
  type Preset,
} from '../utils/config-manager.js';
import {
  RECOMMENDED_RULES,
  STRICT_RULES,
  SECURITY_RULES,
} from '../utils/eslint-runner.js';
import { log } from '../utils/logger.js';
import path from 'path';

export function registerPresetCommand(program: Command): void {
  program
    .command('preset')
    .description('Interactively select and apply an ai-guard preset to your ESLint config')
    .action(async () => {
      const cwd = process.cwd();

      log.banner('AI GUARD PRESET');
      log.blank();

      const preset = await select<Preset>({
        message: 'Choose a preset:',
        choices: [
          {
            name: `${chalk.green('recommended')} — balanced defaults, low noise. Best starting point.`,
            value: 'recommended',
          },
          {
            name: `${chalk.yellow('strict')}      — all rules at error. For mature codebases.`,
            value: 'strict',
          },
          {
            name: `${chalk.red('security')}   — security rules only. For AppSec teams.`,
            value: 'security',
          },
        ],
      });

      log.blank();
      log.info(`Applying preset: ${chalk.cyan(preset)}`);

      const env = detect(cwd);
      const useFlat =
        (env.eslintMajor !== null && env.eslintMajor >= 9) ||
        isFlat(env.configType);

      if (env.configType === 'none') {
        // Generate fresh config with chosen preset
        const configPath = useFlat
          ? path.join(cwd, 'eslint.config.mjs')
          : path.join(cwd, '.eslintrc.js');

        const content = useFlat
          ? generateFlatConfig(preset)
          : generateLegacyConfig(preset);

        writeConfig(configPath, content);
        log.success(`Created ${chalk.white(path.relative(cwd, configPath))} with ${chalk.cyan(preset)} preset`);
      } else {
        const configPath = env.configPath!;
        const backupPath = backupConfig(configPath);
        log.info(`Backed up → ${chalk.gray(path.relative(cwd, backupPath))}`);

        const existing = readConfig(configPath);
        const withPlugin = isFlat(env.configType)
          ? patchFlatConfig(existing, preset)
          : patchLegacyConfig(existing, preset);

        const patched = isFlat(env.configType)
          ? switchFlatPreset(withPlugin, preset)
          : switchLegacyPreset(withPlugin, preset);

        if (patched === existing) {
          log.warn('No preset changes needed. Config already matches selected preset.');
        } else {
          writeConfig(configPath, patched);
          log.success(`Updated ${chalk.white(path.relative(cwd, configPath))} to ${chalk.cyan(preset)} preset`);
        }
      }

      log.blank();
      log.section('Preset Details');

      // Build details dynamically from the preset rule maps so this UI stays
      // in sync with what `ai-guard run` actually enforces.
      const ruleMap =
        preset === 'strict'
          ? STRICT_RULES
          : preset === 'security'
            ? SECURITY_RULES
            : RECOMMENDED_RULES;

      const entries = Object.entries(ruleMap).map(([ruleId, level]) => ({
        rule: ruleId.replace(/^ai-guard\//, ''),
        level: level === 'error' ? chalk.red('error') : chalk.yellow('warn'),
      }));

      for (const { rule, level } of entries) {
        log.print(`    ${chalk.gray('•')} ${chalk.white(rule).padEnd(32)}${level}`);
      }

      log.blank();
      log.info(`Run ${chalk.cyan('ai-guard run')} to see results with the new preset.`);
      log.blank();
    });
}
