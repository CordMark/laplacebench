# Commentary `file:` boundary correction（tier: heavy）

tier: heavy

Canonical direction, plan-review adjudication, and completed Human Direction Proxy trace:
`/Users/kei/projects/laplace-main/docs/interrogation/adjudications/2026-07-27-bench-commentary-file-scheme.md`.

Approved producer plan: `docs/plans/2026-07-27-commentary-file-boundary.md`.

## Superseded initial bounded-corrective attempt (historical only)

- User report: the submitted two-game run reached `main`, but the product showed that the latest publication failed.
- Reproduction: the current-ledger publisher fails at `game-000.events[56].commentary` on the harmless phrase `back file:`.
- Correct behavior: natural model commentary remains publishable; actual URI schemes and markup remain rejected.
- Scope: one commentary boundary expression and focused regression coverage. No schema, lifecycle, authorization, external contract, or stored run data changes.

The following defense describes commit `8dd034f` only. It is not the final contract and its lifecycle/identity claims do not apply to the heavy implementation.

### Initial implementation-review defense

1. **Invariant:** commentary scalar limits, markup rejection, and all non-`file` scheme rejection remain unchanged.
2. **Enforcement boundary:** `assertCommentaryText` still fails closed in both public replay construction and metadata cleaning.
3. **Counterexample:** `file:///etc/passwd`, `file:relative/path`, and a Windows `file:C:\\secret` path remain rejected.
4. **Composite identity:** no run, game, replay, digest, or source identity handling changes.
5. **Publication semantics:** artifacts remain atomic and immutable; the existing submitted run is regenerated without editing its evidence.
6. **Rollback:** reverting the expression and regression test restores the prior behavior without data migration.

## Initial bounded-corrective review record

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.96）

This initial approval was superseded when the product implementation reviewer demonstrated valid no-separator file URL forms. The work item was escalated and replanned as heavy; the separator-only implementation is not the approved final contract.

## Final heavy-slice defense

1. **Invariant:** producer and product allow `file:` only before whitespace/end and reject every non-whitespace continuation; scalar, markup, other-scheme, fixed-upstream, digest, byte, and atomic-publication rules remain unchanged.
2. **Lifecycle boundary:** replay/content validation runs locally before external lookup; after one read-only login lookup, exact `<login>--<run-id>` public replay/raw-ref validation finishes before permission query, fork, clone, copy, commit, push, or PR.
3. **Eligibility:** the pre-submit helper uses the same `publicPair` predicate and `buildPublicReplay` builder as the publisher. Non-public runs remain submit-able and cannot wedge the arena.
4. **Identity and equivalence:** `buildPublicReplay` asserts its effective raw ref; explicit final-identity preflight bytes/digest equal a build whose actual directory basename is that identity. Publisher calls keep the actual-basename default.
5. **Immutable evidence:** the submitted run is never edited. Product deploy precedes producer regeneration; publisher retains defense in depth and last-complete atomic behavior.
6. **Irreversible release:** CLI `0.2.3` is staged but cannot be published until product production and producer CI/publication checks pass. An issued npm version will not be overwritten or unpublished.

## Release evidence

Pending implementation-review approval and product-first rollout. This section will record the reviewed source/release commit, package digest, npm `gitHead`, integrity/shasum, clean-install smoke, producer CI/publication status, and both final replay URLs after those operations actually succeed.

## Implementation review

- ラウンド 2・指摘計 1 件で APPROVED（confidence 0.98）。唯一の指摘は旧light defenseの現行契約との混同で、この記録内でhistorical-onlyへ隔離しfinal heavy defenseを追加して解消した。
