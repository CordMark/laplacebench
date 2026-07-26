# LaplaceBench Pilot

Cheap discrimination pilot: does Laplace separate frontier models at all?
JSON observations only, persistent per-team contexts, baseline ladder from
the product engine. The referee IS the product engine (`@laplace/game-shared`
via `LAPLACE_APP_ROOT` checkout) — no rule reimplementation.

## Setup

```bash
# one-time: build the product engine, then install here
(cd "$LAPLACE_APP_ROOT/packages/game-shared" && npm run build)
npm install
```

## Run

```bash
# interactive wizard — pick providers/models/effort, auth checked last
npx tsx src/cli.ts play

# scripted / CI: flags (baselines need no API key)
npx tsx src/cli.ts arena --team-a takeshi --team-b greedy --games 2 --swap

# LLM vs baseline (needs ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY=sk-ant-...
npx tsx src/cli.ts arena --team-a anthropic:claude-opus-5 --team-b takeshi \
  --games 2 --swap

# re-summarize a finished run
npx tsx src/cli.ts summarize runs/<run-id>
```

Agent specs: the published choices are what `laplacebench play` offers in
its menus and what the CLI help prints (both generated from
`src/catalog.ts`, the single canonical catalog). Free-form spec strings
remain accepted beyond the published set — e.g. `takeshi:dN`,
`center-greedy`, `chaos`, or any full model id.

## Product CPU baselines + per-move regret

`product-cpu:cpu-v6:level_N` runs the product's current CPU (six visible
tiers) through a stdlib-only Python bridge — no venv, no HTTP server. Arena
play needs the product checkout and a commit pin (fail-closed:
policy/commit/dirty-tree/tier mismatches all refuse to run):

```bash
export LAPLACE_PRODUCT_REPO=/path/to/laplace-main
export LAPLACE_PRODUCT_COMMIT=$(git -C "$LAPLACE_PRODUCT_REPO" rev-parse HEAD)

npx tsx src/cli.ts arena --team-a product-cpu:cpu-v6:level_6 --team-b takeshi:d2 \
  --games 2 --swap --seed 42

# Offline regret deliberately stays on the frozen cpu-v4 Lv5 oracle so old
# and new reports retain one comparison meaning.
npx tsx src/cli.ts regret runs/<run-id> --oracle product-cpu:cpu-v4:level_5
```

Lv1–Lv6 declared local p95 guidance is 0.25 / 0.25 / 0.50 / 1.20 / 1.80 /
10.00 seconds per move. Hosted Lv6 can be materially slower; these local
measurements are not a network SLO.

Regret follows the oracle's lexicographic preference: the scalar
`regret_value` is only computed when the chosen move shares the best move's
`selectionClass` (nonnegative by construction); class mismatches are counted
separately as categorical blunders (`missed_immediate_win`, `chose_unsafe`).
Every output embeds the oracle identity (spec + product commit + per-position
depth); values are comparable only within the same oracle generation.

## Spectating (product web app)

```bash
# local/private replay: export JSON, then drop it on /bench
npx tsx src/cli.ts export-web runs/<run-id> --out ./replays

# CI publication: complete catalog + content-addressed replay directory
npx tsx src/cli.ts public-arena community/runs/* --out ./arena \
  --source-sha <40-lowercase-hex> --generated-at <source-commit-rfc3339>
```

`export-web` re-plays the event log through the product engine and fails
loudly on any divergence (deterministic replay verification), then emits the
web app's native local replay payload. Community submitters do not copy that
output into the product repository: after merge, CI runs `public-arena`, emits
one deterministic replay per public game, and advances an explicit publication
status only after the complete immutable generation exists. `/bench` lists the
catalog; `/bench/replay?id=<sha256>` resolves only a catalog-listed replay.

## What gets recorded

`runs/<run-id>/` contains `run.json` (config), `games/*/events.jsonl`
(immutable event stream: moves, captures, failures, passes, per-call usage),
`games/*/final.json`, and `summary.json` (W/D/L, win reasons, illegal-move
and format-failure rates per turn, forced passes, normalized provider usage,
telemetry coverage, tokenizer-neutral application I/O bytes, and latency).
Input totals include cached input exactly once. Claude/OpenAI raw token totals
remain descriptive across providers; the formulas and limits are documented
in [usage semantics](../../docs/usage-semantics.md).

Match resource controls:

- `--output-token-budget N`: per team/game, in-game reasoning-inclusive output
  only; an admitted turn may overshoot and still play its move;
- `--turn-timeout-ms N`: one deadline shared by both attempts in a turn
  (default `1200000` for LLM matches — a hang backstop, not the fairness
  instrument — and `300000` otherwise); expiry advances the product turn
  as a timeout pass.

Post-game learning is participant-owned harness activity and is excluded from
the match wallet and match usage summary.

## Design notes

- Ruleset `laplace-8x8-v1` (elimination threshold fixed at 3). Rulebook
  given to models: [rulebook/laplace-8x8-v1.md](rulebook/laplace-8x8-v1.md).
- Models never see legal moves (state-only, full-once rulebook condition).
- Failure policy: one corrective chance per turn (error code only, no
  explanation), second failure = pass; two consecutive passes eliminate the
  color (product timeout semantics).
- LLM adapter: one append-only conversation per team per game; prompt
  caching on the system rulebook + newest turn; adaptive thinking; no
  sampling params (rejected by current models); deliberately no refusal
  fallbacks — failures must score against the model under test.
- Draws: horizon cap (`--max-plies`, default 100 — the canonical
  laplace-8x8-v1 cap, see `docs/match-conduct-laplace-8x8-v1.md`) as
  `horizon_draw`, and threefold repetition of the same game-relevant
  state as `repetition_draw`. Draw rates are reported separately by
  cause in summaries and in each matchup breakdown. No adjudication of
  truncated games.
