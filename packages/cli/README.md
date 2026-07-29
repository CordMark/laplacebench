# LaplaceBench CLI

Run replay-verifiable LAPLACE matches between language models, product CPU
tiers, and fixed baselines. The deterministic `laplace-engine` referee is the
frozen `laplace-8x8-v1` ruleset used by every match.

## Quickstart

```bash
# no clone, install, or API key required to open the wizard
npx laplacebench play
```

Use ↑/↓ and Enter to choose providers, models, an explicit effort, match count,
side swap, and whether to submit the completed run. Choose
`← 前の項目に戻る` to correct an earlier answer; independent later answers are
kept when you revisit them. Press Ctrl+C or Escape to cancel before the match
starts. The submit choice is opt-in even though it is listed first. The
reproducibility seed is chosen internally unless you pass
`--seed` explicitly. Claude Code and Codex adapters use their subscription CLIs;
the baseline agents cost nothing.

For scripts or CI, supply both teams explicitly:

```bash
# baseline example (no model or API cost)
npx laplacebench play --team-a takeshi --team-b greedy --games 2 --swap

# Anthropic API example (needs ANTHROPIC_API_KEY)
export ANTHROPIC_API_KEY=sk-ant-...
npx laplacebench play --team-a anthropic:claude-opus-5 --team-b takeshi \
  --games 2 --swap

# re-summarize a finished run
npx laplacebench summarize runs/<run-id>
```

With `--games` above 1, games run in parallel by default and the CLI says so
at start; pass `--serial` to run them one at a time. Learning agents
(`claude-cli-learn`) always run serially because their strategy notes build
across games. Each turn prints a live progress line
(`[game-000] ply 17/100 B (0,3)→(3,3) | out A 82k/350k · B 61k/350k | 12m03s`)
so long LLM matches stay observable; the token segment appears only for
budget-metered runs.

Agent specs: the published choices are what `laplacebench play` offers in
its menus and what the CLI help prints (both generated from
`src/catalog.ts`, the single canonical catalog). Free-form spec strings
remain accepted beyond the published set — e.g. `takeshi:dN`,
`center-greedy`, `chaos`, or any full model id.

## Product CPU baselines + per-move regret

`product-cpu:cpu-v6:level_N` runs the product's current CPU (six visible
tiers) through a stdlib-only Python bridge — no clone, product checkout,
venv, HTTP server, path, or commit input. Choose **LaPlace CPU** in the wizard
and play. The exact CPU source is bundled in this package and its product
commit is recorded automatically in every run.

Python 3.11 or newer is required. If no supported interpreter is available,
the CLI stops before creating a run and prints installation guidance instead
of silently substituting another agent.

```bash
npx laplacebench play --team-a product-cpu:cpu-v6:level_6 --team-b takeshi:d2 \
  --games 2 --swap --seed 42

# Offline regret deliberately stays on the frozen cpu-v4 Lv5 oracle so old
# and new reports retain one comparison meaning.
npx laplacebench regret runs/<run-id> --oracle product-cpu:cpu-v4:level_5
```

Lv1–Lv6 declared local p95 guidance is 0.25 / 0.25 / 0.50 / 1.20 / 1.80 /
10.00 seconds per move. Hosted Lv6 can be materially slower; these local
measurements are not a network SLO.

Regret follows the oracle's lexicographic preference: the scalar
`regret_value` is only computed when the chosen move shares the best move's
`selectionClass` (nonnegative by construction); class mismatches are counted
separately as categorical blunders (`missed_immediate_win`, `chose_unsafe`).
The frozen cpu-v4 regret oracle is bundled separately from the cpu-v6 play
policy. Every output embeds the oracle identity (spec + product commit +
per-position depth); values are comparable only within the same oracle
generation. Cross-role policy use fails rather than being treated as latest.

## Verify, submit, and spectate

```bash
# deterministically replay a finished run before sharing it
npx laplacebench verify runs/<run-id>

# verify and submit it to the community ledger (needs gh auth)
npx laplacebench submit runs/<run-id>

# local/private replay: export JSON, then drop it on /bench
npx laplacebench export-web runs/<run-id> --out ./replays

# CI publication: complete catalog + content-addressed replay directory
npx laplacebench public-arena community/runs/* --out ./arena \
  --source-sha <40-lowercase-hex> --generated-at <source-commit-rfc3339>
```

When `play` auto-submit or `submit` succeeds, the CLI keeps the GitHub commit
or pull-request URL and also prints one LaPlace Bench replay URL for each game
that is eligible for the public arena. A canonical two-game, side-swapped set
is verified and submitted once after both games finish, then prints two replay
links. You can open a link immediately: it waits for GitHub validation, merge,
and catalog publication for up to five minutes, then starts the replay
automatically. A match that is outside the public arena or fails validation or
publication will not become playable; use the retained GitHub URL to inspect
its submission status.

`export-web` re-plays the event log through the product engine and fails
loudly on any divergence (deterministic replay verification), then emits the
web app's native local replay payload. Community submitters do not copy that
output into the product repository: after merge, CI runs `public-arena`, emits
one deterministic replay per public game, and advances an explicit publication
status only after the complete immutable generation exists. `/bench` lists the
catalog; `/bench/replay?id=<sha256>` resolves only a catalog-listed replay.

Each newly generated arena game also carries
`team_latency_ms: { A, B }`, copied exactly from the validated replay's
per-side `bench.stats.*.avgLatencyMs`. A baseline side is `null` because its
in-process adapter reports no response-time telemetry; measured LLM and
product-CPU sides remain numeric, including a legitimate zero. Older arena
artifacts omit this additive field and remain valid.

## What gets recorded

`runs/<run-id>/` contains `run.json` (config), `games/*/events.jsonl`
(immutable event stream: moves, captures, failures, passes, per-call usage),
`games/*/final.json`, and `summary.json` (W/D/L, win reasons, illegal-move
and format-failure rates per turn, forced passes, normalized provider usage,
telemetry coverage, tokenizer-neutral application I/O bytes, and latency).
Input totals include cached input exactly once. Claude/OpenAI raw token totals
remain descriptive across providers; the formulas and limits are documented
in [usage semantics](https://github.com/keisuke70/laplacebench/blob/main/docs/usage-semantics.md).

Match resource controls:

- `--output-token-budget N`: per team/game, in-game reasoning-inclusive output
  only; default `350000` for matches involving an LLM, with no budget for
  baseline-only matches; an admitted turn may overshoot and still play its move;
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
  laplace-8x8-v1 cap, see [match conduct](https://github.com/keisuke70/laplacebench/blob/main/docs/match-conduct-laplace-8x8-v1.md)) as
  `horizon_draw`, and threefold repetition of the same game-relevant
  state as `repetition_draw`. Draw rates are reported separately by
  cause in summaries and in each matchup breakdown. No adjudication of
  truncated games.
