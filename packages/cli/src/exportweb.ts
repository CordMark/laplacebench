import "./env";
import * as fs from "node:fs";
import * as path from "node:path";
import { newGame, playerTeam, repetitionKey, winReason } from "./engine";
import { MAX_COMMENTARY_SCALARS } from "./publicarena-contract";
import { COLOR_NAMES } from "./types";

function appRoot(): string {
  const root = process.env.LAPLACE_APP_ROOT;
  if (!root) {
    throw new Error(
      "export-web needs the LAPLACE web app to export into. Set LAPLACE_APP_ROOT to your Laplace product checkout, or pass --out <dir> to write the replay JSON files anywhere."
    );
  }
  return root;
}

interface BenchTeamStats {
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
}

interface BenchFailure {
  ply: number;
  attempt: number;
  kind: string;
  code?: string;
  team: "A" | "B";
}

interface BenchCommentary {
  ply: number;
  team: "A" | "B";
  color: string;
  text: string;
}

interface BenchMeta {
  file: string;
  run_id: string;
  game_id: string;
  team_a: string;
  team_b: string;
  winner: "A" | "B" | null;
  reason: string;
  plies: number;
  /** Values recomputed from the replay, independent of the log's own summary. */
  replayed?: {
    plies: number;
    reason: string | null;
    turns: { A: number; B: number };
    failures: {
      A: { format: number; legality: number };
      B: { format: number; legality: number };
    };
  };
  exported_at: string;
  stats?: { A: BenchTeamStats; B: BenchTeamStats };
  failures?: BenchFailure[];
  commentary?: BenchCommentary[];
  /** Present when the run has a learning series: file with strategy-doc versions. */
  learning_file?: string;
}

/**
 * What a move event publishes as spectator commentary, decided by whether the
 * log carries a `note` at all — never by a generation string, so no exporter
 * has to read `prompt_rev`:
 *
 * - no `note` field: a log recorded before the note was required. Its `raw`
 *   reply is all there is, and dropping it would silently erase the commentary
 *   of every already-published game in the append-only ledger.
 * - `note` present and non-empty: publish the note. The adopted move JSON has
 *   already been removed from it.
 * - `note` present and empty: the model was required to write one and did not.
 *   Publish nothing, so the viewer shows "no record for this move" — the truth.
 *   Falling back to `raw` here would publish the bare move JSON as if it were
 *   the model's reasoning.
 */
export function moveCommentary(event: { raw?: unknown; note?: unknown }): string {
  // Own-property presence, not `typeof === "string"`: a malformed `note: null`
  // is a log that HAS the field, so falling through to `raw` would publish the
  // bare move JSON as if it were the model's reasoning. Present-but-unusable
  // fails closed to no commentary.
  if (Object.prototype.hasOwnProperty.call(event, "note")) {
    return typeof event.note === "string" ? event.note.trim() : "";
  }
  return typeof event.raw === "string" ? event.raw.trim() : "";
}

/**
 * Re-plays a game's events.jsonl through the product engine (the same
 * referee that scored it) and emits the web app's replay payload:
 * {history: GameState[], boardSize, winningTeam}. Because the states are
 * regenerated rather than copied, this doubles as deterministic replay
 * verification — any divergence between the log and the re-play (captures,
 * eliminations, winner) fails the export loudly.
 */
export function exportGame(
  runDir: string,
  gameId: string
): { payload: object; meta: BenchMeta } {
  const runId = path.basename(runDir);
  const gameDir = path.join(runDir, "games", gameId);
  const events = fs
    .readFileSync(path.join(gameDir, "events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const start = events.find((e) => e.t === "game_start");
  const end = events.find((e) => e.t === "game_end");
  if (!start || !end) throw new Error(`${gameId}: missing game_start/game_end`);

  const manager = newGame();
  const history: object[] = [manager.getState() as unknown as object];
  const failures: BenchFailure[] = [];
  const commentary: BenchCommentary[] = [];
  // Turns each side actually took, counted from the replay rather than from the
  // log's own tally.
  const turnsTaken = { A: 0, B: 0 };
  // Threefold repetition is one of the four published endings, so it has to be
  // observed here rather than taken from the log's word for it.
  const seenStates = new Map<string, number>();
  const countState = () => {
    const key = repetitionKey(manager.state);
    seenStates.set(key, (seenStates.get(key) ?? 0) + 1);
  };
  countState();

  for (const e of events) {
    if (e.t === "move") {
      const text = moveCommentary(e as { raw?: unknown; note?: unknown });
      if (text) {
        commentary.push({
          ply: e.ply,
          team: playerTeam(e.player),
          color: COLOR_NAMES[e.player - 1],
          // Scalar-safe, and the same boundary publication enforces: a
          // UTF-16 slice here could split a surrogate pair and would cut
          // astral text short of the shared limit.
          text: [...text].slice(0, MAX_COMMENTARY_SCALARS).join(""),
        });
      }
    }
    if (e.t === "failure") {
      failures.push({
        ply: e.ply,
        attempt: e.attempt,
        kind: e.kind,
        code: e.code,
        team: playerTeam(manager.state.currentPlayer),
      });
    }
    if (e.t === "move") {
      // Whoever the engine says is on move — a logged `player` that disagreed
      // would otherwise shift turns (and so the published error rate) between
      // the two sides without making a single move illegal.
      const acting = playerTeam(manager.state.currentPlayer);
      const res = manager.makeMove(e.from[0], e.from[1], e.to[0], e.to[1]);
      if (!res.valid) {
        throw new Error(
          `${gameId} ply ${e.ply}: logged move ${JSON.stringify(e.from)}->${JSON.stringify(e.to)} rejected on re-play (${res.message})`
        );
      }
      const replayCaps = (res.state.lastMove?.capturedPiecesMeta ?? [])
        .map((c) => `${c.position[0]},${c.position[1]}:${COLOR_NAMES[c.player - 1]}`)
        .sort();
      const loggedCaps = (e.captures ?? [])
        .map((c: any) => `${c.at[0]},${c.at[1]}:${c.owner}`)
        .sort();
      if (JSON.stringify(replayCaps) !== JSON.stringify(loggedCaps)) {
        throw new Error(
          `${gameId} ply ${e.ply}: capture mismatch on re-play. logged=${JSON.stringify(loggedCaps)} replayed=${JSON.stringify(replayCaps)}`
        );
      }
      turnsTaken[acting]++;
      history.push(manager.getState() as unknown as object);
      countState();
    } else if (e.t === "pass") {
      turnsTaken[playerTeam(manager.state.currentPlayer)]++;
      manager.advanceTurn();
      history.push(manager.getState() as unknown as object);
      countState();
    }
  }

  const finalState = manager.state;
  if ((finalState.winningTeam ?? null) !== (end.winner ?? null)) {
    throw new Error(
      `${gameId}: winner mismatch. logged=${end.winner} replayed=${finalState.winningTeam}`
    );
  }
  for (let p = 1; p <= 4; p++) {
    const logged = end.losses?.[COLOR_NAMES[p - 1]];
    if (logged !== undefined && logged !== finalState.capturedPieces[p - 1]) {
      throw new Error(
        `${gameId}: loss-count mismatch for ${COLOR_NAMES[p - 1]}: logged=${logged} replayed=${finalState.capturedPieces[p - 1]}`
      );
    }
  }

  let stats: BenchMeta["stats"];
  const finalPath = path.join(gameDir, "final.json");
  if (fs.existsSync(finalPath)) {
    const fin = JSON.parse(fs.readFileSync(finalPath, "utf8"));
    const toStats = (t: any): BenchTeamStats => ({
      agent: t.agent,
      turns: t.turns,
      moves: t.moves,
      formatFailures: t.formatFailures,
      legalityFailures: t.legalityFailures,
      failedTurns: t.failedTurns,
      timeoutSkips: t.timeoutSkips ?? 0,
      tokenBudgetSkips: t.tokenBudgetSkips ?? 0,
      outputTokens: t.outputTokens,
      cacheReadTokens: t.cacheReadTokens,
      avgLatencyMs: t.actCalls > 0 ? Math.round(t.latencyMs / t.actCalls) : 0,
    });
    stats = { A: toStats(fin.teams.A), B: toStats(fin.teams.B) };
  }

  // Derived from the replay itself, not from the log's own summary. `plies` is
  // the number of turns actually re-played; the per-side failure counts come
  // from the failure events attributed to whoever was on move at the time.
  // The exact ending, derived rather than believed. Precedence matches the
  // referee's: a decided game first, then threefold repetition, then the cap.
  const repeated = [...seenStates.values()].some((n) => n >= 3);
  const replayedReason = finalState.winningTeam
    ? winReason(finalState, false)
    : repeated
      ? "repetition_draw"
      : "horizon_draw";

  const replayed = {
    // `history` opens with the starting position, so the played turns are one
    // fewer than its length.
    plies: history.length - 1,
    reason: replayedReason,
    turns: { A: turnsTaken.A, B: turnsTaken.B },
    failures: {
      A: {
        format: failures.filter((f) => f.team === "A" && f.kind === "format").length,
        legality: failures.filter((f) => f.team === "A" && f.kind === "legality").length,
      },
      B: {
        format: failures.filter((f) => f.team === "B" && f.kind === "format").length,
        legality: failures.filter((f) => f.team === "B" && f.kind === "legality").length,
      },
    },
  };

  const meta: BenchMeta = {
    file: `${runId}--${gameId}.json`,
    run_id: runId,
    game_id: gameId,
    team_a: start.team_a,
    team_b: start.team_b,
    winner: end.winner ?? null,
    reason: end.reason,
    plies: end.plies,
    replayed,
    exported_at: new Date().toISOString(),
    stats,
    failures,
    commentary,
  };

  const payload = {
    history,
    boardSize: 8,
    winningTeam: end.winner ?? null,
    bench: meta,
  };
  return { payload, meta };
}

export interface RunVerification {
  games: number;
  failures: { gameId: string; message: string }[];
}

/**
 * The `final.json` fields the published records are actually built from, and
 * therefore the ones a replay has to agree with. Everything else in that file
 * is per-side telemetry that no public claim rests on.
 */
function checkFinalMatchesReplay(
  runDir: string,
  gameId: string,
  meta: BenchMeta
): void {
  const finalPath = path.join(runDir, "games", gameId, "final.json");
  if (!fs.existsSync(finalPath)) {
    throw new Error("final.json is missing");
  }
  const fin = JSON.parse(fs.readFileSync(finalPath, "utf8"));
  const r = meta.replayed;
  const expected: Record<string, unknown> = {
    winner: meta.winner,
    // The exact ending the replay reached, not the logged one: standings
    // publishes centre wins, eliminations, horizon draws and repetition draws
    // as separate counts, so a within-class swap is a forgeable claim too.
    reason: r?.reason,
    plies: r?.plies,
    "teams.A.agent": meta.team_a,
    "teams.B.agent": meta.team_b,
    "teams.A.formatFailures": r?.failures.A.format,
    "teams.A.legalityFailures": r?.failures.A.legality,
    "teams.B.formatFailures": r?.failures.B.format,
    "teams.B.legalityFailures": r?.failures.B.legality,
    // The denominator of the published error rate: inflating it would quietly
    // shrink the rate, so it is pinned to the turns actually replayed.
    "teams.A.turns": r?.turns.A,
    "teams.B.turns": r?.turns.B,
  };
  const actual: Record<string, unknown> = {
    winner: fin.winner ?? null,
    reason: fin.reason,
    plies: fin.plies,
    "teams.A.agent": fin.teams?.A?.agent,
    "teams.B.agent": fin.teams?.B?.agent,
    "teams.A.formatFailures": fin.teams?.A?.formatFailures,
    "teams.A.legalityFailures": fin.teams?.A?.legalityFailures,
    "teams.B.formatFailures": fin.teams?.B?.formatFailures,
    "teams.B.legalityFailures": fin.teams?.B?.legalityFailures,
    "teams.A.turns": fin.teams?.A?.turns,
    "teams.B.turns": fin.teams?.B?.turns,
  };
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `final.json disagrees with the replay on ${key}: ` +
          `recorded=${JSON.stringify(actual[key])} replayed=${JSON.stringify(expected[key])}`
      );
    }
  }
}

/**
 * Replay every game in a run through the frozen engine. Single owner of "is
 * this run sound?" — the CLI reports the whole list, `submit` refuses to
 * publish when it is non-empty, and CI uses the same command. A second
 * implementation would eventually disagree with this one.
 *
 * The replay reads `events.jsonl`, but the published matchup records are built
 * from `final.json`. Verifying only the former would leave the file that
 * actually becomes a public claim unchecked — a valid event log beside a forged
 * `final.json`, or a game directory with no event log at all, would both pass.
 * So every game directory must carry both files, and `final.json` must agree
 * with what the replay produced.
 */
export function verifyRun(runDir: string): RunVerification {
  const gamesDir = path.join(runDir, "games");
  if (!fs.existsSync(gamesDir)) {
    return { games: 0, failures: [{ gameId: "-", message: "no games/ directory" }] };
  }
  const result: RunVerification = { games: 0, failures: [] };
  for (const gameId of fs.readdirSync(gamesDir).sort()) {
    result.games++;
    try {
      if (!fs.existsSync(path.join(gamesDir, gameId, "events.jsonl"))) {
        throw new Error("events.jsonl is missing — nothing to replay");
      }
      const { meta } = exportGame(runDir, gameId);
      checkFinalMatchesReplay(runDir, gameId, meta);
    } catch (err) {
      result.failures.push({
        gameId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (result.games === 0) {
    result.failures.push({ gameId: "-", message: "no games in this run" });
  }
  return result;
}

export function exportRun(runDir: string, outDir: string): BenchMeta[] {
  const gamesDir = path.join(runDir, "games");
  const gameIds = fs
    .readdirSync(gamesDir)
    .filter((g) => fs.existsSync(path.join(gamesDir, g, "events.jsonl")))
    .sort();
  fs.mkdirSync(outDir, { recursive: true });

  const metas: BenchMeta[] = [];
  for (const gameId of gameIds) {
    const { payload, meta } = exportGame(runDir, gameId);
    fs.writeFileSync(
      path.join(outDir, meta.file),
      JSON.stringify(payload)
    );
    metas.push(meta);
    console.log(`exported + verified: ${meta.file} (${meta.plies} plies, winner ${meta.winner ?? "draw"} by ${meta.reason})`);
  }

  // Learning series: export the strategy-document versions so the web can
  // show "watch it learn" (doc evolution game by game).
  const learnDir = path.join(runDir, "learn");
  if (fs.existsSync(learnDir)) {
    const runId = path.basename(runDir);
    const versions = fs
      .readdirSync(learnDir)
      .filter((f) => /^strategy-after-(.+)\.md$/.test(f))
      .sort()
      .map((f) => ({
        after_game: f.replace(/^strategy-after-/, "").replace(/\.md$/, ""),
        text: fs.readFileSync(path.join(learnDir, f), "utf8"),
      }));
    if (versions.length > 0) {
      const learningFile = `${runId}--learning.json`;
      fs.writeFileSync(
        path.join(outDir, learningFile),
        JSON.stringify({
          run_id: runId,
          games: metas.map((m) => ({
            file: m.file,
            game_id: m.game_id,
            team_a: m.team_a,
            team_b: m.team_b,
            winner: m.winner,
            reason: m.reason,
            plies: m.plies,
          })),
          versions,
        })
      );
      for (const m of metas) m.learning_file = learningFile;
      console.log(`learning series exported: ${learningFile} (${versions.length} strategy versions)`);
    }
  }

  // Merge into index.json (keyed by file name).
  const indexPath = path.join(outDir, "index.json");
  let index: BenchMeta[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch {
      index = [];
    }
  }
  const byFile = new Map(index.map((m) => [m.file, m]));
  // Index entries stay light: commentary lives only in the game payload.
  for (const m of metas) byFile.set(m.file, { ...m, commentary: undefined });
  const merged = [...byFile.values()].sort((a, b) =>
    a.exported_at < b.exported_at ? 1 : -1
  );
  fs.writeFileSync(indexPath, JSON.stringify(merged, null, 2));
  console.log(`index updated: ${indexPath} (${merged.length} games)`);
  return metas;
}

export function defaultOutDir(): string {
  return path.join(appRoot(), "web", "public", "bench");
}
