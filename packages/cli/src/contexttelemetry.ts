import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Context telemetry for persistent-thread matches
 * (docs/plans/2026-08-02-context-telemetry.md): the observation instrument
 * for provider-side compaction (ARC-AGI-3's "setting 2"). At endGame the
 * adapter harvests its OWN session artifacts from the clean-room home,
 * extracts counts/series only (never raw prompts or reasoning payloads —
 * publication boundary), and writes
 * `games/<id>/context-telemetry-<team>.json`.
 *
 * Marker formats verified against real artifacts on 2026-08-02:
 * - codex rollout: payload.type "context_compacted", and "token_count" with
 *   info.model_context_window + info.last_token_usage;
 * - claude transcript: type "system" / subtype "compact_boundary" with
 *   compactMetadata {trigger, preTokens, postTokens}.
 *
 * Documented limitation: a WHOLESALE marker rename is undetectable and looks
 * like zero compactions; only structural degradation of the known markers is
 * reported (marker-format-unknown).
 */

export const CONTEXT_TELEMETRY_SCHEMA = "laplace-context-telemetry-v1" as const;

export type SourceStatus =
  | "ok"
  | "not-found"
  | "parse-error"
  | "marker-format-unknown";

export interface CompactionEvent {
  /** codex: event index within the rollout; claude: entry index. */
  index: number;
  trigger?: string;
  preTokens?: number;
  postTokens?: number;
}

export interface TokenCountSample {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
}

export interface SourceRecord {
  id: string;
  file: string | null;
  status: SourceStatus;
  skipped_lines: number;
  compaction_count: number;
  compactions: CompactionEvent[];
  /** codex only */
  model_context_window?: number | null;
  token_counts?: TokenCountSample[];
  /** claude only */
  transcript_bytes?: number;
}

export interface ContextTelemetry {
  schema: typeof CONTEXT_TELEMETRY_SCHEMA;
  provider: "codex" | "claude";
  harness: string;
  ids: string[];
  /** codex timeouts whose thread id was never observable (never guessed). */
  unobserved_timeouts: number;
  status: SourceStatus;
  complete: boolean;
  model_context_window: number | null;
  compaction_count: number;
  compactions: CompactionEvent[];
  token_counts: TokenCountSample[];
  transcript_bytes: number | null;
  sources: SourceRecord[];
}

const STATUS_PRECEDENCE: SourceStatus[] = [
  "parse-error",
  "marker-format-unknown",
  "not-found",
  "ok",
];

function worstStatus(records: SourceRecord[]): SourceStatus {
  for (const status of STATUS_PRECEDENCE) {
    if (records.some((r) => r.status === status)) return status;
  }
  return "ok";
}

/** Parse one codex rollout's lines. Extraction only — no payload bodies. */
export function parseCodexRollout(lines: string[]): Omit<SourceRecord, "id" | "file" | "status"> & { status: Exclude<SourceStatus, "not-found" | "parse-error"> } {
  let skipped = 0;
  const compactions: CompactionEvent[] = [];
  const tokenCounts: TokenCountSample[] = [];
  let window: number | null = null;
  let sawTokenCount = false;
  let degraded = false;
  let index = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: any;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }
    index++;
    const payload = entry?.payload;
    if (!payload || typeof payload !== "object") continue;
    if (payload.type === "context_compacted") {
      compactions.push({ index });
    } else if (payload.type === "token_count") {
      sawTokenCount = true;
      const info = payload.info;
      if (info && typeof info === "object") {
        if (typeof info.model_context_window === "number") {
          window = info.model_context_window;
        }
        // Strict validation of the verified shape: a token_count whose
        // last_token_usage is absent, non-object, or missing any of the four
        // numeric fields is structural drift of a known marker — only
        // validated numbers may enter the extraction-only artifact.
        const usage = info.last_token_usage;
        const nums = usage && typeof usage === "object"
          ? [
              usage.input_tokens,
              usage.cached_input_tokens,
              usage.output_tokens,
              usage.reasoning_output_tokens,
            ]
          : null;
        if (nums && nums.every((n: unknown) => typeof n === "number")) {
          tokenCounts.push({
            input: usage.input_tokens,
            cached: usage.cached_input_tokens,
            output: usage.output_tokens,
            reasoning: usage.reasoning_output_tokens,
          });
        } else {
          degraded = true;
        }
      } else {
        // token_count without an info object at all: same drift.
        degraded = true;
      }
    }
  }
  // Detectable structural degradation of KNOWN markers only: token_count
  // events exist but none carried a context window.
  if (sawTokenCount && window === null) degraded = true;
  return {
    skipped_lines: skipped,
    compaction_count: compactions.length,
    compactions,
    model_context_window: window,
    token_counts: tokenCounts,
    status: degraded ? "marker-format-unknown" : "ok",
  };
}

/** Parse one claude session transcript's lines. */
export function parseClaudeTranscript(lines: string[]): Omit<SourceRecord, "id" | "file" | "status" | "transcript_bytes"> & { status: Exclude<SourceStatus, "not-found" | "parse-error"> } {
  let skipped = 0;
  const compactions: CompactionEvent[] = [];
  let degraded = false;
  let index = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: any;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      skipped++;
      continue;
    }
    index++;
    if (entry?.type === "system" && entry?.subtype === "compact_boundary") {
      const meta = entry.compactMetadata;
      // Verified shape: trigger in {auto, manual} plus numeric pre/post
      // token counts. Anything else — missing, empty, partial, mis-typed,
      // or an unknown trigger value — is structural drift of a known marker.
      const valid =
        meta &&
        typeof meta === "object" &&
        (meta.trigger === "auto" || meta.trigger === "manual") &&
        typeof meta.preTokens === "number" &&
        typeof meta.postTokens === "number";
      if (!valid) {
        degraded = true;
        compactions.push({ index });
      } else {
        compactions.push({
          index,
          trigger: meta.trigger,
          preTokens: meta.preTokens,
          postTokens: meta.postTokens,
        });
      }
    }
  }
  return {
    skipped_lines: skipped,
    compaction_count: compactions.length,
    compactions,
    status: degraded ? "marker-format-unknown" : "ok",
  };
}

/** Rollout files carry the thread id in their filename. */
export function locateCodexRollout(home: string, threadId: string): string | null {
  const sessionsDir = path.join(home, "sessions");
  if (!fs.existsSync(sessionsDir)) return null;
  const stack = [sessionsDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) return full;
    }
  }
  return null;
}

/** Claude stores transcripts under projects/<munged-cwd>/<sessionId>.jsonl. */
export function locateClaudeTranscript(configDir: string, sessionId: string): string | null {
  const projectsDir = path.join(configDir, "projects");
  if (!fs.existsSync(projectsDir)) return null;
  for (const project of fs.readdirSync(projectsDir)) {
    const candidate = path.join(projectsDir, project, `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function harvestContextTelemetry(opts: {
  provider: "codex" | "claude";
  harness: string;
  home: string;
  ids: string[];
  unobservedTimeouts: number;
}): ContextTelemetry {
  const sources: SourceRecord[] = [];
  for (const id of opts.ids) {
    let file: string | null;
    try {
      file =
        opts.provider === "codex"
          ? locateCodexRollout(opts.home, id)
          : locateClaudeTranscript(opts.home, id);
    } catch {
      // Traversal failure for a KNOWN id is an honest acquisition failure,
      // not a silently missing artifact.
      sources.push({
        id,
        file: null,
        status: "parse-error",
        skipped_lines: 0,
        compaction_count: 0,
        compactions: [],
      });
      continue;
    }
    if (!file) {
      sources.push({
        id,
        file: null,
        status: "not-found",
        skipped_lines: 0,
        compaction_count: 0,
        compactions: [],
      });
      continue;
    }
    let lines: string[];
    let bytes = 0;
    try {
      const raw = fs.readFileSync(file, "utf8");
      bytes = Buffer.byteLength(raw);
      lines = raw.split("\n");
    } catch {
      sources.push({
        id,
        file,
        status: "parse-error",
        skipped_lines: 0,
        compaction_count: 0,
        compactions: [],
      });
      continue;
    }
    if (opts.provider === "codex") {
      sources.push({ id, file, ...parseCodexRollout(lines) });
    } else {
      sources.push({ id, file, transcript_bytes: bytes, ...parseClaudeTranscript(lines) });
    }
  }

  const okSources = sources.filter((s) => s.status === "ok" || s.status === "marker-format-unknown");
  return {
    schema: CONTEXT_TELEMETRY_SCHEMA,
    provider: opts.provider,
    harness: opts.harness,
    ids: opts.ids,
    unobserved_timeouts: opts.unobservedTimeouts,
    status: sources.length === 0 ? "ok" : worstStatus(sources),
    complete: sources.length > 0 && sources.every((s) => s.status === "ok") && opts.unobservedTimeouts === 0,
    model_context_window:
      okSources.map((s) => s.model_context_window).find((w) => typeof w === "number") ?? null,
    compaction_count: okSources.reduce((n, s) => n + s.compaction_count, 0),
    compactions: okSources.flatMap((s) => s.compactions),
    token_counts: okSources.flatMap((s) => s.token_counts ?? []),
    transcript_bytes:
      opts.provider === "claude"
        ? okSources.reduce((n, s) => n + (s.transcript_bytes ?? 0), 0)
        : null,
    sources,
  };
}

/** games/<id>/context-telemetry-<team>.json beside the events log. */
export function writeContextTelemetry(
  eventsPath: string,
  team: string,
  data: ContextTelemetry
): void {
  const gameDir = path.dirname(eventsPath);
  fs.writeFileSync(
    path.join(gameDir, `context-telemetry-${team}.json`),
    JSON.stringify(data, null, 2)
  );
}
