import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { headlineLabel } from "./catalog";
import { verifyRun } from "./exportweb";
import {
  ARENA_MAX_BYTES,
  ARENA_SCHEMA,
  MAX_CONDITIONS_PER_MATCHUP,
  MAX_GAMES_PER_MATCHUP,
  MAX_MATCHUPS,
  MAX_PARTICIPANT_LABEL,
  MAX_PUBLIC_GAMES,
  PUBLIC_REPLAY_SCHEMA,
  RULESET,
  assertHeadline,
  assertHex40,
  assertRawRef,
  assertText,
  assertTimestamp,
  canonicalJson,
  type ArenaCatalog,
  type ArenaMatchup,
  type Condition,
  type Participant,
  type PublicGame,
  type Team,
} from "./publicarena-contract";
import { headlineKind, ordinal, publicPair } from "./publicgames";
import { buildPublicReplay } from "./publicreplay";

interface MatchupAccumulator {
  left: Participant;
  right: Participant;
  games: PublicGame[];
  conditions: Map<string, Condition>;
}

export interface ArenaArtifacts {
  catalog: ArenaCatalog;
  catalogBytes: Buffer;
  replays: Map<string, Buffer>;
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

function participant(id: string, agent: string): Participant {
  assertHeadline(id);
  const kind = headlineKind(agent);
  const label = headlineLabel(agent, kind === "llm");
  assertText(label, `participant(${id}).label`, MAX_PARTICIPANT_LABEL);
  return { id, label, kind };
}

function resultFor(game: PublicGame, leftSide: Team): "left" | "right" | "draw" {
  if (game.winner === null) return "draw";
  return game.winner === leftSide ? "left" : "right";
}

function addResult(
  target: { left_wins: number; right_wins: number; draws: number },
  result: "left" | "right" | "draw"
): void {
  if (result === "left") target.left_wins++;
  else if (result === "right") target.right_wins++;
  else target.draws++;
}

function readFinal(runDir: string, gameId: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(runDir, "games", gameId, "final.json"), "utf8"));
}

function validateParticipant(existing: Participant, next: Participant): void {
  if (existing.label !== next.label || existing.kind !== next.kind) {
    throw new Error(`headline identity ${existing.id} has conflicting participant metadata`);
  }
}

export function buildArenaArtifacts(
  runDirs: string[], sourceSha: string, generatedAt: string
): ArenaArtifacts {
  assertHex40(sourceSha);
  assertTimestamp(generatedAt, "generated_at");
  const uniqueDirs = [...new Set(runDirs.map((dir) => path.resolve(dir)))].sort(ordinal);
  if (uniqueDirs.length === 0) throw new Error("arena publication needs at least one run");

  let verifiedGames = 0;
  for (const runDir of uniqueDirs) {
    const verification = verifyRun(runDir);
    verifiedGames += verification.games;
    if (verification.games === 0 || verification.failures.length > 0) {
      const detail = verification.failures.map((failure) =>
        `${failure.gameId}: ${failure.message}`).join("; ");
      throw new Error(`${path.basename(runDir)} failed verification${detail ? `: ${detail}` : ""}`);
    }
  }

  const matchups = new Map<string, MatchupAccumulator>();
  const participants = new Map<string, Participant>();
  const replays = new Map<string, Buffer>();
  const rawRefs = new Set<string>();

  for (const runDir of uniqueDirs) {
    const runId = path.basename(runDir);
    const gamesDir = path.join(runDir, "games");
    for (const gameId of fs.readdirSync(gamesDir).sort(ordinal)) {
      const finalPath = path.join(gamesDir, gameId, "final.json");
      if (!fs.existsSync(finalPath)) continue;
      const fin = readFinal(runDir, gameId);
      const teams = fin.teams as { A?: { agent?: unknown }; B?: { agent?: unknown } };
      const specA = String(teams?.A?.agent ?? "");
      const specB = String(teams?.B?.agent ?? "");
      const pair = publicPair(specA, specB);
      if (!pair) continue;

      const rawRef = `${runId}/${gameId}`;
      assertRawRef(rawRef);
      if (rawRefs.has(rawRef)) throw new Error(`duplicate raw_ref: ${rawRef}`);
      rawRefs.add(rawRef);

      const artifact = buildPublicReplay(runDir, gameId);
      if (replays.has(artifact.digest)) throw new Error(`duplicate replay digest: ${artifact.digest}`);
      replays.set(artifact.digest, artifact.bytes);

      const left = participant(pair.leftId, pair.leftAgent);
      const right = participant(pair.rightId, pair.rightAgent);
      for (const value of [left, right]) {
        const existing = participants.get(value.id);
        if (existing) validateParticipant(existing, value);
        else participants.set(value.id, value);
      }
      const matchupId = sha256(`${left.id}\0${right.id}`);
      let matchup = matchups.get(matchupId);
      if (!matchup) {
        matchup = { left, right, games: [], conditions: new Map() };
        matchups.set(matchupId, matchup);
      }

      const game: PublicGame = {
        raw_ref: rawRef,
        played_at: artifact.playedAt,
        team_a: { agent: artifact.teamA, headline_id: pair.leftSide === "A" ? left.id : right.id },
        team_b: { agent: artifact.teamB, headline_id: pair.leftSide === "B" ? left.id : right.id },
        left_side: pair.leftSide,
        winner: artifact.winner,
        reason: artifact.reason,
        plies: artifact.plies,
        failures: artifact.failures,
        replay: { id: artifact.digest, bytes: artifact.bytes.length, schema: PUBLIC_REPLAY_SCHEMA },
      };
      matchup.games.push(game);

      const conditionKey = `${pair.leftAgent}\0${pair.rightAgent}`;
      let condition = matchup.conditions.get(conditionKey);
      if (!condition) {
        condition = {
          left_agent: pair.leftAgent, right_agent: pair.rightAgent,
          game_count: 0, left_wins: 0, right_wins: 0, draws: 0,
        };
        matchup.conditions.set(conditionKey, condition);
      }
      condition.game_count++;
      addResult(condition, resultFor(game, pair.leftSide));
    }
  }

  if (replays.size > MAX_PUBLIC_GAMES || matchups.size > MAX_MATCHUPS) {
    throw new Error("arena catalog exceeds public entry limits");
  }
  const matchupRows: ArenaMatchup[] = [...matchups.entries()].map(([id, acc]) => {
    acc.games.sort((a, b) => ordinal(b.played_at, a.played_at) || ordinal(a.raw_ref, b.raw_ref));
    if (acc.games.length > MAX_GAMES_PER_MATCHUP) throw new Error(`${id}: too many games`);
    const conditions = [...acc.conditions.values()].sort((a, b) =>
      ordinal(a.left_agent, b.left_agent) || ordinal(a.right_agent, b.right_agent));
    if (conditions.length > MAX_CONDITIONS_PER_MATCHUP) throw new Error(`${id}: too many conditions`);
    const row: ArenaMatchup = {
      id, left: acc.left, right: acc.right, game_count: acc.games.length,
      left_wins: 0, right_wins: 0, draws: 0,
      last_played_at: acc.games[0].played_at,
      conditions,
      games: acc.games,
    };
    for (const game of acc.games) addResult(row, resultFor(game, game.left_side));
    return row;
  }).sort((a, b) => ordinal(b.last_played_at, a.last_played_at) || ordinal(a.id, b.id));

  const catalog: ArenaCatalog = {
    schema: ARENA_SCHEMA,
    ruleset: RULESET,
    lane: "community",
    source_sha: sourceSha,
    generated_at: generatedAt,
    verified_run_count: uniqueDirs.length,
    verified_game_count: verifiedGames,
    public_agent_count: participants.size,
    public_game_count: replays.size,
    matchups: matchupRows,
  };
  const catalogBytes = Buffer.from(canonicalJson(catalog), "utf8");
  if (catalogBytes.length > ARENA_MAX_BYTES) {
    throw new Error(`arena.json is ${catalogBytes.length} bytes (max ${ARENA_MAX_BYTES})`);
  }
  return { catalog, catalogBytes, replays };
}

export function writeArenaArtifacts(
  outputDir: string, runDirs: string[], sourceSha: string, generatedAt: string
): ArenaArtifacts {
  const artifacts = buildArenaArtifacts(runDirs, sourceSha, generatedAt);
  const target = path.resolve(outputDir);
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  const temp = fs.mkdtempSync(path.join(parent, ".arena-publication-"));
  const replayDir = path.join(temp, "replays");
  fs.mkdirSync(replayDir);
  fs.writeFileSync(path.join(temp, "arena.json"), artifacts.catalogBytes);
  for (const [digest, bytes] of artifacts.replays) {
    fs.writeFileSync(path.join(replayDir, `${digest}.json`), bytes);
  }

  const backup = `${target}.previous`;
  if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  if (fs.existsSync(target)) fs.renameSync(target, backup);
  try {
    fs.renameSync(temp, target);
    if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!fs.existsSync(target) && fs.existsSync(backup)) fs.renameSync(backup, target);
    throw error;
  }
  return artifacts;
}
