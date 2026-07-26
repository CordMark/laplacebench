import {
  assertSafeCount,
  assertText,
  assertTimestamp,
  type EndReason,
  type Team,
} from "./publicarena-contract";

const STATE_KEYS = [
  "board", "boardSize", "capturedPieces", "eliminatedPlayers", "startingPiecesCount",
  "eliminationThreshold", "currentPlayer", "turnStartedAt", "turnTimeLimit",
  "gameStartedAt", "gameEndedAt", "winningTeam", "lastMoveBy", "lastMoveAt",
  "lastMove", "consecutiveTimeouts",
];

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, required: string[], optional: string[], field: string): void {
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value)) || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(`${field} has missing or unknown fields`);
  }
}

function player(value: unknown, field: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 4) throw new Error(`${field} is not a player`);
  return Number(value);
}

function coordinate(value: unknown, field: string, nullable = false): void {
  if (nullable && value === null) return;
  if (!Array.isArray(value) || value.length !== 2 || value.some((item) => !Number.isInteger(item) || item < 0 || item > 7)) {
    throw new Error(`${field} is outside the 8x8 board`);
  }
}

function coordinates(value: unknown, field: string): void {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  value.forEach((item, index) => coordinate(item, `${field}[${index}]`));
}

function lastMove(value: unknown, field: string): boolean {
  const move = record(value, field);
  exact(move, ["from", "to", "capturedPositions"],
    ["eliminatedPlayer", "remainingPiecePositions", "capturedPiecesMeta"], field);
  coordinate(move.from, `${field}.from`, true);
  coordinate(move.to, `${field}.to`, true);
  if ((move.from === null) !== (move.to === null)) throw new Error(`${field} has only one null endpoint`);
  coordinates(move.capturedPositions, `${field}.capturedPositions`);
  if (move.eliminatedPlayer !== undefined) player(move.eliminatedPlayer, `${field}.eliminatedPlayer`, true);
  if (move.remainingPiecePositions !== undefined) coordinates(move.remainingPiecePositions, `${field}.remainingPiecePositions`);
  if (move.capturedPiecesMeta !== undefined) {
    if (!Array.isArray(move.capturedPiecesMeta)) throw new Error(`${field}.capturedPiecesMeta must be an array`);
    move.capturedPiecesMeta.forEach((raw, index) => {
      const item = record(raw, `${field}.capturedPiecesMeta[${index}]`);
      exact(item, ["position", "player"], [], `${field}.capturedPiecesMeta[${index}]`);
      coordinate(item.position, `${field}.capturedPiecesMeta[${index}].position`);
      player(item.player, `${field}.capturedPiecesMeta[${index}].player`);
    });
  }
  return move.from === null;
}

function counters(value: unknown, field: string): void {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`${field} must have four entries`);
  value.forEach((item, index) => {
    if (typeof item !== "number") throw new Error(`${field}[${index}] must be a number`);
    assertSafeCount(item, `${field}[${index}]`);
  });
}

function board(value: unknown, field: string): void {
  if (!Array.isArray(value) || value.length !== 8) throw new Error(`${field} must have eight rows`);
  value.forEach((rawRow, row) => {
    if (!Array.isArray(rawRow) || rawRow.length !== 8) throw new Error(`${field}[${row}] must have eight cells`);
    rawRow.forEach((rawCell, column) => {
      if (rawCell === null) return;
      const cell = record(rawCell, `${field}[${row}][${column}]`);
      exact(cell, ["player", "isDead"], [], `${field}[${row}][${column}]`);
      player(cell.player, `${field}[${row}][${column}].player`);
      if (typeof cell.isDead !== "boolean") throw new Error(`${field}[${row}][${column}].isDead must be boolean`);
    });
  });
}

export function assertPublicReplay(
  value: unknown,
  expected: {
    runId: string;
    gameId: string;
    file: string;
    teamA: string;
    teamB: string;
    winner: Team | null;
    reason: EndReason;
    plies: number;
    startedAt: string;
    playedAt: string;
  },
): void {
  const replay = record(value, "replay");
  exact(replay, ["schema", "history", "boardSize", "winningTeam", "bench"], [], "replay");
  if (replay.schema !== "laplace-bench-replay-v1" || replay.boardSize !== 8 || replay.winningTeam !== expected.winner) {
    throw new Error("replay header differs from the public contract");
  }
  const history = replay.history;
  if (!Array.isArray(history) || history.length !== expected.plies + 1) {
    throw new Error("replay history length differs from plies");
  }
  let previousTurn = -Infinity;
  let previousPlayer: number | null = null;
  let previousMoveAt: unknown = null;
  history.forEach((rawState, index) => {
    const state = record(rawState, `history[${index}]`);
    exact(state, STATE_KEYS, [], `history[${index}]`);
    board(state.board, `history[${index}].board`);
    if (state.boardSize !== 8) throw new Error(`history[${index}].boardSize is not 8`);
    counters(state.capturedPieces, `history[${index}].capturedPieces`);
    counters(state.consecutiveTimeouts, `history[${index}].consecutiveTimeouts`);
    if (!Array.isArray(state.eliminatedPlayers) || state.eliminatedPlayers.length !== 4 ||
        state.eliminatedPlayers.some((item) => typeof item !== "boolean")) throw new Error(`history[${index}].eliminatedPlayers is invalid`);
    for (const key of ["startingPiecesCount", "eliminationThreshold", "turnTimeLimit"]) {
      if (typeof state[key] !== "number") throw new Error(`history[${index}].${key} must be a number`);
      assertSafeCount(state[key], `history[${index}].${key}`);
    }
    const current = player(state.currentPlayer, `history[${index}].currentPlayer`);
    const turn = assertTimestamp(String(state.turnStartedAt), `history[${index}].turnStartedAt`);
    const expectedTurn = Date.parse(expected.startedAt) + Math.floor(
      ((Date.parse(expected.playedAt) - Date.parse(expected.startedAt)) * index) / (expected.plies + 1),
    );
    if (turn < previousTurn || turn < Date.parse(expected.startedAt) || turn > Date.parse(expected.playedAt) ||
        turn !== expectedTurn || state.gameStartedAt !== expected.startedAt) {
      throw new Error(`history[${index}] timestamps are inconsistent`);
    }
    previousTurn = turn;
    const final = index === history.length - 1;
    if (state.gameEndedAt !== (final ? expected.playedAt : null) ||
        state.winningTeam !== (final ? expected.winner : null)) throw new Error(`history[${index}] terminal state is inconsistent`);
    if (index === 0) {
      if (state.lastMove !== null || state.lastMoveAt !== null || state.lastMoveBy !== null) {
        throw new Error("initial state unexpectedly has a last move");
      }
    } else {
      const pass = lastMove(state.lastMove, `history[${index}].lastMove`);
      if (state.lastMoveBy !== previousPlayer ||
          (pass ? state.lastMoveAt !== previousMoveAt : state.lastMoveAt !== state.turnStartedAt)) {
        throw new Error(`history[${index}] move/player timestamps differ`);
      }
    }
    previousPlayer = current;
    previousMoveAt = state.lastMoveAt;
  });

  const bench = record(replay.bench, "bench");
  exact(bench, [
    "file", "run_id", "game_id", "team_a", "team_b", "winner", "reason", "plies",
    "replayed", "exported_at", "stats", "failures", "commentary",
  ], [], "bench");
  if (bench.file !== expected.file || bench.run_id !== expected.runId || bench.game_id !== expected.gameId ||
      bench.team_a !== expected.teamA || bench.team_b !== expected.teamB || bench.winner !== expected.winner ||
      bench.reason !== expected.reason || bench.plies !== expected.plies || bench.exported_at !== expected.playedAt) {
    throw new Error("bench metadata differs from the verified record");
  }
  assertText(String(bench.team_a), "bench.team_a", 256);
  assertText(String(bench.team_b), "bench.team_b", 256);
}
