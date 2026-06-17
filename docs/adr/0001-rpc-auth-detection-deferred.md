# ADR-0001: Defer RPC (tRPC / GraphQL) missing-auth detection

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** @joshuakirby
- **Tags:** rules, framework-detection, false-positives, scope

## Context

ai-guard ships framework-aware missing-auth detection for HTTP route handlers across
Express, Fastify, Hono, NestJS, and Next.js App Router (`require-framework-auth`), plus
Next.js Server Actions (`require-server-action-auth`, added 2026-06-16). A staged
follow-on ("ship #4") proposed extending coverage to **RPC frameworks** —
tRPC procedures, GraphQL resolvers, and Hono RPC — on the theory that AI assistants
scaffold unauthenticated RPC endpoints the same way they scaffold unauthenticated REST
routes.

The staged plan further proposed a prerequisite refactor: replacing the single-valued
`detectFramework(): FrameworkKind` in `src/utils/framework-detectors.ts` with a
multi-valued `detectSurfaces(): Set<Surface>`, on the theory that one file can be both a
Next.js route *and* a tRPC router and the single-enum detector cannot represent that.

This ADR records why that work was **not** built, what evidence drove the decision, and
the exact conditions under which it should be revisited. The goal is to prevent a future
session or contributor from re-deriving the same dead end.

## Decision

1. **Do not ship tRPC or GraphQL missing-auth rules** at the current AST-only,
   single-file, no-type-information analysis granularity.
2. **Do not perform the `detectFramework → detectSurfaces` refactor.** It is premature
   abstraction with no sound consumer (see Consequences).
3. **Treat "Hono RPC" as already covered** by `require-framework-auth`.

## Evidence

### Hono RPC is already covered — nothing to build

Hono RPC (`hono/client` + the typed `app.route()` surface) is, on the server, ordinary
Hono route handlers (`app.get(...)`, `app.post(...)`, `app.on(...)`, the chained
`app.get(...).post(...)` form, and `app.route(...)` mounting). These are already
analyzed by `require-framework-auth` via `checkExpressHonoRoute` / `checkHonoOnRoute`,
including the `hono/basic-auth`, `hono/bearer-auth`, `hono/jwt` middleware imports. There
is no distinct "Hono RPC" auth surface to add.

### tRPC auth is structurally invisible to a single-file AST rule

Per the canonical tRPC authorization docs
([trpc.io/docs/server/authorization](https://trpc.io/docs/server/authorization),
[/procedures](https://trpc.io/docs/server/procedures)), authentication is enforced by
building a **reusable procedure** whose middleware checks the context, defined in a
*separate* init module:

```ts
// trpc.ts — a DIFFERENT file from the routers
export const publicProcedure    = t.procedure;                       // intentionally public
export const protectedProcedure = t.procedure.use(isAuthed);         // auth baked in HERE
export const authedProcedure    = t.procedure.use(isAuthed);         // ...under any name
export const organizationProcedure = authedProcedure.use(isMember);  // chained authz
```

```ts
// some-router.ts — the file a linter would scan
export const appRouter = t.router({
  whoami:    authedProcedure.query(...),                 // authed — but .use() is in trpc.ts
  addMember: organizationProcedure.input(...).mutation(...), // authed — likewise out-of-file
  createX:   t.procedure.mutation(...),                  // UNPROTECTED — structurally identical
});
```

The "is this procedure authenticated?" signal lives entirely in:

- **which procedure builder** the call chains off — and those builders are **arbitrarily
  named** by each project (`protectedProcedure`, `authedProcedure`, `organizationProcedure`,
  `adminProcedure`, `memberProcedure`, …); and
- **that builder's `.use(...)` chain**, which is defined in a different module.

A single-file, no-type-information rule sees neither. The two failure modes are both
disqualifying for ai-guard:

- **Name-convention matching** (flag anything not built from a recognized "protected"
  name) floods false positives on every project that names its authed builder something
  the rule didn't anticipate, and requires per-project configuration that, once written,
  the team could have just… enforced in review. `publicProcedure` is **intentionally
  public** — flagging it is a guaranteed false positive.
- **Raw-base matching** (flag only `t.procedure.mutation(...)`) has low value (named
  procedures are the common case and would be missed) and residual false positives
  (legitimate public mutations — login, signup, contact, webhooks — plus a possible
  global middleware applied at `initTRPC().create()` the rule cannot see).

### GraphQL resolver auth is declarative and out-of-band

GraphQL authorization is conventionally enforced *outside* resolver bodies: `@auth` schema
directives (SDL, not resolver code), field middleware (graphql-shield's separate
`permissions` map), Pothos `authScopes` in field options, Nexus `authorize` in field
config, or Apollo plugins. Resolvers themselves are object-map properties or builder
calls with highly variable shapes. Detecting "this resolver lacks auth" from resolver
ASTs alone is very-high-false-positive and frequently impossible (the auth isn't in the
code being linted).

## Why this is the right call (not just the easy one)

ai-guard's governing design doctrine is **a false positive is the #1 adoption killer** —
FP-risky rules ship `off` in the `recommended` preset, and the project errs toward silence
when a signal is ambiguous (see `require-server-action-auth`'s `assumeMiddlewareAuth`
default and `require-framework-auth`'s public-route allowlist). A tRPC/GraphQL missing-auth
rule cannot clear that bar at AST-only granularity: it is forced to choose between flooding
false positives and providing near-zero value. The plugin is free/MIT and exists partly to
bank credibility (its own diagnostics must survive the scrutiny we apply to others'); a
noisy rule is *negative* credibility. Shipping nothing here is the higher-integrity outcome.

## What would unblock this (revisit conditions)

Revisit this ADR if **any** of the following changes:

1. **Type-aware linting is adopted.** Resolving a procedure builder's cross-file `.use()`
   provenance (and thus "is this builder authed?") requires `parserServices` /
   `project: true` type information. This is **explicitly excluded today** by a load-bearing
   design pillar: ai-guard runs at editor speed with no `project: true` (see CLAUDE.md §1).
   A type-aware mode would be a major architectural bet (slower, heavier consumer setup) and
   should be its own ADR weighing the editor-speed tradeoff — not a quiet addition.
2. **A genuinely low-FP, in-file signal emerges** — e.g., a tRPC convention that encodes
   auth locally and unambiguously, or a community-standard the ecosystem converges on. If
   so, a narrow, `off`-by-default, opt-in rule with documented limitations could be
   justified (mirroring how `require-server-action-auth` shipped `off` in `recommended`).
3. **Demand evidence appears** — real adopters asking for tRPC/GraphQL coverage, which
   would change the value side of the value/FP tradeoff and justify the type-aware
   investment.

## Consequences

- ai-guard's auth coverage remains: Express, Fastify, Hono (incl. Hono RPC), NestJS,
  Next.js App Router routes, and Next.js Server Actions. RPC frameworks (tRPC, GraphQL)
  are **out of scope** until a revisit condition is met.
- `detectFramework(): FrameworkKind` stays single-valued. The `detectSurfaces(Set<Surface>)`
  refactor is **not** performed: the only proposed consumer was RPC detection, which is
  deferred, and `require-server-action-auth` already demonstrated that a new rule does its
  own directive/import-keyed detection with **zero** contact with `detectFramework`. The
  refactor would have been abstraction without a consumer — pure churn and regression risk
  against the battle-tested REST detection path.
- No behavior change ships with this ADR; it is a scope/architecture decision record only.

## References

- tRPC authorization: <https://trpc.io/docs/server/authorization>
- tRPC procedures (reusable base procedures): <https://trpc.io/docs/server/procedures>
- `src/rules/security/require-framework-auth.ts` (Hono/Express/Fastify/NestJS/Next.js coverage)
- `src/rules/security/require-server-action-auth.ts` (new-rule pattern: own detection, no `detectFramework` contact)
- `src/utils/framework-detectors.ts` (`detectFramework`, `FrameworkKind`)
- CLAUDE.md §1 (editor-speed / no `project: true` design pillar), §12 watch-items
