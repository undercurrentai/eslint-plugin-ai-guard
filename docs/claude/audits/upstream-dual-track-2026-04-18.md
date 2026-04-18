# Audit: Upstream Dual-Track Contribution Promise

> Audit date: **2026-04-18**
> Scope: Verify whether the contribution promise in `CONTRIBUTING.md` and `README.md` has been enacted in practice.
> Auditor: rigor skill invocation, session 2026-04-18.
> Status: **PROMISE NOT YET ENACTED** — zero courtesy PRs shipped, zero CHANGELOG entries. Upstream is still active and PR-accessible.

## 1. The Written Promise

Two load-bearing statements define the policy:

| Source | Line | Text |
|---|---|---|
| `CONTRIBUTING.md` | 8 | "**Upstream** — if your fix is a pure bug fix or a broadly useful rule improvement that fits upstream's scope, please also send a courtesy PR to `YashJadhav21/eslint-plugin-ai-guard`. Our CHANGELOG notes each upstream cross-PR." |
| `README.md` | 222 | "**Upstream contributions (dual-track):** This fork also contributes fixes and quality improvements back to the original upstream repo where they align with upstream's scope." |
| `CHANGELOG.md` | 179 (v2.0.0-beta.1 "Attribution" section) | "Where we find fixes that apply to upstream's scope, we contribute back via PRs to `YashJadhav21/eslint-plugin-ai-guard`." |

The promise is specific and falsifiable: (a) courtesy PRs are opened against upstream for scope-fitting fixes; (b) the CHANGELOG records each one.

## 2. Evidence: Has The Promise Been Kept?

### 2.1 Upstream PR history (authoritative)

```
$ gh pr list --repo YashJadhav21/eslint-plugin-ai-guard --state all --limit 50 --json number,title,author,state,createdAt
[]
```

**Zero PRs have ever been opened against the upstream repository by anyone, anywhere.** Not by `joshuakirby`, not by `ThermoclineLeviathan`, not by `undercurrentai`. Not in any state (open, closed, merged, draft). Not since the upstream repo was created.

### 2.2 CHANGELOG (self-reported compliance)

Every mention of upstream in the CHANGELOG describes the *inbound* relationship (lineage, attribution, license preservation, rule-URL updates from upstream → fork). **Zero entries document an outbound cross-PR.** The policy itself is documented (line 179), but no instances of the policy in action exist.

### 2.3 Local git history

- `git log --all --grep="upstream"` — one hit (`9c39b33`, the fork-creation commit; internal, not outbound).
- `git log --all --grep="cross-PR"` — zero hits.
- `git log --all --grep="YashJadhav"` — one hit, a stale inbound merge commit (`713b2a6`).

Local history contains zero signal of outbound upstream work.

## 3. Upstream Activity Signal

| Field | Value | Reading |
|---|---|---|
| `pushed_at` | 2026-04-17 | Active — commit yesterday (session date 2026-04-18) |
| `updated_at` | 2026-04-17 | Active |
| `archived` | false | Accepting contributions |
| `disabled` | false | Accepting contributions |
| `stars` | 9 | Small project; maintainer attention likely high per contribution |
| `forks` | 1 | **Ours** (`@undercurrent` fork is the only known fork) |
| `open_issues` | 0 | Clean issue tracker |
| Yash's profile `updated_at` | 2026-03-25 | Active user |
| Public contact | `jadhavyash.in` blog | Yes |

Yash is active. The upstream repo is open to PRs. The relationship has not gone cold on his end.

## 4. Severity & Classification

| Dimension | Finding |
|---|---|
| **Legal** | Clean — MIT license preserved, attribution present in `package.json#contributors`, `README.md` lineage note, and `CHANGELOG.md` line 177. |
| **Technical** | N/A — no code issue. |
| **Relational / Ethical** | **Gap** — written promise, zero enactment, active upstream author who is a plausible collaborator. |
| **Documentation Integrity** | **Gap** — CHANGELOG, CONTRIBUTING, and README all assert a practice that has not occurred. |
| **Risk to fork** | Low to moderate — a reader checking the dual-track claim against `gh pr list` will see the contradiction. This is disclosure-exploitable (anyone auditing the repo's community posture can verify in one command). |

Classification per quality-gate normalization escalation table: **MEDIUM** — "incorrect-by-default behavior in user-reachable code" analogue: the user-reachable documentation asserts something untrue.

## 5. Upstream-Scope Candidates from the 2026-04-18 Quality-Gate Cycle

Five cycle-1 fixes are framework-agnostic correctness improvements on rules that exist at upstream v1.1.11. They would apply directly with minimal adaptation:

| # | Fix | Upstream file | Why it fits upstream scope |
|---|---|---|---|
| 1 | `no-hardcoded-secret` — accept quoted `Property` keys (`{ 'apiKey': '...' }`, `{ ["apiKey"]: '...' }`) and computed-bracket `AssignmentExpression` (`obj['apiKey'] = '...'`) | `src/rules/security/no-hardcoded-secret.ts` | Pure AST-shape normalization. Closes an FN on Prettier-quoted / JSON-sourced config objects. No framework assumption. |
| 2 | `no-eval-dynamic` — flag bare `Function('code')` (no `new`) and `globalThis.Function(...)` / `window.Function(...)` | `src/rules/security/no-eval-dynamic.ts` | Per ECMA-262, `Function(...)` and `new Function(...)` are semantically identical — both RCE vectors. CVE-2025-55346 is a live exemplar. Framework-agnostic security posture. |
| 3 | `no-sql-string-concat` — `collectStaticText` now handles `TemplateLiteral` leaves inside `BinaryExpression '+'` trees | `src/rules/security/no-sql-string-concat.ts` | Closes the canonical mixed-template + concat SQLi pattern (OWASP A05:2025 / CWE-89). Framework-agnostic. |
| 4 | `no-floating-promise` — `nodeHasCatchClause` stops at nested function boundaries | `src/rules/async/no-floating-promise.ts` (upstream v1 has the check inline; in our fork it was extracted to `src/utils/async-scope.ts` in PR #4). Port the boundary logic inline if upstream hasn't adopted a utils module. | FN suppression fix: inner try/catch no longer silences outer-scope floating promises. Framework-agnostic. |
| 5 | `no-async-array-callback` — `isAssignedAndConsumedByPromiseCombinator` unwraps `ExportNamedDeclaration` parent | `src/rules/async/no-async-array-callback.ts` | FP fix for the idiomatic `export const tasks = arr.map(async ...); await Promise.all(tasks);` pattern. Framework-agnostic. |

Each fix has a regression test in our repo that can be ported alongside. Security-relevant three (1, 2, 3) are especially strong candidates — they close false negatives that exist in the upstream rule today.

### Not upstream candidates (fork-specific surface)

For the record, the following cycle-1 fixes do NOT fit upstream scope and should remain fork-only:

- `require-framework-auth` favicon/robots/sitemap regex tightening — fork-only rule
- `require-framework-auth` Fastify options-object dispatch — fork-only rule
- `require-webhook-signature` chained-route form — fork-only rule
- `STOP_DESCENT_NODE_TYPES` class-method boundary — part of fork's `framework-detectors.ts`; upstream may not have this helper module
- All CLI fixes (`baseline --mode` return, `baseline --check` preset, `loadBaseline` schema, SIGINT 130, `patchFlatConfig` `defineConfig`) — fork-only surface; upstream has no CLI
- Mirror-drift test — enforces an invariant specific to fork's CLI rule maps

## 5a. Upstream HEAD Verification (2026-04-18)

Each candidate fix was verified against upstream's HEAD content via the GitHub API to confirm the bug is still present and the port is structurally compatible:

| # | Upstream HEAD still has the bug? | Evidence |
|---|---|---|
| 1 `no-hardcoded-secret` quoted/computed | **Yes** | Upstream `AssignmentExpression` has `node.left.property.type !== AST_NODE_TYPES.Identifier` early-return; `Property` has `node.key.type !== AST_NODE_TYPES.Identifier` early-return. Our two helper functions port as drop-in. |
| 2 `no-eval-dynamic` bare `Function()` | **Yes** | Upstream has `CallExpression` (for `eval`) and `NewExpression` (for `new Function`) visitors; no bare-`Function` branch in `CallExpression`. Our `isFunctionConstructorCallee` helper + the added branch port directly. |
| 3 `no-sql-string-concat` mixed template | **Yes** | Upstream `collectStaticText` has BinaryExpression+literal branches only; no TemplateLiteral leaf handling. Confirmed at upstream HEAD `c9bef02`:<br>```<br>function collectStaticText(node) {<br>  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === '+') {<br>    return `${collectStaticText(node.left)} ${collectStaticText(node.right)}`;<br>  }<br>  const literalValue = getStringLiteralValue(node);<br>  return literalValue ?? '';<br>}<br>``` |
| 4 `no-floating-promise` nested-fn stop | **Yes** | Upstream `nodeHasCatchClause` is inline (no utils module extraction) and recurses without `FUNCTION_SCOPE_BOUNDARY_TYPES` check. Our fix is additive — introduce the Set and gate the two descent branches. |
| 5 `no-async-array-callback` export unwrap | **Yes** | Upstream has identical `container.type !== Program && BlockStatement` guard, no `ExportNamedDeclaration` unwrap. Our fix is additive. |

All five fixes are **drop-in ports** (no restructuring of upstream's code needed).

## 5b. Upstream Velocity Signal

Upstream recent commits (fetched 2026-04-18 via `gh api repos/YashJadhav21/eslint-plugin-ai-guard/commits`):

| Date | SHA | Message |
|---|---|---|
| 2026-04-17 10:44 | `c9bef02` | Hardcoded secret update |
| 2026-04-17 10:32 | `7cb1405` | 1.1.13 |
| 2026-04-17 10:31 | `3217ca8` | 1.1.12 |
| 2026-04-17 10:13 | `a250e6e` | fix(sql-rule): reduce builder false positives and refresh docs |
| 2026-04-17 10:03 | `a59f803` | Added safe autofixers to 5 high-impact rules |

In a **single day**, Yash shipped autofixers for 5 rules (including `no-hardcoded-secret` and `no-floating-promise`), an SQL-rule FP reduction, two releases (1.1.12 and 1.1.13), and a further hardcoded-secret update. This is active, velocity-competent maintenance.

**Implications:**
- **Divergence risk is real.** If Yash continues at this pace, the longer we defer Move A, the more our patches will conflict with his refactors. Sooner = easier port, easier review.
- **The upstream is already investing in autofixers and false-positive reduction** — our 5 candidates are exactly in that wheelhouse. This is the right moment to offer them.
- **Our 2.0.0-beta.1 CHANGELOG was written when upstream was at v1.1.11.** Upstream is now at v1.1.13 with further updates in-flight. The fork diverged 3 patches ago; the fork's "we contribute back" claim is aging, not improving.

## 6. Recommendation

Three moves, ordered by commitment:

### Move A — Ship the 5 upstream candidates as courtesy PRs (low-risk, high-signal)

Bundle the three security fixes (#1, #2, #3) into a single PR titled something like `fix(security): three false-negative fixes (quoted keys, Function without new, mixed-template SQL)`. The two async fixes (#4, #5) in a second PR. Each PR:
- Cites the concrete AI-codegen trigger pattern
- Ports the regression test
- References the CVE/OWASP context where relevant
- Opens with a short lineage note ("Fix ported from `@undercurrent/eslint-plugin-ai-guard` — we're maintaining a fork under MIT and committed in our CONTRIBUTING.md to sending upstream-scope fixes back. Happy to iterate.")

Cost: ~1-2 hours of PR-prep work each. Upstream acceptance signal: PR accepted/closed within a week → relationship is healthy; no response → move to Move B.

### Move B — Open a tracking issue on upstream (medium commitment)

Title: "Heads-up: `@undercurrent` fork at v2.0.0-beta.2 + intent to send upstream-scope fixes". Body: link to our README lineage note, our roadmap, and a short list of the 5 upstream candidates. Frames the relationship, invites dialogue, records intent publicly. Useful as a lightweight signal if PR-first feels presumptuous.

### Move C — Direct outreach (highest commitment, highest-bandwidth)

Via Yash's blog contact form at `jadhavyash.in`. Tone: appreciation + context + offer. ~100 words. Useful if Moves A/B don't elicit a response, or as a parallel channel.

### A recommendation order

Do **A** for fixes #1-3 (security-tagged, highest value to upstream users) this week. If accepted/engaged, continue with #4-5. If no response within two weeks, add **B**. Only escalate to **C** if **A** and **B** have both sat idle for a month.

## 7. Honesty Repair

Until at least one upstream PR has shipped and been noted in CHANGELOG, both `README.md:222` and `CONTRIBUTING.md:8` overstate current practice. Two equivalent fixes exist:

- **Option 1 (preferred)**: Ship Move A and make the statements true. The written policy is good; the gap is enactment.
- **Option 2 (fallback, if Move A is deferred)**: Soften the language until practice catches up — e.g., "This fork intends to contribute fixes back to the original upstream repo where they align with upstream's scope." Avoids asserting an untrue past-tense claim.

**Recommend Option 1**, because the fixes are cheap to port and the relationship benefit is concrete.

## 8. Follow-ups to Track

Add to `tasks/todo.md` Watch:

- [ ] Port fixes #1-3 (security) to upstream as a courtesy PR before 2026-05-02 (two-week window).
- [ ] Port fixes #4-5 (async) if #1-3 is accepted or engaged on, before 2026-05-18.
- [ ] Each accepted PR → CHANGELOG entry under "Upstream cross-PRs" section (create the section on first entry).
- [ ] If no upstream engagement by 2026-05-31, soften `README.md:222` / `CONTRIBUTING.md:8` to intent language (Option 2).

## 9. Closure

| Field | Value |
|---|---|
| Audit goal | Verify dual-track promise enactment |
| Primary finding | Promise made, zero enactment; upstream active |
| Severity | MEDIUM (documentation integrity) |
| Blocking any shipping work | No — this is relational, not technical |
| Next concrete action | Move A on fixes #1-3 (security) |
| Owner | @joshuakirby (per repo maintainer attribution) |
| Next review date | 2026-05-02 (two-week window) |

---

*Generated by rigor skill invocation, session 2026-04-18. See `.quality-gate/metrics.jsonl` for the quality-gate run that surfaced the upstream candidates.*
