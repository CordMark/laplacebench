# Commentary `file:` false-positive correction（tier: light）

tier: lightweight (bounded corrective)

## Contract and evidence

- User report: the submitted two-game run reached `main`, but the product showed that the latest publication failed.
- Reproduction: the current-ledger publisher fails at `game-000.events[56].commentary` on the harmless phrase `back file:`.
- Correct behavior: natural model commentary remains publishable; actual URI schemes and markup remain rejected.
- Scope: one commentary boundary expression and focused regression coverage. No schema, lifecycle, authorization, external contract, or stored run data changes.

## Implementation-review defense

1. **Invariant:** commentary scalar limits, markup rejection, and all non-`file` scheme rejection remain unchanged.
2. **Enforcement boundary:** `assertCommentaryText` still fails closed in both public replay construction and metadata cleaning.
3. **Counterexample:** `file:///etc/passwd`, `file:relative/path`, and a Windows `file:C:\\secret` path remain rejected.
4. **Composite identity:** no run, game, replay, digest, or source identity handling changes.
5. **Publication semantics:** artifacts remain atomic and immutable; the existing submitted run is regenerated without editing its evidence.
6. **Rollback:** reverting the expression and regression test restores the prior behavior without data migration.

## Review record

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.96）
