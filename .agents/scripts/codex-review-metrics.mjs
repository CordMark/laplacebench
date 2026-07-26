export const REVIEW_USAGE_FIELDS = [
  'input_tokens',
  'cached_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
];

export function hasScopedChanges(scopeDelta) {
  return ['changed', 'added', 'removed'].some((field) => (scopeDelta?.[field]?.length ?? 0) > 0);
}

export function validOrderedAdjudication(block, issueCount) {
  if (!Number.isInteger(issueCount) || issueCount <= 0 || typeof block !== 'string') return false;
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== issueCount) return false;
  return lines.every((line, index) => {
    const match = line.match(/^(\d+)\.\s+(ACCEPT|REJECT|DEFER)\b/i);
    return match && Number(match[1]) === index + 1;
  });
}

export function selectResumeInspection({
  previousVerdict,
  previousIssueCount,
  adjudicationBlock,
  scopeDelta,
  historyIntegrityOk = true,
}) {
  const eligible = previousVerdict === 'NEEDS_CHANGES'
    && validOrderedAdjudication(adjudicationBlock, previousIssueCount)
    && hasScopedChanges(scopeDelta);
  if (!eligible) return { resumeInspectionMode: 'full_ineligible' };
  if (!historyIntegrityOk) return { resumeInspectionMode: 'full_history_gap' };
  return { resumeInspectionMode: 'compact_delta' };
}

export function normalizeRawUsageShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized = {
    input_tokens: value.input_tokens,
    cached_input_tokens: value.cached_input_tokens,
    output_tokens: value.output_tokens,
    reasoning_output_tokens: value.reasoning_output_tokens ?? 0,
  };
  if (!REVIEW_USAGE_FIELDS.every((field) => Number.isFinite(normalized[field]) && normalized[field] >= 0)) {
    return null;
  }
  if (normalized.cached_input_tokens > normalized.input_tokens) return null;
  return normalized;
}

export function extractLastTurnUsage(logText) {
  let observedTurnStarted = false;
  let observedTurnCompleted = false;
  let lastRawUsage = null;
  for (const line of String(logText ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const payload = JSON.parse(line);
      if (payload.type === 'turn.started') observedTurnStarted = true;
      if (payload.type !== 'turn.completed') continue;
      observedTurnCompleted = true;
      lastRawUsage = normalizeRawUsageShape(payload.usage);
    } catch {}
  }
  return { observedTurnStarted, observedTurnCompleted, rawTotal: lastRawUsage };
}

export function subtractUsage(current, prior) {
  const normalizedCurrent = normalizeRawUsageShape(current);
  const normalizedPrior = normalizeRawUsageShape(prior);
  if (!normalizedCurrent || !normalizedPrior) return null;
  const delta = Object.fromEntries(
    REVIEW_USAGE_FIELDS.map((field) => [field, normalizedCurrent[field] - normalizedPrior[field]]),
  );
  return normalizeRawUsageShape(delta);
}

export function withUncached(usage) {
  if (!usage) return null;
  return {
    ...usage,
    uncached_input_tokens: usage.input_tokens - usage.cached_input_tokens,
  };
}

export function normalizeReviewUsageObservation({
  runMode,
  observedThreadId,
  observation,
  baseline,
}) {
  const rawTotal = normalizeRawUsageShape(observation?.rawTotal);
  const observedTurnCompleted = observation?.observedTurnCompleted === true;
  const prior = baseline && typeof baseline === 'object' ? baseline : null;

  if (!rawTotal) {
    const reason = observedTurnCompleted ? 'invalid_or_partial_usage' : 'review_usage_not_observed';
    return {
      reviewUsage: {
        accountingMode: 'unavailable',
        accountingGapReason: reason,
        rawTotal: null,
        normalizedDelta: null,
      },
      nextBaseline: prior
        ? { ...prior, tainted: true, reason }
        : null,
    };
  }

  const establish = (reason) => ({
    reviewUsage: {
      accountingMode: 'unavailable',
      accountingGapReason: reason,
      rawTotal: withUncached(rawTotal),
      normalizedDelta: null,
    },
    nextBaseline: {
      schemaVersion: 'codex_review_usage_baseline_v1',
      threadId: observedThreadId,
      rawTotal,
      tainted: false,
      reason,
    },
  });

  if (runMode === 'fresh') {
    return {
      reviewUsage: {
        accountingMode: 'fresh_total',
        accountingGapReason: null,
        rawTotal: withUncached(rawTotal),
        normalizedDelta: withUncached(rawTotal),
      },
      nextBaseline: {
        schemaVersion: 'codex_review_usage_baseline_v1',
        threadId: observedThreadId,
        rawTotal,
        tainted: false,
        reason: null,
      },
    };
  }

  if (!prior?.rawTotal) return establish('missing_prior_raw_total');
  if (!observedThreadId || !prior.threadId || observedThreadId !== prior.threadId) {
    return establish('thread_mismatch');
  }
  if (prior.tainted === true) return establish('unavailable_after_usage_gap');
  const delta = subtractUsage(rawTotal, prior.rawTotal);
  if (!delta) return establish('non_monotonic_raw_total');

  return {
    reviewUsage: {
      accountingMode: 'thread_cumulative_delta',
      accountingGapReason: null,
      rawTotal: withUncached(rawTotal),
      normalizedDelta: withUncached(delta),
    },
    nextBaseline: {
      schemaVersion: 'codex_review_usage_baseline_v1',
      threadId: observedThreadId,
      rawTotal,
      tainted: false,
      reason: null,
    },
  };
}

export const RECORD_ONLY_CLOSURE_MODE = 'record_only';

// Repo-relative POSIX paths only. Anything absolute, Windows-separated, or
// escaping the repo root is rejected rather than resolved: the closure
// predicate must never guess what a path means.
export function normalizeRepoRelativePath(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.includes('\\') || value.includes('\0')) return null;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return null;
  const segments = value.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') return null;
  }
  return segments.join('/');
}

// `**` spans any depth, `*` stays inside one segment, `[...]` is a character
// class. No escapes: a backslash makes the glob invalid.
export function globToRegExp(glob) {
  if (typeof glob !== 'string' || !glob || glob !== glob.trim()) return null;
  if (glob.includes('\\')) return null;
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === '*') {
      if (glob[index + 1] === '*') {
        index += 1;
        if (glob[index + 1] === '/') {
          index += 1;
          pattern += '(?:.*/)?';
        } else {
          pattern += '.*';
        }
        continue;
      }
      pattern += '[^/]*';
      continue;
    }
    if (character === '?') {
      pattern += '[^/]';
      continue;
    }
    if (character === '[') {
      const end = glob.indexOf(']', index + 1);
      if (end === -1) return null;
      let body = glob.slice(index + 1, end);
      if (!body || body.includes('/')) return null;
      if (body.startsWith('!')) body = `^${body.slice(1)}`;
      pattern += `[${body}]`;
      index = end;
      continue;
    }
    pattern += character.replace(/[.+^${}()|[\]]/g, '\\$&');
  }
  try {
    return new RegExp(`${pattern}$`);
  } catch {
    return null;
  }
}

export function validateClosurePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return { valid: false, reason: 'policy_not_an_object' };
  }
  const keys = Object.keys(policy);
  if (keys.length !== 1 || keys[0] !== 'protectedGlobs') {
    return { valid: false, reason: `policy_unexpected_keys:${keys.join(',') || 'none'}` };
  }
  const globs = policy.protectedGlobs;
  if (!Array.isArray(globs) || globs.length === 0) {
    return { valid: false, reason: 'policy_protected_globs_empty' };
  }
  const matchers = [];
  for (const glob of globs) {
    const matcher = globToRegExp(glob);
    if (!matcher) {
      return { valid: false, reason: `policy_invalid_glob:${typeof glob === 'string' ? glob : typeof glob}` };
    }
    matchers.push(matcher);
  }
  return { valid: true, matchers };
}

function manifestEntries(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  if (typeof manifest.headSha !== 'string' || !manifest.headSha) return null;
  const entries = manifest.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null;
  const normalized = new Map();
  for (const [rawPath, hash] of Object.entries(entries)) {
    const filePath = normalizeRepoRelativePath(rawPath);
    if (!filePath || typeof hash !== 'string' || !hash) return null;
    normalized.set(filePath, hash);
  }
  return normalized;
}

// Diff of the dirty set (tracked modifications + untracked files) between two
// rounds. A path that returns to its HEAD content leaves the dirty set and is
// reported as removed — still a change to that path.
export function diffWorktreeManifests(previous, current) {
  const previousEntries = manifestEntries(previous);
  if (!previousEntries) return { valid: false, reason: 'previous_manifest_missing_or_invalid' };
  const currentEntries = manifestEntries(current);
  if (!currentEntries) return { valid: false, reason: 'current_manifest_invalid' };
  if (previous.headSha !== current.headSha) return { valid: false, reason: 'head_sha_changed_since_previous_round' };

  const changed = [];
  const added = [];
  const removed = [];
  for (const [filePath, hash] of currentEntries) {
    if (!previousEntries.has(filePath)) added.push(filePath);
    else if (previousEntries.get(filePath) !== hash) changed.push(filePath);
  }
  for (const filePath of previousEntries.keys()) {
    if (!currentEntries.has(filePath)) removed.push(filePath);
  }
  return { valid: true, changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}

// Record-only closure: end an approval cycle whose remaining findings are
// record/document work, without paying for another reviewer round. Safety
// comes from machine predicates over the whole working tree, never from the
// author's description of the findings.
export function evaluateRecordOnlyClosure({ reviewType, previousResult, manifestDiff, policy }) {
  const reject = (reason) => ({ eligible: false, reason, touched: [] });
  if (reviewType !== 'impl') return reject('closure_limited_to_impl_review');
  if (!previousResult || typeof previousResult !== 'object') return reject('previous_result_missing');
  if (previousResult.status !== 'completed') return reject('previous_round_not_completed');
  if (previousResult.payload?.verdict !== 'NEEDS_CHANGES') return reject('previous_verdict_not_needs_changes');

  const policyCheck = validateClosurePolicy(policy);
  if (!policyCheck.valid) return reject(policyCheck.reason);

  if (!manifestDiff?.valid) return reject(manifestDiff?.reason ?? 'manifest_diff_unavailable');
  const touched = [...manifestDiff.changed, ...manifestDiff.added, ...manifestDiff.removed];
  if (touched.length === 0) return reject('no_change_since_previous_round');

  const nonMarkdown = touched.filter((filePath) => !filePath.toLowerCase().endsWith('.md'));
  if (nonMarkdown.length > 0) return reject(`non_markdown_change:${nonMarkdown.slice(0, 5).join(',')}`);

  const governance = touched.filter((filePath) => policyCheck.matchers.some((matcher) => matcher.test(filePath)));
  if (governance.length > 0) return reject(`governance_path_change:${governance.slice(0, 5).join(',')}`);

  return { eligible: true, reason: null, touched };
}

export function isCompletedReviewRecord(record) {
  return record?.status === 'completed' && ['APPROVED', 'NEEDS_CHANGES'].includes(record.verdict);
}

export function deriveNextApprovalPosition(records) {
  let approvalCycle = 1;
  let roundInCycle = 1;
  let priorCompletedVerdict = null;
  let historyGapCount = 0;

  for (const record of records ?? []) {
    if (isCompletedReviewRecord(record)) {
      priorCompletedVerdict = record.verdict;
      if (record.verdict === 'APPROVED') {
        approvalCycle += 1;
        roundInCycle = 1;
      } else {
        roundInCycle += 1;
      }
    } else if (record?.status !== 'failed') {
      historyGapCount += 1;
    }
  }
  return { approvalCycle, roundInCycle, priorCompletedVerdict, historyGapCount };
}

export function isRecordOnlyClosureRecord(record) {
  return record?.closureMode === RECORD_ONLY_CLOSURE_MODE;
}

// A record-only closure closes the approval cycle without a Codex execution
// round. It is counted separately so round KPIs keep meaning "rounds a
// reviewer actually ran".
export function reconstructApprovalCycles(records) {
  const cycles = [];
  let current = null;
  let gapCount = 0;
  let failedAttempts = 0;
  for (const record of records ?? []) {
    if (record?.status === 'failed') {
      failedAttempts += 1;
      continue;
    }
    if (!isCompletedReviewRecord(record)) {
      gapCount += 1;
      continue;
    }
    const closure = isRecordOnlyClosureRecord(record);
    if (closure && (!current || current.closed)) {
      // A closure with no open cycle cannot be reconstructed: it claims to
      // close something that never opened.
      gapCount += 1;
      continue;
    }
    if (!current || current.closed) {
      current = { cycle: cycles.length + 1, rounds: 0, closureRounds: 0, closed: false };
      cycles.push(current);
    }
    if (closure) {
      current.closureRounds += 1;
      current.closed = true;
      continue;
    }
    current.rounds += 1;
    if (record.verdict === 'APPROVED') current.closed = true;
  }
  return { cycles, gapCount, failedAttempts };
}
