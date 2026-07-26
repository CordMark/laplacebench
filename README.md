# LaplaceBench

**An open arena where language models compete at a board game nobody knows.**

LAPLACE is a novel 8x8, four-color, 2-vs-2 strategy game (rook movement,
sandwich/enclosure captures, Void pieces, two victory routes). Because it is
absent from training data, a match measures what we actually care about:
learning unfamiliar rules cold, tracking a full board over a long game,
coordinating two allied armies with one mind, and returning reliable
structured actions — with a deterministic referee deciding everything.

One model controls Red+Yellow, the other Blue+Green: the native 2v2 game
becomes a clean model-vs-model duel. Models never click a browser; they read
an observation and return coordinates. Humans get the browser: every game
exports (replay-verified) into a spectator web UI with the product board,
animations, and per-model reliability stats.

## Scope: this is a model benchmark

What varies between the two sides of a match is **the model**. Both sides read
the same rulebook, get the same observation, answer through the same protocol
under the same resource policy, and are judged by the same referee. Adapters
differ where a provider requires it — a Claude CLI match and a Codex CLI match
cannot share one adapter — so each side's adapter and effort are declared and
carried as a labeled condition. That is the comparison this project makes, and
every public record here is a model-versus-model record.

Deliberately outside that scope for now:

- **Harness engineering as a contest.** Fixing the model and letting authors
  submit their own agent design — memo formats, self-check passes,
  candidate-move debates, prompt packs — is a real competition, and it is not
  what this benchmark measures. The design notes survive, marked deferred, in
  [experiment axes §3](docs/experiment-axes-ja.md) and
  [public platform strategy §1/§5](docs/public-platform-strategy-ja.md).
- **The learning series** is the one probe we ran into that territory: same
  model, same effort, the only difference being a post-game analysis pass that
  rewrites a strategy document for the next game. It answered its question —
  a harness moves results, and the failures it exposed were harness-design
  failures rather than model failures ([Run 7 in
  FINDINGS](packages/cli/FINDINGS.md)) — and is now parked. The adapter still
  runs (`claude-cli-learn:<model>@<effort>`), but it is not a lane, it is not
  on the public arena, and its games are never counted as model-versus-model
  results.
- **Vendor CLI harness prompts** cannot be removed when you play through a
  subscription CLI, so those matches stay labeled as their own condition
  rather than treated as clean-model runs.

The set of *events* inside the model benchmark is expected to grow. One
candidate already on the table: give each of a team's two colors its own
context and its own request thread, so allies can no longer be coordinated by
a single mind and the benchmark measures how well a model shares intent with a
partner that cannot read its thoughts. Today's base condition — one model, one
context, both of its colors — stays the reference point.

## What exists today

- **Deterministic referee** — the frozen product engine
  ([`laplace-engine`](packages/engine)); package version = immutable ruleset
  ID (`laplace-8x8-v1`). Zero runtime deps.
- **CLI** ([`packages/cli`](packages/cli)) — full matches with a baseline
  ladder (`random`, `greedy`, `center-greedy`, minimax `takeshi`),
  persistent-context LLM adapters, side-swapped schedules, JSONL event logs,
  and replay-verified export to the spectator UI.
- **Subscription-driven play**: adapters that drive the Claude Code CLI
  (`claude-cli:<model>@<effort>`) and Codex CLI (`codex-cli:...`) — if you
  already pay for Claude or ChatGPT, you can run frontier-model matches with
  **no API key and no per-token cost**. A clean Anthropic API adapter
  (`anthropic:<model>`) exists for verified runs.
- **Learning series (parked probe)**: a post-game analysis skill that audits
  losses and missed captures from the referee's ground-truth record and
  maintains a format-constrained strategy document injected into the next
  game. Runnable and documented, but out of scope as a benchmark lane — see
  [Scope](#scope-this-is-a-model-benchmark) and
  [FINDINGS](packages/cli/FINDINGS.md).

## Quickstart

No clone, no install, no API key:

```bash
# watch the baseline ladder fight (no LLM needed)
npx laplacebench arena --team-a takeshi --team-b center-greedy --games 2 --swap

# with a Claude subscription (Claude Code CLI installed & logged in)
npx laplacebench arena --team-a claude-cli:claude-sonnet-5@low --team-b takeshi --games 2 --swap

# frontier vs frontier on your own subscriptions
npx laplacebench arena \
  --team-a claude-cli:claude-fable-5@medium --team-b codex-cli:gpt-5.6-sol@medium \
  --games 2 --swap

# verify any run's log against the frozen engine, or share it
npx laplacebench verify runs/<run-id>
npx laplacebench export-web runs/<run-id> --out ./replays
```

Watch your exported games by dropping the replay JSON onto the public
spectator page (`/bench` on the LAPLACE site) — playback is fully
client-side. To submit games to the community lane, see
[community/README.md](community/README.md). Once an accepted submission lands,
CI verifies the complete ledger and publishes a content-addressed arena catalog;
the same `/bench` page then lists every public model matchup and opens each game
on the board without a manual `export-web` copy.

For development, clone and `npm install && npm run build`, then use
`npx tsx packages/cli/src/cli.ts ...` in place of `npx laplacebench ...`.

Every run writes `runs/<id>/` with an immutable event stream, per-game
results, and a metrics summary (W/D/L, win reasons, illegal-move and
format-failure rates, normalized provider usage with reporting coverage,
application I/O bytes, and latency). Cross-provider token totals are
descriptive only; see [usage semantics](docs/usage-semantics.md).
`export-web` re-plays the log
through the engine (failing loudly on any divergence) and emits spectator
replay JSON.

## Integrity lanes

- **Self-serve**: run anything locally on your own subscriptions.
- **Community (unverified)**: shared logs are replay-verified structurally,
  but nothing can prove which model produced the text — labeled accordingly.
- **Official (not active)**: a future maintainer-run lane may carry stronger
  model-identity claims. Today the public arena is the self-reported community
  lane and does not display an official checkmark.
- Subscription-CLI matches carry each vendor's harness prompt — always
  labeled as a distinct condition from clean API runs.

## Documentation

- [Rulebook given to models](packages/cli/rulebook/laplace-8x8-v1.md)
- [Design v0.1](docs/design-v0.1.md) — tracks, metrics, failure policy,
  contamination resistance
- [Usage semantics](docs/usage-semantics.md) — Claude/OpenAI cache accounting,
  reporting coverage, and the cross-provider comparison boundary
- [Benchmark strategy (JA)](docs/benchmark-strategy-ja.md) — statistical
  power, red-team notes, launch plan
- [Experiment axes (JA)](docs/experiment-axes-ja.md) — modality, context, and
  coordination conditions, plus the deferred harness-engineering division
- [Public platform strategy (JA)](docs/public-platform-strategy-ja.md) —
  participation funnel and trust lanes; its competitive harness tier is
  deferred with the rest of that scope
- [Findings log](packages/cli/FINDINGS.md) — every run analyzed, including
  the harness bugs we caught and the failure modes we found
- [Anchor ladder v1](docs/anchor-ladder-v1.md) — the fixed baseline ordering
  (random/greedy/center-greedy/takeshi:dN) used to keep ratings comparable
  as models come and go
- [Product CPU adapter spec (design only)](docs/product-cpu-adapter-v1-spec.md)
  — naming/interface prepared for importing a future product CPU baseline
- [Model protocol schemas](schemas/)

## Status

Early but real: the referee, ladder, adapters, automatic community arena
publication, and spectator replay are running today; the discrimination pilot
found measurable differences between frontier models on three independent
axes. Statistical sample sizes and the vision (board-image) track are the
active roadmap. Further model-benchmark events may follow it; the
split-context coordination condition described under
[Scope](#scope-this-is-a-model-benchmark) is the leading candidate, not a
committed one.
