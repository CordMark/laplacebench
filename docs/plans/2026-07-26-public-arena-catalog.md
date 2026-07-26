---
status: approved
direction: direction-bench-arena-catalog
owner: bench
risk_tier: heavy
last_updated: 2026-07-26
related_plan: /Users/kei/projects/laplace-main/docs/plans/2026-07-26-bench-public-arena.md
---

# Public arena catalog and replay publication

## Direction Brief

- **Concept**: LaPlaceBench is the producer for one public model arena: people run model-v-model or model-v-product-CPU games with their own subscriptions, submit verified records, and every eligible game becomes watchable from LaPlace Main.
- **Owner and boundary**: this repository owns verification, public-game classification, deterministic replay export, catalog construction, and publication state. LaPlace Main consumes only a fixed read-only contract; it does not discover submitter URLs or build public artifacts.
- **Lifecycle**: a publish begins with an explicit `building` state, creates and commits one immutable artifact set, then publishes `ready` pointing at that commit. A failure becomes `failed` while retaining the previous `last_success`; consumers must show the state rather than silently presenting stale data as current.
- **Scope and order**: expose every public matchup game, newest matchup first, with no initial leaderboard, filter, or pagination. Update the product CPU choice from `cpu-v4` Lv1–5 to `cpu-v6` Lv1–6 without rewriting old records.
- **Value hierarchy**: make community games immediately watchable; preserve a small auditable trust boundary; keep records reproducible and identity-stable; avoid product-repository write credentials and per-submission deploys.
- **Chosen direction**: publish a versioned catalog and content-addressed replay JSON to the existing `standings` branch. The ready status points to the exact artifact commit. Replay IDs are SHA-256 digests of canonical bytes. Publication is all-or-nothing.
- **Discarded / explicitly absent**: no arbitrary raw-URL replay, submitter-controlled host/repository/branch, product-repo artifact writes, hidden stale fallback, official lane, harness leaderboard/comparison, Codex `default` model inference, or change to the `regret` oracle.

The completed direction trace and human correction that authorize this brief are recorded in `/Users/kei/projects/laplace-main/docs/interrogation/adjudications/2026-07-26-bench-arena-catalog.md` and `/Users/kei/projects/laplace-main/docs/interrogation/adjudications/2026-07-25-bench-matchup-view.md`.

## Outcome

After a community submission merges, the publication workflow verifies the ledger and atomically publishes:

1. `publication-status.json`, a small mutable status document;
2. `arena.json`, an immutable catalog at the status-selected commit; and
3. one immutable, content-addressed replay document for every public game.

LaPlace Main can then list all public matchups and open every game without trusting a URL supplied by the submitter.

## Current State and Problem

- `submit.ts` verifies locally and either pushes directly or opens a fork PR. The base-repository gate verifies and auto-merges accepted submissions.
- `community-publish.yml` verifies all runs and regenerates `standings.json` plus `MATCHUPS.md` on the `standings` branch.
- The current ledger contains six verified games in two runs, but the matchup summary exposes only the two LLM-v-LLM games; no browser replay artifact is published.
- `exportweb.ts` can create a verified browser replay, but its bytes are not deterministic: engine history timestamps and `bench.exported_at` use wall-clock time. Therefore its current output cannot serve as a stable content-addressed artifact.
- `catalog.ts` still advertises product CPU policy `cpu-v4` at levels 1–5 while LaPlace Main's active product CPU is `cpu-v6` at levels 1–6.
- The `regret` command intentionally uses the frozen `cpu-v4` Lv5 oracle. That is a separate analytical contract and must not move with the interactive opponent catalog.

## Source Inventory

Searches before drafting covered `standings`, `MATCHUPS`, `export-web`, `exported_at`, `timestamp`, `autoSubmit`, `community/runs`, `cpu-v4`, `cpu-v6`, `PRODUCT_CPU_POLICY`, `regret`, and `product-cpu` across source, tests, workflows, and docs.

| Source | Classification | Planned treatment |
|---|---|---|
| `community/runs/**` | authoritative verified ledger input | retain; never rewrite old submissions |
| `packages/cli/src/standings.ts` | current v2 catalog implementation | extract shared public-game rules, then remove after compatibility window |
| `packages/cli/src/exportweb.ts` | verified replay exporter with unstable metadata | reuse verification; introduce canonical public export path |
| `packages/cli/src/catalog.ts` | interactive provider/opponent catalog | move product choice to `cpu-v6` Lv1–6 |
| `packages/cli/src/wizard.ts`, `packages/cli/src/cli.ts` play/help text | active current-policy UX | update wizard/example to `cpu-v6` Lv1–6; keep CLI regret default at `cpu-v4` Lv5; remove v2 `standings` help only at compatibility cleanup |
| `packages/cli/src/agents/productcpu.ts` | policy-generic runtime boundary with a v4-only example comment | preserve generic enforcement; make example policy-neutral/current without accepting mismatched checkout identity |
| `packages/cli/src/regret.ts` and `packages/cli/test/regret.test.ts` | frozen oracle contract | preserve `cpu-v4` Lv5 and its explicit fixtures |
| `.github/workflows/community-publish.yml` | current publisher | convert to explicit state + immutable artifact transaction |
| `.github/workflows/community-gate.yml` | submission trust gate | preserve base-only verification and merge boundary |
| `packages/cli/src/submit.ts`, `packages/cli/test/gate-rules.test.ts` | canonical opt-in submission and base-only gate rules | retain; add no submitter URL/artifact authority and do not claim synchronous arena readiness |
| `standings.json`, `MATCHUPS.md` | current v2 outputs | dual-publish temporarily, then remove on scheduled cleanup |
| `packages/cli/test/matchups.test.ts` | active v2 grouping/schema tests plus historical identity fixtures | move grouping fixtures to shared public-classification/arena v1 tests; keep cpu-v4 parsing cases only where they prove old-record identity; delete v2 output assertions at expiry |
| `packages/cli/test/wizard.test.ts` | active current catalog/wizard assertions | update to `cpu-v6`, six choices, and Lv6 plan; retain provider/auth behavior |
| `packages/cli/test/productcpu.test.ts`, `productcpu-client.test.ts`, `fake-product-bridge.cjs` | mixed current real-bridge assertions and generic old-policy fixtures | real/current checkout cases become `cpu-v6` with six tiers; parameterize fake policy; retain explicit v4 fixtures only for old-record/generic policy enforcement |
| `packages/cli/test/token-budget.test.ts` | agent-kind resource semantics with arbitrary v4 sample strings | preserve as identity-history/generic classification fixture; add a v6 current-choice case rather than rewriting every old valid identity |
| `packages/cli/test/verify.test.ts`, `repetition.test.ts` | canonical frozen replay/end-reason regression | retain and extend via public replay tests; do not fork a second legality/repetition implementation |
| top `README.md`, `community/README.md`, `packages/cli/README.md` | active user documentation | document automatic community-to-arena publication, current playable cpu-v6 Lv1–6, and separate frozen v4 regret oracle; replace “manual export is the public list” wording |
| `docs/product-cpu-adapter-v1-spec.md`, `docs/anchor-ladder-v1.md`, `docs/anchor-ladder-v2.md`, `docs/pilot-stage05*.md` | versioned historical experiment/spec records | preserve their cpu-v4 facts as snapshot/history; do not relabel old evidence as v6 |
| `docs/community-lane-v2-context-ja.md`, prior `docs/plans/*`, `docs/interrogation/*` | prior contract/decision history | preserve as snapshot/history; current README and this plan own the new state, not retrospective edits |

## Public Game Semantics

Create one shared, tested classification module used by both legacy v2 generation during transition and the new arena generator.

- `Participant.id` is exactly the current `headlineKey(recordedAgentSpec)`: recognized harnesses
  use their recorded model segment, unnamed/`default` models use the harness, and opaque specs use
  the exact raw spec. Effort and harness never enter this identity. No alias is resolved at publish
  time.
- `Participant.kind` is `llm` when `isLlmSpec` is true, `product-cpu` for the recognized product
  harness, and `baseline` otherwise. `label` comes from the versioned current catalog label for an
  exact known ID (including `LaPlace CPU LvN`); unknown IDs use the ID verbatim. Labels never
  affect grouping or hashes.
- A public matchup contains at least one LLM participant and has distinct normalized headline identities on its two sides.
- CPU-only diagnostics and same-headline self-play stay in the verified ledger but do not enter the default public arena.
- Harness identity remains available in source records but is intentionally not a public grouping dimension in this slice.
- A matchup's `last_played_at` is the maximum verified game end time. Matchups sort descending by that timestamp, with a deterministic matchup-key tiebreaker.
- Games inside a matchup sort descending by verified end time, then by stable run/game identity.
- Catalog totals distinguish `verified_game_count` from `public_game_count`; the product hero must not mistake ledger totals for watchable totals.

Add focused fixtures covering LLM-v-LLM, LLM-v-CPU, CPU-v-CPU, same-model/different-harness self-play, reversed colors, and ties in timestamps.

## Normative cross-repository v1 contract

This section is byte-for-byte normative in both plans. The producer owns the JSON bytes; the
consumer must mirror these exact names and constraints. Unknown object keys are rejected at every
level. Counts are decimal integers in `0..Number.MAX_SAFE_INTEGER`; rates are not published.
Timestamps use UTC RFC3339 with milliseconds (`YYYY-MM-DDTHH:mm:ss.sssZ`). Git SHAs and replay IDs
are lowercase hex. All JSON is UTF-8/LF with one trailing newline.

### `publication-status.json`: `laplace-bench-publication-v1`

```ts
type LastSuccess = {
  source_sha: Hex40;
  artifact_commit: Hex40;
  published_at: Rfc3339Millis;
};

type PublicationStatus = {
  schema: "laplace-bench-publication-v1";
  state: "building" | "ready" | "failed";
  source_sha: Hex40;                 // main commit this attempt represents
  updated_at: Rfc3339Millis;
  last_success: LastSuccess | null;
  artifact_commit?: Hex40;           // required only for ready
  failure_code?: "verify_failed" | "build_failed" | "publish_failed"; // failed only
};
```

State invariants:

- `building`: both optional fields are absent. `last_success` may be null.
- `failed`: `failure_code` is required and `artifact_commit` is absent. `last_success` may be null.
- `ready`: `artifact_commit` is required, `failure_code` is absent, `last_success` is non-null, and
  its `source_sha`/`artifact_commit` exactly equal the top-level pair; `updated_at` equals
  `last_success.published_at`.
- The document is at most 8 KiB. No raw failure text, URL, ref, owner, repository, or path exists.

### `arena.json`: `laplace-bench-arena-v1`

```ts
type Participant = {
  id: string;                         // normalized headline identity, 1..128 ASCII safe chars
  label: string;                      // display label, 1..128 Unicode scalar values, no controls
  kind: "llm" | "product-cpu" | "baseline";
};

type TeamRef = {
  agent: string;                      // recorded full agent spec, 1..256 scalars, no controls
  headline_id: string;                // exactly matchup.left.id or matchup.right.id
};

type SideFailures = {
  format: number;
  legality: number;
  timeout: number;
  token_budget: number;
};

type PublicGame = {
  raw_ref: string;                    // <run-dir>/<game-id>, grammar below
  played_at: Rfc3339Millis;           // verified game_end timestamp
  team_a: TeamRef;
  team_b: TeamRef;
  left_side: "A" | "B";
  winner: "A" | "B" | null;
  reason: "center" | "elimination" | "horizon_draw" | "repetition_draw";
  plies: number;                      // 0..100
  failures: { A: SideFailures; B: SideFailures };
  replay: {
    id: Hex64;                        // SHA-256 of exact replay bytes
    bytes: number;                    // 1..1_048_576 and exact response length
    schema: "laplace-bench-replay-v1";
  };
};

type Condition = {
  left_agent: string;                 // recorded agent mapped to headline left
  right_agent: string;                // recorded agent mapped to headline right
  game_count: number;
  left_wins: number;
  right_wins: number;
  draws: number;
};

type Matchup = {
  id: Hex64;                          // SHA-256(left.id + NUL + right.id)
  left: Participant;
  right: Participant;
  game_count: number;
  left_wins: number;
  right_wins: number;
  draws: number;
  last_played_at: Rfc3339Millis;
  conditions: Condition[];
  games: PublicGame[];
};

type ArenaCatalog = {
  schema: "laplace-bench-arena-v1";
  ruleset: "laplace-8x8-v1";
  lane: "community";
  source_sha: Hex40;
  generated_at: Rfc3339Millis;        // source commit time supplied by workflow
  verified_run_count: number;         // every verified ledger run
  verified_game_count: number;        // every verified ledger game
  public_agent_count: number;         // distinct Participant.id in matchups
  public_game_count: number;          // total nested PublicGame count
  matchups: Matchup[];
};
```

Catalog grammar and bounds:

- `Participant.id` matches `^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,127}$`. In each matchup
  `left.id < right.id` by Unicode-code-point lexical order. The pair must differ.
- If either normalized headline fails that grammar, the game remains in verified totals but is not
  public; one malformed self-reported identity must not abort the complete publication.
- `raw_ref` matches
  `^[A-Za-z0-9][A-Za-z0-9._-]{0,95}/[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`; neither segment is `.`
  or `..`. The audit link is derived from this value plus the fixed repository and `source_sha`.
- At most 1,000 matchups, 500 games and 64 conditions per matchup, and 5,000 public games total.
  `arena.json` is at most 16 MiB. Agent/condition strings use the limits above.
- Matchups are ordered by `last_played_at` descending then `id` ascending. Games are ordered by
  `played_at` descending then `raw_ref` ascending. Conditions are ordered by `left_agent`, then
  `right_agent`, ascending. Payloads arriving out of order are rejected, not silently resorted.
- Every `raw_ref` and replay ID is globally unique. Every public game is nested exactly once.
  Canonical replay bytes include `bench.run_id` and `bench.game_id`, so equal gameplay in two
  records still hashes differently. Any duplicate ID or ref fails the whole publication; no
  cross-game deduplication is permitted.
- Matchup W/D/L, condition W/D/L, dates, matchup IDs, and all top-level counts are recomputed and
  must exactly equal their nested games. `public_agent_count` counts distinct headline IDs; verified
  totals intentionally include non-public baseline-only and same-headline games.
- A public matchup has at least one `llm` participant and two different headline IDs. CPU-only and
  same-headline/harness self-play stay only in verified totals.

### Replay bytes: `laplace-bench-replay-v1`

The top-level replay is exactly:

```ts
type BenchTeamStats = {
  agent: string;
  turns: number;
  moves: number;
  formatFailures: number;
  legalityFailures: number;
  failedTurns: number;
  timeoutSkips: number;
  tokenBudgetSkips: number;
  outputTokens: number;
  cacheReadTokens: number;
  avgLatencyMs: number;
};
type BenchFailure = {
  ply: number;
  attempt: 1 | 2;
  kind: "format" | "legality" | "timeout";
  code?: string;
  team: "A" | "B";
};
type BenchCommentary = {
  ply: number;
  team: "A" | "B";
  color: "Red" | "Blue" | "Yellow" | "Green";
  text: string;
};

type PublicReplay = {
  schema: "laplace-bench-replay-v1";
  history: GameState[];               // exact frozen-engine state shape, length plies + 1
  boardSize: 8;
  winningTeam: "A" | "B" | null;
  bench: {
    file: string;                     // deterministic <run-dir>--<game-id>.json, <=167 chars
    run_id: string;                   // raw_ref run segment
    game_id: string;                  // raw_ref game segment
    team_a: string;                   // equals catalog team_a.agent
    team_b: string;                   // equals catalog team_b.agent
    winner: "A" | "B" | null;       // equals catalog winner/winningTeam
    reason: PublicGame["reason"];
    plies: number;                    // 0..100
    replayed: {
      plies: number;
      reason: PublicGame["reason"];
      turns: { A: number; B: number };
      failures: { A: {format: number; legality: number}; B: {format: number; legality: number} };
    };
    exported_at: Rfc3339Millis;       // verified game_end timestamp, never wall clock
    stats: { A: BenchTeamStats; B: BenchTeamStats };
    failures: BenchFailure[];
    commentary: BenchCommentary[];
  };
};
```

`GameState` is the frozen `laplace-8x8-v1` engine state already consumed by
`GameReplayViewer`; the public validator rejects unknown state keys, non-8x8 boards, invalid player
numbers, malformed moves, inconsistent turns/timestamps, and any terminal state that disagrees
with `bench`/catalog. `history.length` is 1..101. `BenchTeamStats` has exactly the current numeric
fields (`agent`, turns, moves, format/legality/failed turns, timeout/token-budget skips, output/cache
read tokens, average latency); its agent is <=256 scalars and every number is a non-negative safe
integer. `BenchFailure` has exactly `ply`, `attempt`, `kind`, optional `code`, and team; at most 100
entries, `kind`/`code` <=64 ASCII safe chars. `BenchCommentary` has exactly `ply`, team, color, and
text; at most 100 entries and text <=2,500 Unicode scalars. Final replay bytes are 1..1,048,576.
No `learning_file` or unknown metadata field is allowed. Commentary text is at most 2,500 Unicode scalars and must not contain `<`, `>`, or a case-insensitive URI-scheme token matching `\b(?:https?|ftp|file|data|javascript|mailto):`; producer and consumer both reject violations rather than rewriting them.

## Complete publication/consumer state matrix

LaPlace Main exposes this exact envelope on every valid-status response:

```ts
type ProductCatalogEnvelope = {
  schema: "laplace-bench-product-catalog-v1";
  display_state: "ready" | "building" | "failed" | "stale";
  publication: PublicationStatus;
  catalog: ArenaCatalog | null;
};
```

`stale` is a product display state, not an upstream publication state. It means a valid `building`
status whose `updated_at` is more than **900 seconds** old. The product never invents a generation
counter and never compares Git ancestry; producer CI owns monotonicity.

| Upstream/status case | Product catalog API | Catalog selected | Default `/bench` UI | Replay availability |
|---|---|---|---|---|
| `ready`, exact current catalog validates | 200, `ready` | `artifact_commit` | normal current arena | current catalog IDs |
| `building` <=900s, `last_success` present | 200, `building` | last-success commit | “反映中”; shows previous complete records | last-success IDs |
| `building` <=900s, no success | 200, `building`, `catalog:null` | none | first-publication loading/empty shell | none |
| `building` >900s, `last_success` present | 200, `stale` | last-success commit | prominent delayed/stale warning + prior records | last-success IDs |
| `building` >900s, no success | 200, `stale`, `catalog:null` | none | prominent delayed/unavailable-to-date state | none |
| `failed`, `last_success` present | 200, `failed` | last-success commit | prominent publish-failed warning + prior records | last-success IDs |
| `failed`, no success | 200, `failed`, `catalog:null` | none | publish-failed state and submission/help navigation | none |
| status timeout/non-2xx/malformed/oversize; selected catalog missing/malformed/oversize; ready/last-success source mismatch | 502, fixed `{schema:"laplace-bench-product-error-v1",error:"upstream_unavailable"}` | none | unavailable state; no old catalog silently substituted | none |

For any 200 row, `publication` is the exact validated status. If `catalog` is non-null, its
`source_sha` must equal the selected ready/last-success `source_sha`; otherwise the row becomes the
502 case. A valid zero-matchup catalog remains `ready` and renders the honest public-empty state,
not an error.

Exact cache behavior:

- successful `/api/bench/catalog`: `Cache-Control: public, max-age=0, s-maxage=60, must-revalidate`;
- every catalog 4xx/5xx: `Cache-Control: no-store`;
- successful `/api/bench/replay/<id>`: `Cache-Control: public, max-age=31536000, immutable`;
- replay 400/404/502/504: `Cache-Control: no-store`.

Replay lookup re-resolves the accepted envelope. It accepts IDs only from its non-null selected
catalog. A syntactically invalid ID is 400; an unlisted valid ID is 404; timeout is 504; selected
artifact/digest/schema mismatch is 502. Thus the prior complete replay remains watchable during a
valid building/failed/stale state, but network or contract corruption is never hidden as success.

Producer monotonicity is exact: the workflow concurrency group has `cancel-in-progress: false` and
fetches full `main` history. Before writing `building`, it runs
`git merge-base --is-ancestor <last_success.source_sha> <queued-source-sha>`; equality is an
idempotent no-op if already ready, descendants proceed, and a non-descendant/older queued commit
fails without changing status. Before each `standings` push, it fetches the remote branch and uses a
fast-forward compare-and-swap; a changed remote status aborts rather than overwriting newer state.
No numeric generation field is introduced.

## Deterministic Replay Artifacts

Introduce a public replay builder around the existing frozen-engine verification rather than weakening `export-web` checks.

1. Re-verify every source game with the frozen replay engine and reject any mismatch.
2. Canonicalize timestamps from the two verified endpoint times and advance order; current legacy
   move/pass events have no `ts`, so they are never required or invented as source facts. Parse
   `game_start.ts = S` and `game_end.ts = E`, require UTC-millisecond syntax and `E >= S`, and
   require exactly `plies` verified advancing move/pass events. For advancing state `i` in
   `1..plies`, define `T(i) = S + floor((E-S) * i / (plies+1))` milliseconds. State 0 uses S for
   `gameStartedAt`/`turnStartedAt` and null last/end times; state i uses S for `gameStartedAt`,
   `T(i)` for `turnStartedAt`, and the latest move's T (or null before any move) for `lastMoveAt`.
   Only the final state uses E for `gameEndedAt`. Non-decreasing equal T values are valid when the
   interval is shorter than the ply count. `bench.exported_at` and catalog `played_at` are E;
   catalog `generated_at` is the workflow-supplied source commit time. Add golden tests over all
   current community records plus missing/malformed/reversed start/end and ply-count mismatch.
3. Serialize with a single canonical JSON function: fixed property construction, UTF-8, LF, and one trailing newline.
4. Hash the exact emitted bytes with SHA-256; the lowercase 64-hex digest is the replay ID and filename.
5. Enforce the product-agreed 1 MiB maximum on final bytes and the strict public replay invariants: 8×8 board, at most 100 plies, known event/state shapes, consistent terminal metadata, and bounded commentary strings.
6. Export every public game into a temporary directory. If any verification, schema, size, collision, or write check fails, publish no new artifact set.
7. Generate twice with the same workflow-supplied source-commit timestamp and require byte-for-byte identical catalog and replay output.

Canonical bytes include immutable run/game identity. Any repeated `raw_ref` or replay digest,
whether its bytes match or differ, is a whole-publication error. Cross-game deduplication is not
allowed; a SHA-256 collision is therefore fail-closed.

Keep modules single-purpose rather than growing `standings.ts`: for example, public classification/grouping, canonical replay export, catalog assembly/schema validation, and CLI orchestration should be separate files under the 300-line project guideline.

## Workflow Transaction and Failure Semantics

Revise `.github/workflows/community-publish.yml` while retaining least-privilege permissions and current concurrency protection.

1. Checkout the queued `main` source commit with full history and apply the exact ancestry/idempotency
   rule in the state matrix before changing status.
2. Commit a `building` status to `standings`, retaining `last_success`.
3. Verify all runs and build the complete artifact set in a clean temporary directory.
4. Replace the generated catalog/replay subtree and commit it as artifact commit **A**. No mutable status may claim A yet.
5. Commit a `ready` status as commit **B**, with `artifact_commit: A` and a matching `last_success`.
6. If steps 3–5 fail after `building`, a final always-run step commits `failed` with a sanitized code and the unchanged `last_success`. The workflow itself remains failed.

Consumers read mutable status only from the fixed `standings` branch, then read `arena.json` and replay paths from immutable commit A. This removes branch-update races: status commit B can never expose a half-written catalog.

Use a tested status-update script rather than shell-built JSON. Add workflow-level fixtures or
script tests for first publish, success-after-success, failure with last success, failure before
any success, same-SHA idempotent rerun, descendant publish, non-descendant/older rejection with no
status change, and fast-forward compare-and-swap failure.

Publishing must fail closed if branch protection/token permissions cannot record the required state. It must not overwrite a newer successful publication.

## Product CPU Lv6 Alignment

- Change the interactive product opponent constant to `cpu-v6` and expose levels 1 through 6.
- Pin menu values to `level_1..level_6`, labels to `LaPlace CPU Lv1..Lv6`, and declared local
  p95 guidance to `0.25 / 0.25 / 0.50 / 1.20 / 1.80 / 10.00 s` from LaPlace Main's active
  `cpu-v6` registry. Lv6 copy must also warn that hosted latency can be materially slower; do not
  present the declared local p95 as a network SLO.
- Keep the bridge protocol policy-generic and fail closed if checkout identity disagrees with the requested `cpu-v6` policy/commit.
- Preserve old `cpu-v4` records verbatim; their replay depends on recorded moves and the frozen engine, not on rerunning the old product CPU.
- Preserve the `regret` oracle at `cpu-v4` Lv5 and add a regression test that an opponent-catalog update cannot alter it.
- Update CLI README/help and relevant component documentation to distinguish “current playable product CPU” from “frozen regret oracle.”

## CLI and Submission UX

The current opt-in auto-submit flow remains the submission mechanism. Do not make network submission implicit.

- Update the wizard's product CPU choices to Lv1–6 and `cpu-v6`.
- After submission, keep linking to the accepted source record/PR. Do not promise the arena page is ready synchronously; publication is a separate workflow with explicit state.
- A future CLI status link/poll can use the publication contract, but it is not required for this slice.

## Compatibility and Cleanup

1. Add the v1 arena artifacts while continuing to generate `standings.json` and `MATCHUPS.md` from the shared classification code.
2. Verify the new consumer in LaPlace Main against a real immutable artifact commit, including failure/status cases.
3. Switch LaPlace Main's default `/bench` data source to the arena v1 API facade.
4. Keep dual publication for one tagged release or at least seven days, whichever is longer, and monitor consumers documented in repository search.
5. Remove legacy v2 generation and outputs in a separately reviewable cleanup commit after confirming no remaining first-party consumer. Record the removal date in the plan status/update log.

Old community records and their identities are never migrated or rewritten.

## Verification

### Focused and package tests

- public-game classification, ordering, and totals;
- catalog/status valid and invalid contract fixtures;
- replay legality, final result, commentary bounds, 8×8/100-ply/1-MiB limits;
- deterministic double export and digest/filename equality;
- one broken game prevents the whole new artifact set;
- workflow status transitions and stale/out-of-order protection;
- wizard advertises `cpu-v6` Lv1–6;
- `regret` remains `cpu-v4` Lv5;
- old `cpu-v4` records still verify/export.

Run the repository's package test/typecheck commands documented in `package.json`; do not substitute artifact generation for tests.

### Live integration gate

Before declaring implementation complete:

1. publish a test artifact transaction to a non-production branch;
2. inspect status B and confirm its artifact commit A contains the complete catalog and every referenced replay;
3. fetch catalog/replays by immutable raw GitHub commit and independently recompute every SHA-256 digest;
4. simulate `building`, `failed`, malformed, oversized, and missing replay responses with the LaPlace Main resolver;
5. publish the production transaction and confirm the product shows all expected current public games and opens each board.

Sandbox/package-test success is not a substitute for this real GitHub publication and consumer integration check.

## Documentation and Records

- Update this repository's README/component docs for arena publication, CPU Lv6, and the frozen regret exception.
- Update the project design delta log after implementation.
- Record the heavy implementation checkpoint and final implementation review in the required adjudication files.
- Mark this plan `implemented` only after producer publication, product consumption, live integration evidence, and both repositories' documentation are complete.

## Out of Scope

- ✓ official/admin-run lane;
- harness-v-harness presentation and leaderboard;
- inferring the concrete model behind `codex-cli:default`;
- arbitrary external replay URLs or configurable repositories/branches;
- ranking/leaderboard, search, filters, pagination, or user accounts;
- changing the regret oracle or re-identifying historical games.
