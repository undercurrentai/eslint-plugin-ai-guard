# tasks/todo.md

> Boris Cherny self-improvement loop. Append plan items at session start, check off as you complete, prune at session end.
> Pair with `tasks/lessons.md` (rules learned from corrections).

## Active

- [ ] Observe new CLAUDE.md v4.0 and `.claude/settings.json` for 30 days (until 2026-05-17). Capture friction in `lessons.md`. Tune Ask-First triggers if any fire >5×/week without value.
- [ ] Re-audit at `2026-10-17` per CLAUDE.md §12 expiry.

## Watch (deferred — re-check at expiry)

- [ ] ESLint 10 ecosystem maturity. When community plugins broadly support 10, widen `peerDependencies.eslint` to `^9.0.0 || ^10.0.0` and bump `engines.node` to `>=20.19.0`. Coordinate with v3.0.0 major.
- [ ] typescript-eslint issue [#11543](https://github.com/typescript-eslint/typescript-eslint/issues/11543) — `RuleCreator` type drift vs downstream `defineConfig()`. Track upstream resolution; ship guidance update if a workaround becomes recommended.
- [ ] Dual release workflow (`publish.yml` OIDC + `release.yml` `NPM_TOKEN`). Decide which is canonical; archive the other to avoid double-publish risk on `v*` tag + GitHub Release sequence. See audit `Lock-Step Dependencies`.

## Done

- [x] 2026-04-18 — Add CI mirror-drift guard (`tests/configs/mirror.test.ts`, 5 assertions). Closes audit Self-Red-Team #1 (R=12, highest residual risk): drift between `src/configs/{recommended,strict,security}.ts` and `cli/utils/eslint-runner.ts:77-114` now fails the test suite. Catches severity flips, membership mismatches, unregistered rule IDs, and stray `off` entries in CLI maps. 627 → 632 tests.
- [x] 2026-04-18 — Quality-gate Phase 2 bug-hunt cycle 1: 14 rule + CLI correctness fixes via hybrid Codex + Claude sweep (3 Codex iterations, 3 parallel Claude partitions). Closed 3 security FN classes (hardcoded-secret bracket forms, eval-dynamic bare Function() RCE, sql-concat mixed templates), 1 async-scope FN (nested try/catch suppression), 1 async-array FP (exported map pattern), 3 CLI correctness bugs (baseline --mode return, baseline --check preset, loadBaseline schema), SIGINT exit code, defineConfig flat-config patching, favicon public-route regex over-match, webhook chained-route form, STOP_DESCENT class methods. 632 → 645 tests; npm audit 0 vulnerabilities. 7 LOW CLI UX findings logged to `.quality-gate/cycle-1-deferred-findings.md` for a focused follow-up PR.
- [x] 2026-04-18 — Fixed pre-existing dead link in `docs/migration/v1-to-v2.md:169` (`../../CHANGELOG.md` → absolute GitHub URL). `npm run docs:build` was failing silently; now green.
- [x] 2026-04-18 — Added CHANGELOG `[Unreleased]` section covering the quality-gate cycle. Per CLAUDE.md §5.1 step 8 (mandatory for any rule/CLI change).
