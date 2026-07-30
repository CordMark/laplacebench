# LaplaceBench

**Two models, one board, a frozen referee — head-to-head results, not
leaderboard scores.**

Benchmark numbers are getting harder to trust: fixed test sets leak into
training corpora and become optimization targets, and a rising score stops
meaning what it claimed to mean. LaplaceBench takes the opposite shape.
Instead of an answer key there is an opponent, and instead of a score there
is a head-to-head result — win, loss, or the occasional draw — decided move
by move by a deterministic referee and replayable by anyone. And the game
itself is clean: as of `laplace-8x8-v1` (July 2026), we know of no games, no
opening theory, and no discussion of LAPLACE outside this project — nothing
for a model to have memorized. If that ever stops being true, it will mean this benchmark
became famous enough to enter training pipelines — a success worth having —
and the ruleset is versioned so the game simply moves on.

The game is LAPLACE, a novel 8x8, four-color, 2-vs-2 strategy game. Pieces
move like rooks. A capture takes every piece caught in a straight line
between two pieces of a single color — your teammate's pieces included — and
a piece sealed off from every move it has also falls. A color that loses
three pieces is eliminated; its survivors become Voids, still mobile and
still capturable but unable to capture. Two roads to victory: occupy the
four center squares as a team, or eliminate both enemy colors. One model
commands Red+Yellow, the other Blue+Green — one mind runs two armies that
can never combine for a capture — so the native 2v2 game becomes a clean
model-vs-model duel.

Models never click a browser; they read an observation and return
coordinates. Humans get the browser: every game exports (replay-verified)
into a spectator web UI with the product board, animations, and per-model
reliability stats.

## What a match measures

Both sides get the same rulebook and the same view of the board — no list of
legal moves, no hints. From there, one game exercises several sides of a
model at once, and the logs keep them separate:

- **Reading rules cold** — legality has to be derived from the rulebook
  prose; every illegal attempt is recorded and scored.
- **Running two armies with one mind** — a team's two colors act on
  alternating turns and can never combine for a capture, and a careless
  line-up hands the opponent your own pieces.
- **Strategy without theory** — two victory routes (center or elimination),
  an opponent whose plan has to be read, and no opening book anywhere to
  remember.
- **Staying reliable over a long game** — dozens of turns in one continuous
  conversation, every reply required as well-formed coordinates; format
  failures are scored, not forgiven.

## Scope: this is a model benchmark

What varies between the two sides of a match is **the model**. Both sides read
the same rulebook, get the same observation, answer through the same protocol
under the same resource policy, and are judged by the same referee. Adapters
differ where a provider requires it — a Claude CLI match and a Codex CLI match
cannot share one adapter — so each side's adapter and effort are declared and
carried as a labeled condition. That is the comparison this project makes, and
every public record here is a model-versus-model record.

Deliberately outside the **Model Arena** scope:

- **Harness engineering as a model score.** Fixing the model and changing memo
  formats, self-check passes, candidate-move debates, or prompt packs does not
  produce a model-versus-model record. That direction has been reopened only as
  a separately labeled **Harness Lab**, currently at the design stage; it has
  its own harness × model identity, future tab, and unresolved participation
  model. Each side may choose the same model for a controlled harness
  comparison or a different model for an explicitly labeled system matchup.
  See [Harness Lab direction (JA)](docs/harness-lab-direction-ja.md).
- **The learning series** is the one probe we ran into that territory: same
  model, same effort, the only difference being a post-game analysis pass that
  rewrites a strategy document for the next game. Across four games, outcomes
  differed and it exposed harness-design failure modes rather than model
  failures, making it useful preliminary evidence for the Harness Lab
  direction — not proof of a harness effect or its individual causes ([Run 7
  in FINDINGS](packages/cli/FINDINGS.md)). The adapter still runs
  (`claude-cli-learn:<model>@<effort>`), and a turn-reset variant
  (`codex-cli-reset:<model>@<effort>` — fresh context every turn) exists for
  controlled context-lifetime ablations, but neither is a public lane: the
  `PUBLIC_MATCHUP_HARNESSES` allowlist keeps every harness-conditioned match —
  same-model or cross-model — out of the default public matchups, so their
  games are never counted as model-versus-model results.
- **Vendor CLI harness prompts** cannot be removed when you play through a
  subscription CLI, so those matches stay labeled as their own condition
  rather than treated as clean-model runs. Subscription-CLI matches now run
  **clean-room by default**: an isolated config home carrying only your auth
  material, an allowlisted child environment, suppression flags, and a
  fail-closed canary preflight, all recorded in the run's `isolation`
  manifest alongside the CLI version. `--ambient-cli-env` opts back into the
  legacy environment-copying condition, recorded as its own label. Clean-room
  certifies personal-config isolation — it does not by itself make a run
  "official verified" (nothing local can prove which model produced the
  text).

The set of *events* inside the model benchmark is expected to grow. LAPLACE
is at heart a 2v2 team game, and today's base condition flattens that: one
model plays both of its team's colors in one context. The leading candidate
event restores the native team structure — each color gets its own model and
its own conversation, four minds on one board, allies who cannot read each
other's thoughts — turning the same game into a measure of how well a model
shares intent with a partner. A board-image (vision) track is on the same
roadmap, and the separately scoped Harness Lab direction could eventually
become its own labeled contest. Today's base condition stays the reference
point.

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
- **Learning series (prior harness probe)**: a post-game analysis skill that audits
  losses and missed captures from the referee's ground-truth record and
  maintains a format-constrained strategy document injected into the next
  game. Runnable and documented, but out of scope as a Model Arena lane and
  not yet promoted into a public Harness Lab lane — see
  [Scope](#scope-this-is-a-model-benchmark), [Harness Lab direction
  (JA)](docs/harness-lab-direction-ja.md), and
  [FINDINGS](packages/cli/FINDINGS.md).

## Quickstart

No clone, no install, no API key:

```bash
# pick the models, efforts and settings from menus, then play
npx laplacebench play

# the same thing without the menus — for scripts, or when you know the specs
npx laplacebench play --team-a takeshi --team-b center-greedy --games 2 --swap

# with a Claude subscription (Claude Code CLI installed & logged in)
npx laplacebench play --team-a claude-cli:claude-sonnet-5@low --team-b takeshi --games 2 --swap

# frontier vs frontier on your own subscriptions
npx laplacebench play \
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
- **Official (not active)**: a future maintainer-run API or clean-room CLI lane
  may carry stronger model-identity claims. The clean-room mechanics (personal
  configuration disabled and canary-verified, provider CLI version recorded in
  the `isolation` manifest) are implemented and on by default for
  subscription-CLI runs; what remains for an official lane is the trusted
  executor. Today the public arena is the self-reported community lane and
  does not display an official checkmark.
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
  coordination conditions, plus the separately scoped harness-engineering axis
- [Harness Lab direction (JA)](docs/harness-lab-direction-ja.md) — separate
  Model Arena/Harness Lab tabs, harness-difference presentation, allowed
  capability levels, and unresolved submission/matchmaking questions
- [Public platform strategy (JA)](docs/public-platform-strategy-ja.md) —
  participation funnel, trust lanes, and the Harness Lab's place outside the
  Model Arena
- [Findings log](packages/cli/FINDINGS.md) — every run analyzed, including
  the harness bugs we caught and the failure modes we found
- [Anchor ladder v1](docs/anchor-ladder-v1.md) — the fixed baseline ordering
  (random/greedy/center-greedy/takeshi:dN) used to keep ratings comparable
  as models come and go
- [Bundled Product CPU adapter](docs/product-cpu-adapter-v1-spec.md)
  — cpu-v6 play and the frozen cpu-v4 regret oracle ship with the CLI
- [Model protocol schemas](schemas/)

## Status

Early but real: the referee, ladder, adapters, automatic community arena
publication, and spectator replay are running today; the discrimination pilot
found measurable differences between frontier models on three independent
axes. Statistical sample sizes and the vision (board-image) track are the
active roadmap. Further model-benchmark events may follow it; the
split-context coordination condition described under
[Scope](#scope-this-is-a-model-benchmark) is the leading candidate, not a
committed one. The separately scoped Harness Lab has a documented direction
but no implemented public tab, submission system, or active competition.
