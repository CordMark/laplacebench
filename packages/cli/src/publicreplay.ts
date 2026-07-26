import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { exportGame, moveCommentary } from "./exportweb";
import { playerTeam } from "./engine";
import {
  PUBLIC_REPLAY_SCHEMA,
  REPLAY_MAX_BYTES,
  assertCommentaryText,
  assertSafeCount,
  assertText,
  assertTimestamp,
  canonicalJson,
  isEndReason,
  type EndReason,
  type SideFailures,
  type Team,
} from "./publicarena-contract";
import { cleanReplayMeta } from "./publicreplay-meta";
import { assertPublicReplay } from "./publicreplay-validate";
import { COLOR_NAMES } from "./types";

interface EventRecord {
  t: string;
  ply?: unknown;
  raw?: unknown;
  ts?: unknown;
  winner?: unknown;
  reason?: unknown;
  plies?: unknown;
}

export interface PublicReplayArtifact {
  bytes: Buffer;
  digest: string;
  playedAt: string;
  winner: Team | null;
  reason: EndReason;
  plies: number;
  teamA: string;
  teamB: string;
  failures: { A: SideFailures; B: SideFailures };
}

const readEvents = (runDir: string, gameId: string): EventRecord[] =>
  fs.readFileSync(path.join(runDir, "games", gameId, "events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EventRecord);

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function canonicalHistory(
  rawHistory: unknown[],
  advancing: EventRecord[],
  startMs: number,
  endMs: number,
  plies: number
): unknown[] {
  if (advancing.length !== plies || rawHistory.length !== plies + 1) {
    throw new Error(`advance/history count differs from game_end plies (${advancing.length}/${rawHistory.length - 1}/${plies})`);
  }

  let lastMoveAt: string | null = null;
  return rawHistory.map((rawState, index) => {
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      throw new Error(`history[${index}] is not an object`);
    }
    const tick = index === 0
      ? startMs
      : startMs + Math.floor(((endMs - startMs) * index) / (plies + 1));
    if (index > 0 && advancing[index - 1].t === "move") lastMoveAt = iso(tick);
    return {
      ...(rawState as Record<string, unknown>),
      turnStartedAt: iso(tick),
      gameStartedAt: iso(startMs),
      gameEndedAt: index === plies ? iso(endMs) : null,
      lastMoveAt,
    };
  });
}

function indexAdvancingEvents(
  events: EventRecord[], gameId: string, plies: number
): Map<EventRecord, number> {
  const indexed = new Map<EventRecord, number>();
  for (const event of events) {
    if (event.t !== "move" && event.t !== "pass") continue;
    const expected = indexed.size;
    if (event.ply !== expected) {
      throw new Error(`${gameId}: advancing event has non-canonical ply ${String(event.ply)} (expected ${expected})`);
    }
    indexed.set(event, expected);
  }
  if (indexed.size !== plies) {
    throw new Error(`${gameId}: advancing event count differs from game_end plies`);
  }
  return indexed;
}

export function buildPublicReplay(runDir: string, gameId: string): PublicReplayArtifact {
  const events = readEvents(runDir, gameId);
  const start = events.find((event) => event.t === "game_start");
  const end = events.find((event) => event.t === "game_end");
  if (!start || !end || typeof start.ts !== "string" || typeof end.ts !== "string") {
    throw new Error(`${gameId}: missing timestamped game_start/game_end`);
  }
  const startMs = assertTimestamp(start.ts, `${gameId}.game_start.ts`);
  const endMs = assertTimestamp(end.ts, `${gameId}.game_end.ts`);
  if (endMs < startMs) throw new Error(`${gameId}: game_end precedes game_start`);
  if (!isEndReason(end.reason)) throw new Error(`${gameId}: invalid game_end reason`);
  if (typeof end.plies !== "number") throw new Error(`${gameId}: game_end plies is not numeric`);
  const plies = end.plies;
  assertSafeCount(plies, `${gameId}.plies`, 100);
  const winner = end.winner === null || end.winner === undefined
    ? null
    : end.winner === "A" || end.winner === "B"
      ? end.winner
      : (() => { throw new Error(`${gameId}: invalid winner`); })();

  const exported = exportGame(runDir, gameId) as unknown as {
    payload: Record<string, unknown>;
    meta: Record<string, unknown>;
  };
  const advanceIndexes = indexAdvancingEvents(events, gameId, plies);
  const history = canonicalHistory(
    exported.payload.history as unknown[], [...advanceIndexes.keys()], startMs, endMs, plies
  );
  const commentary = events.flatMap((event, index) => {
    if (event.t !== "move") return [];
    const text = moveCommentary(event as { raw?: unknown; note?: unknown });
    if (!text) return [];
    const ply = advanceIndexes.get(event);
    if (ply === undefined) throw new Error(`${gameId}.events[${index}] is not an indexed move`);
    const state = history[ply] as Record<string, unknown> | undefined;
    const player = state?.currentPlayer;
    if (!Number.isInteger(player) || Number(player) < 1 || Number(player) > 4) {
      throw new Error(`${gameId}.events[${index}] has no replayed acting player`);
    }
    assertCommentaryText(text, `${gameId}.events[${index}].commentary`);
    return [{
      ply,
      team: playerTeam(Number(player)),
      color: COLOR_NAMES[Number(player) - 1],
      text,
    }];
  });
  const meta: Record<string, unknown> = { ...exported.meta, commentary };
  const runId = path.basename(path.resolve(runDir));
  const file = `${runId}--${gameId}.json`;
  if (file.length > 167) throw new Error(`${gameId}: deterministic filename exceeds 167 chars`);
  const teamA = String(meta.team_a ?? "");
  const teamB = String(meta.team_b ?? "");
  assertText(teamA, `${gameId}.team_a`, 256);
  assertText(teamB, `${gameId}.team_b`, 256);

  const clean = cleanReplayMeta(meta, { teamA, teamB, plies, reason: end.reason });

  const replay = {
    schema: PUBLIC_REPLAY_SCHEMA,
    history,
    boardSize: 8,
    winningTeam: winner,
    bench: {
      file,
      run_id: runId,
      game_id: gameId,
      team_a: teamA,
      team_b: teamB,
      winner,
      reason: end.reason,
      plies,
      replayed: clean.replayed,
      exported_at: end.ts,
      stats: clean.stats,
      failures: clean.failures,
      commentary: clean.commentary,
    },
  };
  assertPublicReplay(replay, {
    runId,
    gameId,
    file,
    teamA,
    teamB,
    winner,
    reason: end.reason,
    plies,
    startedAt: start.ts,
    playedAt: end.ts,
  });
  const bytes = Buffer.from(canonicalJson(replay), "utf8");
  if (bytes.length === 0 || bytes.length > REPLAY_MAX_BYTES) {
    throw new Error(`${gameId}: public replay is ${bytes.length} bytes (max ${REPLAY_MAX_BYTES})`);
  }
  return {
    bytes,
    digest: createHash("sha256").update(bytes).digest("hex"),
    playedAt: end.ts,
    winner,
    reason: end.reason,
    plies,
    teamA,
    teamB,
    failures: clean.summary,
  };
}
