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
