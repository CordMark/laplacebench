import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as readline from "node:readline";
import type { Agent, AgentReply, Move, TurnInput } from "../types";
import type { GameState } from "laplace-engine";

export const BRIDGE_PROTOCOL = "product-cpu-bridge-v1";
const BRIDGE_SCRIPT = path.join(__dirname, "..", "..", "bridge", "product_cpu_bridge.py");
const MOVE_TIMEOUT_MS = 60_000;
const SCORE_TIMEOUT_MS = 120_000;
const HELLO_TIMEOUT_MS = 60_000;

export interface BridgeHello {
  protocol: string;
  policy_version: string;
  product_commit: string;
  distribution: "bundled";
  python: string;
  visible_tiers: { level_id: string; profile_name: string; p95_limit_seconds: number }[];
}

export interface ProductCpuOptions {
  /** Policy segment of the agent spec (e.g. the current "cpu-v6"). */
  expectedPolicy: string;
  /** Test hook: overrides the spawned command (default: python3 bridge). */
  bridgeCommand?: { command: string; args: string[] };
  /** Test hooks: shrink deadlines. Production defaults apply when omitted. */
  moveTimeoutMs?: number;
  scoreTimeoutMs?: number;
  helloTimeoutMs?: number;
}

export interface PythonCommand {
  command: string;
  args: string[];
}

type PythonProbe = (
  command: string,
  args: string[]
) => { status: number | null; stdout?: string; stderr?: string; error?: Error };

/** Find a supported host interpreter without asking the user for a path. */
export function resolvePythonCommand(
  probe: PythonProbe = (command, args) => {
    const result = spawnSync(command, args, { encoding: "utf8" });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
    };
  },
  platform = process.platform
): PythonCommand {
  const candidates: PythonCommand[] = platform === "win32"
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3.14", args: [] },
        { command: "python3.13", args: [] },
        { command: "python3.12", args: [] },
        { command: "python3.11", args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ];
  const found: string[] = [];
  for (const candidate of candidates) {
    const result = probe(candidate.command, [...candidate.args, "--version"]);
    if (result.error || result.status !== 0) continue;
    const versionText = `${result.stdout ?? ""} ${result.stderr ?? ""}`.trim();
    const match = versionText.match(/Python\s+(\d+)\.(\d+)/i);
    if (!match) continue;
    const major = Number(match[1]);
    const minor = Number(match[2]);
    if (major > 3 || (major === 3 && minor >= 11)) return candidate;
    found.push(versionText);
  }
  const detail = found.length > 0 ? `（検出: ${found.join(", ")}）` : "";
  throw new Error(
    `LaPlace CPUにはPython 3.11以上が必要です${detail}。Pythonをインストールしてから再実行してください。対局は開始していません。`
  );
}

export interface ScoredRoot {
  move: { from: [number, number]; to: [number, number] };
  value: number;
  rank: number;
  selectionClass: number;
  immediateWin: boolean;
  unsafe: boolean;
}

interface Pending {
  resolve: (v: any) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Line-delimited JSON client over a bridge child process. Fail-closed:
 * child exit, non-JSON output, or a per-request deadline rejects every
 * pending request; dispose() is idempotent and kills the child.
 */
export class ProductCpuBridge {
  private child: ChildProcess;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private stderrTail: string[] = [];
  private closed = false;
  private moveTimeoutMs: number;
  private scoreTimeoutMs: number;
  readonly hello: Promise<BridgeHello>;

  constructor(opts: ProductCpuOptions) {
    this.moveTimeoutMs = opts.moveTimeoutMs ?? MOVE_TIMEOUT_MS;
    this.scoreTimeoutMs = opts.scoreTimeoutMs ?? SCORE_TIMEOUT_MS;
    const python = opts.bridgeCommand ? null : resolvePythonCommand();
    const cmd = opts.bridgeCommand ?? {
      command: python!.command,
      args: [...python!.args, BRIDGE_SCRIPT, "--policy", opts.expectedPolicy],
    };
    this.child = spawn(cmd.command, cmd.args, { stdio: ["pipe", "pipe", "pipe"] });
    this.child.stderr!.on("data", (d: Buffer) => {
      this.stderrTail.push(d.toString());
      if (this.stderrTail.length > 20) this.stderrTail.shift();
      // Contractually fatal (fail-closed): the bridge never writes stderr in
      // healthy operation, so any output rejects all pending requests rather
      // than leaving them to hit their deadlines.
      if (!this.closed) this.failAll("bridge wrote to stderr");
    });

    let helloResolve!: (h: BridgeHello) => void;
    let helloReject!: (e: Error) => void;
    this.hello = new Promise<BridgeHello>((res, rej) => {
      helloResolve = res;
      helloReject = rej;
    });
    const helloTimer = setTimeout(() => {
      helloReject(this.fail("bridge hello timed out"));
    }, opts.helloTimeoutMs ?? HELLO_TIMEOUT_MS);

    let gotHello = false;
    const rl = readline.createInterface({ input: this.child.stdout! });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        this.failAll(`bridge emitted non-JSON output: ${line.slice(0, 200)}`);
        return;
      }
      if (!gotHello) {
        gotHello = true;
        clearTimeout(helloTimer);
        const h = msg as BridgeHello;
        if (
          msg.t !== "hello" ||
          h.protocol !== BRIDGE_PROTOCOL ||
          typeof h.policy_version !== "string" ||
          typeof h.product_commit !== "string" ||
          h.distribution !== "bundled" ||
          typeof h.python !== "string" ||
          !Array.isArray(h.visible_tiers)
        ) {
          helloReject(this.fail(`malformed bridge hello: ${line.slice(0, 200)}`));
          return;
        }
        helloResolve(h);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(`bridge error: ${msg.error}`));
      else p.resolve(msg);
    });
    this.child.on("exit", (code) => {
      if (!this.closed) {
        const err = this.failAll(`bridge exited (code ${code})`);
        if (!gotHello) {
          gotHello = true;
          clearTimeout(helloTimer);
          helloReject(err);
        }
      }
    });
    this.child.on("error", (err) => {
      const wrapped = this.failAll(`bridge spawn failed: ${err.message}`);
      if (!gotHello) {
        gotHello = true;
        clearTimeout(helloTimer);
        helloReject(wrapped);
      }
    });
  }

  private fail(reason: string): Error {
    const stderr = this.stderrTail.join("").trim();
    return new Error(stderr ? `${reason}\nbridge stderr:\n${stderr}` : reason);
  }

  private failAll(reason: string): Error {
    const err = this.fail(reason);
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    return err;
  }

  request(payload: object, timeoutMs: number): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (this.closed || this.child.exitCode !== null) {
        reject(this.fail("bridge is closed"));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(this.fail(`bridge request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin!.write(JSON.stringify({ id, ...payload }) + "\n");
    });
  }

  move(levelId: string, seed: number, state: object): Promise<any> {
    return this.request({ op: "move", level_id: levelId, seed, state }, this.moveTimeoutMs);
  }

  scoreRoots(levelId: string, state: object): Promise<{ depth: number; roots: ScoredRoot[] }> {
    return this.request({ op: "score_roots", level_id: levelId, state }, this.scoreTimeoutMs);
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.failAll("bridge disposed");
    this.child.stdin?.end();
    this.child.kill("SIGTERM");
  }
}

/** MoveRequest-shaped view of the bench GameState (product API contract). */
export function toMoveRequestState(state: GameState): object {
  return {
    board: state.board.map((row) =>
      row.map((cell) => (cell ? { player: cell.player, isDead: !!cell.isDead } : null))
    ),
    currentPlayer: state.currentPlayer,
    boardSize: state.boardSize,
    eliminatedPlayers: state.eliminatedPlayers,
    capturedPieces: state.capturedPieces,
  };
}

/** Validate a hello against the spec's expectations. Fail-closed. */
export function validateHello(hello: BridgeHello, opts: ProductCpuOptions, levelId: string): void {
  if (hello.policy_version !== opts.expectedPolicy) {
    throw new Error(
      `product CPU policy_version mismatch: spec says ${opts.expectedPolicy}, bridge reports ${hello.policy_version}`
    );
  }
  if (!hello.visible_tiers.some((t) => t.level_id === levelId)) {
    throw new Error(
      `${levelId} is not a visible tier (visible: ${hello.visible_tiers.map((t) => t.level_id).join(", ")})`
    );
  }
}

export function perMoveSeed(agentSeed: number, ply: number): number {
  // Contract: (agentSeed * 1_000_003 + ply) mod 2^31, nonnegative. Inputs up
  // to 2^31 keep the product under 2^51, safely inside Number precision.
  const MOD = 2 ** 31;
  return (((agentSeed * 1_000_003 + ply) % MOD) + MOD) % MOD;
}

/**
 * Metadata-only preflight: spawn, validate, capture provenance, dispose.
 * Used by the CLI before run.json is written.
 */
export async function preflightProductCpu(
  opts: ProductCpuOptions,
  levelId: string
): Promise<BridgeHello> {
  const bridge = new ProductCpuBridge(opts);
  try {
    const hello = await bridge.hello;
    validateHello(hello, opts, levelId);
    return hello;
  } finally {
    bridge.dispose();
  }
}

/** Per-game agent: fresh bridge + handshake, disposed by the runner. */
export async function createProductCpuAgent(
  levelId: string,
  agentSeed: number,
  opts: ProductCpuOptions
): Promise<Agent> {
  const bridge = new ProductCpuBridge(opts);
  let hello: BridgeHello;
  try {
    hello = await bridge.hello;
    validateHello(hello, opts, levelId);
  } catch (err) {
    bridge.dispose();
    throw err;
  }
  return {
    name: `product-cpu:${hello.policy_version}:${levelId}`,
    async act(input: TurnInput): Promise<AgentReply> {
      const seed = perMoveSeed(agentSeed, input.ply);
      const started = Date.now();
      const res = await bridge.move(levelId, seed, toMoveRequestState(input.state));
      const move: Move = {
        from: { row: res.move.from[0], col: res.move.from[1] },
        to: { row: res.move.to[0], col: res.move.to[1] },
      };
      return {
        move,
        latencyMs: Date.now() - started,
        meta: { product_seed: res.seed_used, bridge_elapsed_ms: res.elapsed_ms },
      };
    },
    dispose() {
      bridge.dispose();
    },
  };
}
