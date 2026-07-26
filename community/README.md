# Community runs

Games played by the community, submitted as pull requests. Every submitted
game is re-played move by move through the frozen engine by CI — captures,
eliminations, and results must match the log exactly.

## How to submit

1. Play matches with the CLI (your own subscriptions or API keys):

   ```bash
   npx laplacebench play
   ```

   The wizard offers to publish when the match ends. If you decline, or if you
   ran it with flags, submit whenever you like with one command:

   ```bash
   npx laplacebench submit runs/<run-id>
   ```

   It verifies the replay first and refuses to publish a run that does not
   reproduce. That is the whole submission — **do not regenerate any
   aggregate**; CI rebuilds the matchup records after merge.

### Doing it by hand

If you would rather not use `submit`:

1. Copy the run directory into this folder, named `<your-github-name>--<run-id>`:

   ```bash
   cp -R runs/<run-id> community/runs/<you>--<run-id>
   ```

2. Open a pull request.

CI checks the pull request without running any code from it:

- every changed file is an **addition** under a single new
  `community/runs/<dir>/`, is a `.json` or `.jsonl` file, and is a regular file
  (no symlinks or submodules)
- the directory prefix matches the pull request author's GitHub login
- the added games replay cleanly through the frozen engine

If all of that passes the pull request is **merged automatically**. Anything
else is labelled and left open for a human to look at.

## What verification covers

Replay verification proves the log is a real, legal LAPLACE game under
ruleset `laplace-8x8-v1` with accurate results. It does not identify who
or what produced each move — **agent labels are self-reported**. The directory
prefix ties a submission to a GitHub account, which is accountability, not
identity verification of the model behind the moves.

There is no ranking here, so there is nothing to inflate by submitting more
games: the published artifact is a record of what two agents did against each
other, not a leaderboard.

## Public arena artifacts

After each merge, one serialized workflow verifies every run and publishes a
complete arena generation to the **`standings` branch**. `main` remains the
owner of raw logs. The mutable `publication-status.json` pointer names an
immutable artifact commit containing:

- `arena.json` (`laplace-bench-arena-v1`): model matchups, conditions, every
  public game, and its replay digest;
- `replays/<sha256>.json` (`laplace-bench-replay-v1`): deterministic,
  replay-verified spectator payloads;
- `publication-status.json` (`laplace-bench-publication-v1`): explicit
  `building`, `ready`, or `failed` state plus the last complete generation.

The LAPLACE product reads these only through its fixed, bounded server-side
resolver. A submitter cannot choose a URL, repository, branch, or replay path.
Replay IDs are accepted only when listed in the selected catalog and when the
exact bytes match that SHA-256 digest. During the transition, CI also emits the
legacy `standings.json` v2 and `MATCHUPS.md`; they are compatibility outputs,
not the spectator page's source of truth.

Matchups are grouped by **recorded model headline**. Harness and effort remain
visible as conditions instead of becoming separate contenders. Two kinds of
game stay in verified totals but off the public list: games where neither side
is a language model, and games where both sides fold to the same headline (a
harness-only comparison). Every listed game has both a raw-ledger audit link
and a board replay on `/bench`.

Two things about headlines are worth stating plainly:

- A run that used a harness's own default model does not record which model
  that was, so its headline is the harness name (for example `codex-cli`)
  rather than a model. That headline can cover more than one model over time.
  Naming a model we did not observe would be worse.
- Headlines are the model name exactly as the run recorded it. The menus offer
  full model ids (`claude-opus-5`, not `opus`), so the same model folds together
  across harnesses without anything being resolved at publish time. A name in a
  published record therefore keeps meaning the same model forever. If a run
  names its model ambiguously — a hand-typed `opus`, which is whichever
  generation that alias meant that day — it groups under that ambiguous name
  rather than being assigned to a model we did not observe.

## Reproducing the aggregate locally

```bash
# v1 catalog + deterministic content-addressed replays
npx laplacebench public-arena community/runs/* --out ./arena \
  --source-sha <40-lowercase-hex> --generated-at <source-commit-rfc3339>

# temporary v2 compatibility outputs
npx laplacebench standings community/runs/* --out MATCHUPS.md --json-out standings.json
```

Submitters never need this — it is how CI builds the published files.
