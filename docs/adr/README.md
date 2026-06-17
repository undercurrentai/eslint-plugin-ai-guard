# Architecture Decision Records

Significant, hard-to-reverse engineering decisions for `eslint-plugin-ai-guard` —
especially scope boundaries (what we deliberately do **not** build) and detection-strategy
choices. Each ADR is immutable once `Accepted`; supersede rather than edit.

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](./0001-rpc-auth-detection-deferred.md) | Defer RPC (tRPC / GraphQL) missing-auth detection | Accepted | 2026-06-16 |

**Format:** Context → Decision → Evidence → Consequences (+ revisit conditions where the
decision is a deferral). Number sequentially, zero-padded to 4 digits.
