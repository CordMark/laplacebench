import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  deriveNextApprovalPosition,
  diffWorktreeManifests,
  evaluateRecordOnlyClosure,
  extractLastTurnUsage,
  globToRegExp,
  normalizeRepoRelativePath,
  normalizeReviewUsageObservation,
  reconstructApprovalCycles,
  selectResumeInspection,
  validOrderedAdjudication,
  validateClosurePolicy,
} from './codex-review-metrics.mjs';

const raw = (input, cached, output, reasoning = 0) => ({
  input_tokens: input,
  cached_input_tokens: cached,
  output_tokens: output,
  reasoning_output_tokens: reasoning,
});

const fresh = normalizeReviewUsageObservation({
  runMode: 'fresh', observedThreadId: 'thread-1',
  observation: { observedTurnStarted: true, observedTurnCompleted: true, rawTotal: raw(100, 40, 10) },
  baseline: null,
});
assert.equal(fresh.reviewUsage.accountingMode, 'fresh_total');
assert.equal(fresh.reviewUsage.normalizedDelta.uncached_input_tokens, 60);

const resumed = normalizeReviewUsageObservation({
  runMode: 'resume', observedThreadId: 'thread-1',
  observation: { observedTurnStarted: true, observedTurnCompleted: true, rawTotal: raw(180, 100, 20) },
  baseline: fresh.nextBaseline,
});
assert.deepEqual(resumed.reviewUsage.normalizedDelta, { ...raw(80, 60, 10), uncached_input_tokens: 20 });
assert.equal(normalizeReviewUsageObservation({
  runMode: 'resume', observedThreadId: 'thread-1',
  observation: { observedTurnStarted: true, observedTurnCompleted: true, rawTotal: raw(180, 100, 20) }, baseline: null,
}).reviewUsage.accountingGapReason, 'missing_prior_raw_total');
assert.equal(normalizeReviewUsageObservation({
  runMode: 'resume', observedThreadId: 'thread-2',
  observation: { observedTurnStarted: true, observedTurnCompleted: true, rawTotal: raw(200, 120, 20) }, baseline: resumed.nextBaseline,
}).reviewUsage.accountingGapReason, 'thread_mismatch');
assert.equal(normalizeReviewUsageObservation({
  runMode: 'resume', observedThreadId: 'thread-1',
  observation: { observedTurnStarted: true, observedTurnCompleted: true, rawTotal: raw(170, 90, 20) }, baseline: resumed.nextBaseline,
}).reviewUsage.accountingGapReason, 'non_monotonic_raw_total');
assert.equal(extractLastTurnUsage(`${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 2 } })}\n`).rawTotal, null);

const tainted = normalizeReviewUsageObservation({
  runMode: 'resume', observedThreadId: 'thread-1',
  observation: { observedTurnStarted: true, observedTurnCompleted: false, rawTotal: null }, baseline: resumed.nextBaseline,
});
assert.equal(tainted.nextBaseline.tainted, true);
const taintedWithoutEvents = normalizeReviewUsageObservation({
  runMode: 'resume', observedThreadId: 'thread-1',
  observation: { observedTurnStarted: false, observedTurnCompleted: false, rawTotal: null }, baseline: resumed.nextBaseline,
});
assert.equal(taintedWithoutEvents.nextBaseline.tainted, true);
assert.equal(normalizeReviewUsageObservation({
  runMode: 'resume', observedThreadId: 'thread-1',
  observation: { observedTurnStarted: true, observedTurnCompleted: true, rawTotal: raw(220, 130, 30) }, baseline: tainted.nextBaseline,
}).reviewUsage.accountingGapReason, 'unavailable_after_usage_gap');

const history = [
  { status: 'completed', verdict: 'NEEDS_CHANGES' },
  { status: 'failed', verdict: null },
  { status: 'completed', verdict: 'APPROVED' },
];
assert.deepEqual(deriveNextApprovalPosition(history), {
  approvalCycle: 2, roundInCycle: 1, priorCompletedVerdict: 'APPROVED', historyGapCount: 0,
});
assert.deepEqual(reconstructApprovalCycles([...history, { status: 'completed', verdict: 'APPROVED' }]).cycles, [
  { cycle: 1, rounds: 2, closureRounds: 0, closed: true },
  { cycle: 2, rounds: 1, closureRounds: 0, closed: true },
]);

// A record-only closure closes its cycle without counting as a reviewer round.
const closureRecord = { status: 'completed', verdict: 'APPROVED', closureMode: 'record_only' };
assert.deepEqual(reconstructApprovalCycles([
  { status: 'completed', verdict: 'NEEDS_CHANGES' },
  { status: 'completed', verdict: 'NEEDS_CHANGES' },
  closureRecord,
]).cycles, [{ cycle: 1, rounds: 2, closureRounds: 1, closed: true }]);
assert.deepEqual(deriveNextApprovalPosition([
  { status: 'completed', verdict: 'NEEDS_CHANGES' },
  closureRecord,
]), { approvalCycle: 2, roundInCycle: 1, priorCompletedVerdict: 'APPROVED', historyGapCount: 0 });
// A closure with no open cycle claims to close something that never opened.
assert.deepEqual(reconstructApprovalCycles([closureRecord]), { cycles: [], gapCount: 1, failedAttempts: 0 });
assert.equal(reconstructApprovalCycles([
  { status: 'completed', verdict: 'NEEDS_CHANGES' }, closureRecord, closureRecord,
]).gapCount, 1);

for (const [value, expected] of [
  ['docs/norms/a.md', 'docs/norms/a.md'],
  ['/abs/path.md', null],
  ['C:/win/path.md', null],
  ['docs\\norms\\a.md', null],
  ['../outside.md', null],
  ['docs/../escape.md', null],
  ['docs//double.md', null],
  ['./here.md', null],
  ['', null],
]) assert.equal(normalizeRepoRelativePath(value), expected, `normalize ${value}`);

const matches = (glob, filePath) => globToRegExp(glob)?.test(filePath);
assert.equal(matches('docs/norms/**', 'docs/norms/a.md'), true);
assert.equal(matches('docs/norms/**', 'docs/norms/deep/nested/a.md'), true);
assert.equal(matches('docs/norms/**', 'docs/normsx/a.md'), false);
assert.equal(matches('docs/status/9[5-8]-*', 'docs/status/96-legacy-migration-program-map.md'), true);
assert.equal(matches('docs/status/9[5-8]-*', 'docs/status/94-other.md'), false);
assert.equal(matches('docs/status/9[5-8]-*', 'docs/status/96-a/deep.md'), false, '* must not cross a separator');
assert.equal(matches('docs/regressions/ledger.md', 'docs/regressions/ledger.md'), true);
assert.equal(matches('docs/regressions/ledger.md', 'docs/regressions/ledger.md.bak'), false);
assert.equal(matches('CLAUDE.md', 'CLAUDE.md'), true);
assert.equal(matches('CLAUDE.md', 'sub/CLAUDE.md'), false);
assert.equal(matches('**/CLAUDE.md', 'sub/dir/CLAUDE.md'), true);
assert.equal(matches('**/CLAUDE.md', 'CLAUDE.md'), true);
for (const invalid of ['', ' docs/**', 'docs\\**', 'docs/[unterminated', 'docs/[a/b]', 42, null]) {
  assert.equal(globToRegExp(invalid), null, `invalid glob ${String(invalid)}`);
}

assert.equal(validateClosurePolicy({ protectedGlobs: ['docs/norms/**'] }).valid, true);
for (const [policy, reason] of [
  [null, 'policy_not_an_object'],
  [[], 'policy_not_an_object'],
  [{}, 'policy_unexpected_keys:none'],
  [{ protectedGlobs: ['a/**'], extra: 1 }, 'policy_unexpected_keys:protectedGlobs,extra'],
  [{ protectedGlobs: [] }, 'policy_protected_globs_empty'],
  [{ protectedGlobs: 'docs/**' }, 'policy_protected_globs_empty'],
  [{ protectedGlobs: [''] }, 'policy_invalid_glob:'],
  [{ protectedGlobs: [7] }, 'policy_invalid_glob:number'],
]) assert.equal(validateClosurePolicy(policy).reason, reason, `policy ${JSON.stringify(policy)}`);

const manifest = (headSha, entries) => ({ headSha, entries });
assert.deepEqual(
  diffWorktreeManifests(manifest('h1', { 'a.md': '1', 'b.md': '2' }), manifest('h1', { 'a.md': '9', 'c.md': '3' })),
  { valid: true, changed: ['a.md'], added: ['c.md'], removed: ['b.md'] },
);
assert.equal(diffWorktreeManifests(manifest('h1', {}), manifest('h2', {})).reason, 'head_sha_changed_since_previous_round');
assert.equal(diffWorktreeManifests(undefined, manifest('h1', {})).reason, 'previous_manifest_missing_or_invalid');
assert.equal(diffWorktreeManifests(manifest('h1', { '../escape.md': '1' }), manifest('h1', {})).reason, 'previous_manifest_missing_or_invalid');
assert.equal(diffWorktreeManifests(manifest('h1', {}), manifest('h1', { '/abs.md': '1' })).reason, 'current_manifest_invalid');

const closurePolicy = { protectedGlobs: ['docs/norms/**', 'docs/status/9[5-8]-*', 'CLAUDE.md'] };
const needsChanges = { status: 'completed', payload: { verdict: 'NEEDS_CHANGES' } };
const closureCase = (overrides = {}) => evaluateRecordOnlyClosure({
  reviewType: 'impl',
  previousResult: needsChanges,
  manifestDiff: { valid: true, changed: ['docs/plans/p.md'], added: [], removed: [] },
  policy: closurePolicy,
  ...overrides,
});
assert.deepEqual(closureCase(), { eligible: true, reason: null, touched: ['docs/plans/p.md'] });
for (const [overrides, reason] of [
  [{ reviewType: 'plan' }, 'closure_limited_to_impl_review'],
  [{ previousResult: null }, 'previous_result_missing'],
  [{ previousResult: { status: 'failed' } }, 'previous_round_not_completed'],
  [{ previousResult: { status: 'completed', payload: { verdict: 'APPROVED' } } }, 'previous_verdict_not_needs_changes'],
  [{ previousResult: { status: 'completed', payload: {} } }, 'previous_verdict_not_needs_changes'],
  [{ policy: { protectedGlobs: [] } }, 'policy_protected_globs_empty'],
  [{ manifestDiff: { valid: false, reason: 'head_sha_changed_since_previous_round' } }, 'head_sha_changed_since_previous_round'],
  [{ manifestDiff: undefined }, 'manifest_diff_unavailable'],
  [{ manifestDiff: { valid: true, changed: [], added: [], removed: [] } }, 'no_change_since_previous_round'],
  [{ manifestDiff: { valid: true, changed: ['docs/plans/p.md'], added: ['src/app.ts'], removed: [] } }, 'non_markdown_change:src/app.ts'],
  [{ manifestDiff: { valid: true, changed: [], added: [], removed: ['scripts/tool.mjs'] } }, 'non_markdown_change:scripts/tool.mjs'],
  [{ manifestDiff: { valid: true, changed: ['docs/norms/product-normative-model.md'], added: [], removed: [] } }, 'governance_path_change:docs/norms/product-normative-model.md'],
  [{ manifestDiff: { valid: true, changed: ['docs/status/96-map.md'], added: [], removed: [] } }, 'governance_path_change:docs/status/96-map.md'],
  [{ manifestDiff: { valid: true, changed: ['CLAUDE.md'], added: [], removed: [] } }, 'governance_path_change:CLAUDE.md'],
]) assert.deepEqual(closureCase(overrides), { eligible: false, reason, touched: [] }, `closure ${reason}`);
assert.equal(reconstructApprovalCycles([{ status: 'malformed' }, {}, { status: 'completed', verdict: 'UNKNOWN' }]).gapCount, 3);
assert.equal(deriveNextApprovalPosition([{ status: 'malformed' }, {}, { status: 'completed', verdict: 'UNKNOWN' }]).historyGapCount, 3);
assert.equal(validOrderedAdjudication('1. ACCEPT fixed\n2. REJECT not applicable', 2), true);
for (const invalid of [
  '1. ACCEPT fixed',
  '1. ACCEPT fixed\n1. REJECT duplicate',
  '2. ACCEPT out of order\n1. REJECT wrong',
  '1. ACCEPT fixed\n2. UNKNOWN no',
  '1. ACCEPT fixed\n2. REJECT no\n3. DEFER extra',
]) assert.equal(validOrderedAdjudication(invalid, 2), false);
const compactBase = {
  previousVerdict: 'NEEDS_CHANGES', previousIssueCount: 1,
  adjudicationBlock: '1. ACCEPT fixed', scopeDelta: { changed: ['x.ts'], added: [], removed: [] },
};
assert.equal(selectResumeInspection(compactBase).resumeInspectionMode, 'compact_delta');
assert.equal(selectResumeInspection({ ...compactBase, adjudicationBlock: '' }).resumeInspectionMode, 'full_ineligible');
assert.equal(selectResumeInspection({ ...compactBase, scopeDelta: { changed: [], added: [], removed: [] } }).resumeInspectionMode, 'full_ineligible');
assert.equal(selectResumeInspection({
  ...compactBase, historyIntegrityOk: false,
}).resumeInspectionMode, 'full_history_gap');

// End-to-end runner fixture: fake Codex emits cumulative totals across resumes.
const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-review-runner-'));
try {
  const project = path.join(tempRoot, 'project');
  const scriptDir = path.join(project, '.agents', 'scripts');
  const binDir = path.join(tempRoot, 'bin');
  await fs.mkdir(scriptDir, { recursive: true });
  await fs.mkdir(binDir, { recursive: true });
  for (const name of ['run-codex-review.mjs', 'codex-review-metrics.mjs', 'review-schema.json']) {
    await fs.copyFile(path.join(sourceDir, name), path.join(scriptDir, name));
  }
  const counterFile = path.join(tempRoot, 'counter');
  const fakeCodex = path.join(binDir, 'codex');
  await fs.writeFile(fakeCodex, `#!/usr/bin/env node
const fs = require('fs');
const count = Number(fs.existsSync(process.env.FAKE_CODEX_COUNTER) ? fs.readFileSync(process.env.FAKE_CODEX_COUNTER, 'utf8') : 0) + 1;
fs.writeFileSync(process.env.FAKE_CODEX_COUNTER, String(count));
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  if (process.env.FAKE_CODEX_STDIN_CAPTURE) fs.writeFileSync(process.env.FAKE_CODEX_STDIN_CAPTURE, stdin);
  const mode = process.env.FAKE_CODEX_MODE || 'normal';
  const verdict = count === 1 ? 'NEEDS_CHANGES' : 'APPROVED';
  const totals = [null, {input_tokens:100,cached_input_tokens:40,output_tokens:10,reasoning_output_tokens:2}, {input_tokens:180,cached_input_tokens:100,output_tokens:20,reasoning_output_tokens:4}, {input_tokens:230,cached_input_tokens:130,output_tokens:25,reasoning_output_tokens:5}][count];
  const payload = {verdict,issues:verdict === 'NEEDS_CHANGES' ? [{severity:'major',location:'fixture',problem:'fix me',suggestion:'fix'}] : [],summary:'fixture',confidence:1};
  console.log(JSON.stringify({type:'thread.started',thread_id:'thread-fixture'}));
  console.log(JSON.stringify({type:'turn.started'}));
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(payload)}}));
  if (!(mode === 'failed-gap' && count === 2)) console.log(JSON.stringify({type:'turn.completed',usage:totals}));
  if (mode === 'resettable' && count === 2) console.error('session not found');
  if ((mode === 'failed-valid' && count === 2) || (mode === 'failed-gap' && count === 2) || (mode === 'resettable' && count === 2)) process.exitCode = 1;
});
`);
  await fs.chmod(fakeCodex, 0o755);
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_CODEX_COUNTER: counterFile,
    CODEX_REVIEW_TIMEOUT_SECONDS: '10',
  };
  for (let index = 0; index < 3; index += 1) {
    const run = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', 'fixture'], {
      cwd: project, env, input: 'Review fixture.', encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
  }
  const metricLines = (await fs.readFile(path.join(project, '.agents', 'state', 'codex-impl-fixture.result.jsonl'), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.deepEqual(metricLines.map((record) => [record.approvalCycle, record.roundInCycle]), [[1, 1], [1, 2], [2, 1]]);
  assert.deepEqual(metricLines.map((record) => record.reviewUsage.normalizedDelta.input_tokens), [100, 80, 50]);
  const normalMetricsPath = path.join(project, '.agents', 'state', 'codex-impl-fixture.result.jsonl');
  await fs.appendFile(normalMetricsPath, '{malformed\n', 'utf8');
  const afterMalformed = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', 'fixture'], {
    cwd: project, env, input: 'Review fixture.', encoding: 'utf8',
  });
  assert.equal(afterMalformed.status, 0, afterMalformed.stderr);
  const afterMalformedLines = (await fs.readFile(normalMetricsPath, 'utf8')).trim().split('\n');
  const afterMalformedRecord = JSON.parse(afterMalformedLines.at(-1));
  assert.equal(afterMalformedRecord.approvalCycle, 3);
  assert.equal(afterMalformedRecord.roundInCycle, 1);
  assert.equal(afterMalformedRecord.historyGapCount, 1);
  await fs.writeFile(
    normalMetricsPath,
    `${afterMalformedLines.filter((line) => {
      try { JSON.parse(line); return true; } catch { return false; }
    }).join('\n')}\n`,
  );

  await fs.writeFile(counterFile, '0');
  const failedValidEnv = { ...env, FAKE_CODEX_MODE: 'failed-valid' };
  for (const expectedStatus of [0, 1, 0]) {
    const run = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', 'failed-valid'], {
      cwd: project, env: failedValidEnv, input: 'Review fixture.', encoding: 'utf8',
    });
    assert.equal(run.status, expectedStatus, run.stderr);
  }
  const failedValidMetrics = (await fs.readFile(path.join(project, '.agents', 'state', 'codex-impl-failed-valid.result.jsonl'), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.deepEqual(failedValidMetrics.map((record) => record.status), ['completed', 'failed', 'completed']);
  assert.equal(failedValidMetrics[2].roundInCycle, 2, 'failed attempt must not advance approval round');
  assert.equal(failedValidMetrics[2].reviewUsage.normalizedDelta.input_tokens, 50, 'failed valid usage must advance baseline');

  await fs.writeFile(counterFile, '0');
  const failedGapEnv = { ...env, FAKE_CODEX_MODE: 'failed-gap' };
  for (const expectedStatus of [0, 1, 0]) {
    const run = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', 'failed-gap'], {
      cwd: project, env: failedGapEnv, input: 'Review fixture.', encoding: 'utf8',
    });
    assert.equal(run.status, expectedStatus, run.stderr);
  }
  const failedGapMetrics = (await fs.readFile(path.join(project, '.agents', 'state', 'codex-impl-failed-gap.result.jsonl'), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.equal(failedGapMetrics[2].roundInCycle, 2);
  assert.equal(failedGapMetrics[2].reviewUsage.accountingGapReason, 'unavailable_after_usage_gap');
  assert.equal(failedGapMetrics[2].reviewUsage.normalizedDelta, null);

  const compactSession = 'compact';
  await fs.writeFile(counterFile, '0');
  const scopedFile = path.join(project, 'scoped.md');
  await fs.writeFile(scopedFile, 'before\n');
  const firstCompact = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', compactSession], {
    cwd: project, env, input: `FULL-PROMPT-MARKER\n- ${scopedFile}\n`, encoding: 'utf8',
  });
  assert.equal(firstCompact.status, 0, firstCompact.stderr);
  await fs.writeFile(scopedFile, 'after\n');
  const inputCapture = path.join(tempRoot, 'stdin-capture');
  const compactEnv = { ...env, FAKE_CODEX_STDIN_CAPTURE: inputCapture };
  const compactRun = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', compactSession], {
    cwd: project,
    env: compactEnv,
    input: `FULL-PROMPT-MARKER\n- ${scopedFile}\nParent-Adjudication:\n1. ACCEPT fixed\nValidation:\n- focused test passed\n`,
    encoding: 'utf8',
  });
  assert.equal(compactRun.status, 0, compactRun.stderr);
  const compactInput = await fs.readFile(inputCapture, 'utf8');
  assert.match(compactInput, /Delta-scoped inspection:/);
  assert.doesNotMatch(compactInput, /FULL-PROMPT-MARKER/);
  const compactMetrics = (await fs.readFile(path.join(project, '.agents', 'state', `codex-impl-${compactSession}.result.jsonl`), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.equal(compactMetrics[1].resumeInspectionMode, 'compact_delta');

  await fs.writeFile(counterFile, '0');
  const fullSession = 'full-ineligible';
  await fs.writeFile(scopedFile, 'unchanged\n');
  const firstFull = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', fullSession], {
    cwd: project, env, input: `FULL-INELIGIBLE-MARKER\n- ${scopedFile}\n`, encoding: 'utf8',
  });
  assert.equal(firstFull.status, 0, firstFull.stderr);
  const fullCapture = path.join(tempRoot, 'full-stdin-capture');
  const fullRun = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', fullSession], {
    cwd: project,
    env: { ...env, FAKE_CODEX_STDIN_CAPTURE: fullCapture },
    input: `FULL-INELIGIBLE-MARKER\n- ${scopedFile}\nParent-Adjudication:\n1. ACCEPT fixed\nValidation:\n- no scoped file changed\n`,
    encoding: 'utf8',
  });
  assert.equal(fullRun.status, 0, fullRun.stderr);
  assert.match(await fs.readFile(fullCapture, 'utf8'), /FULL-INELIGIBLE-MARKER/);
  const fullMetrics = (await fs.readFile(path.join(project, '.agents', 'state', `codex-impl-${fullSession}.result.jsonl`), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.equal(fullMetrics[1].resumeInspectionMode, 'full_ineligible');

  await fs.writeFile(counterFile, '0');
  const failedCompactSession = 'failed-compact';
  await fs.writeFile(scopedFile, 'failure-before\n');
  const firstFailedCompact = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', failedCompactSession], {
    cwd: project, env, input: `- ${scopedFile}\n`, encoding: 'utf8',
  });
  assert.equal(firstFailedCompact.status, 0, firstFailedCompact.stderr);
  await fs.writeFile(scopedFile, 'failure-after\n');
  const failedCompactRun = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', failedCompactSession], {
    cwd: project,
    env: { ...env, FAKE_CODEX_MODE: 'failed-valid' },
    input: `- ${scopedFile}\nParent-Adjudication:\n1. ACCEPT fixed\nValidation:\n- focused test failed after reviewer output\n`,
    encoding: 'utf8',
  });
  assert.equal(failedCompactRun.status, 1, failedCompactRun.stderr);
  const failedCompactMetrics = (await fs.readFile(path.join(project, '.agents', 'state', `codex-impl-${failedCompactSession}.result.jsonl`), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.equal(failedCompactMetrics[1].status, 'failed');
  assert.equal(failedCompactMetrics[1].resumeInspectionMode, 'compact_delta');
  const compactRetry = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', failedCompactSession], {
    cwd: project,
    env,
    input: `- ${scopedFile}\nParent-Adjudication:\n1. ACCEPT fixed\nValidation:\n- retry after transport failure\n`,
    encoding: 'utf8',
  });
  assert.equal(compactRetry.status, 0, compactRetry.stderr);
  const compactRetryMetrics = (await fs.readFile(path.join(project, '.agents', 'state', `codex-impl-${failedCompactSession}.result.jsonl`), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.equal(compactRetryMetrics[2].resumeInspectionMode, 'compact_delta');

  await fs.writeFile(counterFile, '0');
  const resetSession = 'reset-compact';
  await fs.writeFile(scopedFile, 'reset-before\n');
  const firstReset = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', resetSession], {
    cwd: project, env, input: `- ${scopedFile}\n`, encoding: 'utf8',
  });
  assert.equal(firstReset.status, 0, firstReset.stderr);
  await fs.writeFile(scopedFile, 'reset-after\n');
  const resetRun = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', resetSession], {
    cwd: project,
    env: { ...env, FAKE_CODEX_MODE: 'resettable' },
    input: `- ${scopedFile}\nParent-Adjudication:\n1. ACCEPT fixed\nValidation:\n- retry from a reset native thread\n`,
    encoding: 'utf8',
  });
  assert.equal(resetRun.status, 0, resetRun.stderr);
  const resetMetrics = (await fs.readFile(path.join(project, '.agents', 'state', `codex-impl-${resetSession}.result.jsonl`), 'utf8'))
    .trim().split('\n').map(JSON.parse);
  assert.deepEqual(resetMetrics.slice(1).map((record) => record.resumeInspectionMode), ['compact_delta', 'full_reset_fallback']);

  await fs.writeFile(counterFile, '0');
  const localGapSession = 'local-history-gap';
  await fs.writeFile(scopedFile, 'local-gap-before\n');
  const firstLocalGap = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', localGapSession], {
    cwd: project, env, input: `- ${scopedFile}\n`, encoding: 'utf8',
  });
  assert.equal(firstLocalGap.status, 0, firstLocalGap.stderr);
  await fs.writeFile(scopedFile, 'local-gap-after\n');
  const localGapMetricsPath = path.join(project, '.agents', 'state', `codex-impl-${localGapSession}.result.jsonl`);
  await fs.appendFile(localGapMetricsPath, '{malformed\n');
  const localGapRun = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', localGapSession], {
    cwd: project,
    env,
    input: `- ${scopedFile}\nParent-Adjudication:\n1. ACCEPT fixed\nValidation:\n- local history gap must retain full review\n`,
    encoding: 'utf8',
  });
  assert.equal(localGapRun.status, 0, localGapRun.stderr);
  const localGapLines = (await fs.readFile(localGapMetricsPath, 'utf8')).trim().split('\n');
  assert.equal(JSON.parse(localGapLines.at(-1)).resumeInspectionMode, 'full_history_gap');
  await fs.writeFile(localGapMetricsPath, `${localGapLines.filter((line) => {
    try { JSON.parse(line); return true; } catch { return false; }
  }).join('\n')}\n`);

  for (const [session, removeHistory] of [
    ['missing-history', true],
    ['unrecorded-result', false],
  ]) {
    await fs.writeFile(counterFile, '0');
    await fs.writeFile(scopedFile, `${session}-before\n`);
    const first = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', session], {
      cwd: project, env, input: `- ${scopedFile}\n`, encoding: 'utf8',
    });
    assert.equal(first.status, 0, first.stderr);
    await fs.writeFile(scopedFile, `${session}-after\n`);
    const metricsPath = path.join(project, '.agents', 'state', `codex-impl-${session}.result.jsonl`);
    if (removeHistory) await fs.unlink(metricsPath);
    else await fs.writeFile(metricsPath, '');
    const resume = spawnSync(process.execPath, [path.join(scriptDir, 'run-codex-review.mjs'), 'impl', session], {
      cwd: project,
      env,
      input: `- ${scopedFile}\nParent-Adjudication:\n1. ACCEPT fixed\nValidation:\n- incomplete local history must retain full review\n`,
      encoding: 'utf8',
    });
    assert.equal(resume.status, 0, resume.stderr);
    const records = (await fs.readFile(metricsPath, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(records.at(-1).resumeInspectionMode, 'full_history_gap');
  }

  // Record-only closure: end-to-end, inside a real git repository, proving the
  // Codex process is never started.
  const closureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-review-closure-'));
  try {
    const closureScripts = path.join(closureRoot, '.agents', 'scripts');
    await fs.mkdir(closureScripts, { recursive: true });
    for (const name of ['run-codex-review.mjs', 'codex-review-metrics.mjs', 'review-schema.json']) {
      await fs.copyFile(path.join(sourceDir, name), path.join(closureScripts, name));
    }
    const git = (...args) => {
      const run = spawnSync('git', ['-C', closureRoot, ...args], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
    };
    git('init', '-q');
    git('config', 'user.email', 'fixture@example.com');
    git('config', 'user.name', 'fixture');
    // Runner state is regenerated every round; projects gitignore it, and a
    // project that does not will see closure refuse with those paths named.
    await fs.writeFile(path.join(closureRoot, '.gitignore'), '.agents/state/\n');
    const planFile = path.join(closureRoot, 'docs', 'plans', 'p.md');
    const normFile = path.join(closureRoot, 'docs', 'norms', 'n.md');
    const codeFile = path.join(closureRoot, 'src', 'app.ts');
    for (const file of [planFile, normFile, codeFile]) await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(planFile, 'plan\n');
    await fs.writeFile(normFile, 'norm\n');
    await fs.writeFile(codeFile, 'export const a = 1;\n');
    await fs.writeFile(
      path.join(closureRoot, '.agents', 'review-closure-policy.json'),
      `${JSON.stringify({ protectedGlobs: ['docs/norms/**', 'CLAUDE.md'] }, null, 2)}\n`,
    );
    git('add', '-A');
    git('commit', '-qm', 'fixture');

    const closureCounter = path.join(closureRoot, 'counter');
    const closureEnv = { ...env, FAKE_CODEX_COUNTER: closureCounter };
    const runner = path.join(closureScripts, 'run-codex-review.mjs');
    const closureState = path.join(closureRoot, '.agents', 'state');
    const runClosure = (session, extra = []) => spawnSync(
      process.execPath,
      [runner, 'impl', session, '--close-record-only', ...extra],
      { cwd: closureRoot, env: closureEnv, input: 'Record-only findings applied.\n', encoding: 'utf8' },
    );
    const seedNeedsChanges = async (session) => {
      await fs.writeFile(closureCounter, '0');
      const seed = spawnSync(process.execPath, [runner, 'impl', session], {
        cwd: closureRoot, env: closureEnv, input: 'Review fixture.', encoding: 'utf8',
      });
      assert.equal(seed.status, 0, seed.stderr);
      return Number(await fs.readFile(closureCounter, 'utf8'));
    };

    const codexCallsBefore = await seedNeedsChanges('closure-ok');
    await fs.writeFile(planFile, 'plan updated\n');
    const closureRun = runClosure('closure-ok');
    assert.equal(closureRun.status, 0, closureRun.stderr);
    assert.equal(JSON.parse(closureRun.stdout).verdict, 'APPROVED');
    assert.equal(
      Number(await fs.readFile(closureCounter, 'utf8')),
      codexCallsBefore,
      'record-only closure must not start Codex',
    );
    const closureMetrics = (await fs.readFile(path.join(closureState, 'codex-impl-closure-ok.result.jsonl'), 'utf8'))
      .trim().split('\n').map(JSON.parse);
    assert.equal(closureMetrics.at(-1).closureMode, 'record_only');
    assert.equal(closureMetrics.at(-1).verdict, 'APPROVED');
    assert.deepEqual(reconstructApprovalCycles(closureMetrics).cycles, [
      { cycle: 1, rounds: 1, closureRounds: 1, closed: true },
    ]);
    assert.deepEqual(closureMetrics.at(-1).reviewUsage, {
      accountingMode: 'not_started', accountingGapReason: null, rawTotal: null, normalizedDelta: null,
    });

    // One cycle takes exactly one closure: the second attempt sees APPROVED.
    const secondClosure = runClosure('closure-ok');
    assert.equal(secondClosure.status, 3, secondClosure.stderr);
    assert.match(secondClosure.stderr, /previous_verdict_not_needs_changes/);

    // Two closures started at the same instant: exactly one may approve.
    await seedNeedsChanges('closure-race');
    await fs.writeFile(planFile, 'plan raced\n');
    const raceRuns = await Promise.all([0, 1].map(() => new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [runner, 'impl', 'closure-race', '--close-record-only'],
        { cwd: closureRoot, env: closureEnv },
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdin.end('Record-only findings applied.\n');
      child.on('close', (status) => resolve({ status, stderr }));
    })));
    const raceRecords = (await fs.readFile(path.join(closureState, 'codex-impl-closure-race.result.jsonl'), 'utf8'))
      .trim().split('\n').map(JSON.parse);
    assert.equal(
      raceRecords.filter((record) => record.closureMode).length,
      1,
      `exactly one closure record must exist: ${JSON.stringify(raceRuns)}`,
    );
    // A loser either refuses (the cycle is already closed) or exits 0 by
    // reusing the completed result — never by writing a second closure.
    assert.ok(raceRuns.some((run) => run.status === 0), JSON.stringify(raceRuns));
    assert.ok(raceRuns.every((run) => [0, 3, 4].includes(run.status)), JSON.stringify(raceRuns));
    assert.equal(
      await fs.stat(path.join(closureState, 'codex-impl-closure-race.cycle-1.closed')).then(() => true, () => false),
      true,
      'the closed cycle must leave a permanent marker',
    );
    assert.deepEqual(reconstructApprovalCycles(raceRecords).cycles, [
      { cycle: 1, rounds: 1, closureRounds: 1, closed: true },
    ]);
    assert.equal(reconstructApprovalCycles(raceRecords).gapCount, 0);

    // Closure versus a normal review starting together. Closure arbitrates on
    // the cycle marker and re-checks the history at commit; the normal review
    // path is deliberately unchanged, so the accepted residual is that a review
    // may open the next cycle. The history must stay coherent either way.
    await seedNeedsChanges('closure-vs-review');
    await fs.writeFile(planFile, 'plan mixed\n');
    const spawnPath = (args, input) => new Promise((resolve) => {
      const child = spawn(process.execPath, args, { cwd: closureRoot, env: closureEnv });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.stdin.end(input);
      child.on('close', (status) => resolve({ status, stderr }));
    });
    const mixed = await Promise.all([
      spawnPath([runner, 'impl', 'closure-vs-review', '--close-record-only'], 'Record-only findings applied.\n'),
      spawnPath([runner, 'impl', 'closure-vs-review'], 'Review fixture.'),
    ]);
    const mixedRecords = (await fs.readFile(path.join(closureState, 'codex-impl-closure-vs-review.result.jsonl'), 'utf8'))
      .trim().split('\n').map(JSON.parse);
    const mixedCycles = reconstructApprovalCycles(mixedRecords);
    // The guaranteed invariant is the marker's: at most one closure per cycle.
    // Running both at once is documented as unsupported — a superseded closure
    // may survive and reconstruction reports it as a gap rather than hiding it.
    assert.ok(
      mixedRecords.filter((record) => record.closureMode).length <= 1,
      `at most one closure record: ${JSON.stringify(mixedRecords)}`,
    );
    assert.ok(
      mixedCycles.cycles.every((cycle) => cycle.closureRounds <= 1),
      `no cycle may take two closures: ${JSON.stringify(mixedCycles.cycles)}`,
    );
    assert.ok(mixed.some((run) => run.status === 0), JSON.stringify(mixed));

    // A live active run blocks closure before it evaluates anything.
    await seedNeedsChanges('closure-concurrent');
    await fs.writeFile(planFile, 'plan concurrent\n');
    const activeFile = path.join(closureState, 'codex-impl-closure-concurrent.active.json');
    await fs.writeFile(activeFile, `${JSON.stringify({
      pid: process.pid, reviewType: 'impl', sessionKey: 'closure-concurrent', runToken: 'other', startedAt: new Date().toISOString(),
    })}\n`);
    const blocked = runClosure('closure-concurrent');
    assert.equal(blocked.status, 4, `concurrent closure must not proceed: ${blocked.stdout}${blocked.stderr}`);
    const concurrentRecords = (await fs.readFile(path.join(closureState, 'codex-impl-closure-concurrent.result.jsonl'), 'utf8'))
      .trim().split('\n').map(JSON.parse);
    assert.equal(concurrentRecords.filter((record) => record.closureMode).length, 0, 'blocked closure must write no record');
    await fs.rm(activeFile, { force: true });

    // Codex absent from PATH: an eligible closure still succeeds. The closure
    // path still needs git, so the minimal PATH carries git and nothing else.
    const gitPath = spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout?.trim();
    const minimalBin = path.join(closureRoot, 'minimal-bin');
    await fs.mkdir(minimalBin, { recursive: true });
    await fs.symlink(spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim(), path.join(minimalBin, 'git'));
    assert.ok(gitPath, 'git must be available for the closure fixture');
    await seedNeedsChanges('closure-no-codex');
    await fs.writeFile(planFile, 'plan updated again\n');
    const withoutCodex = spawnSync(
      process.execPath,
      [runner, 'impl', 'closure-no-codex', '--close-record-only'],
      {
        cwd: closureRoot,
        env: { ...closureEnv, PATH: minimalBin },
        input: 'Record-only findings applied.\n',
        encoding: 'utf8',
      },
    );
    assert.equal(withoutCodex.status, 0, withoutCodex.stderr);
    assert.equal(spawnSync('codex', ['--version'], { env: { ...process.env, PATH: minimalBin } }).error?.code, 'ENOENT');

    // Refusals: every predicate that must send the author back to a real round.
    await fs.writeFile(planFile, 'plan\n');
    await seedNeedsChanges('closure-refuse');
    const refusals = [];
    refusals.push(['no_change_since_previous_round', runClosure('closure-refuse')]);
    await fs.writeFile(codeFile, 'export const a = 2;\n');
    await fs.writeFile(planFile, 'plan doc fix\n');
    refusals.push(['non_markdown_change', runClosure('closure-refuse')]);
    await fs.writeFile(codeFile, 'export const a = 1;\n');
    await fs.writeFile(path.join(closureRoot, 'src', 'untracked.ts'), 'export const b = 1;\n');
    refusals.push(['untracked code', runClosure('closure-refuse')]);
    await fs.rm(path.join(closureRoot, 'src', 'untracked.ts'));
    await fs.writeFile(normFile, 'norm edited\n');
    refusals.push(['governance_path_change', runClosure('closure-refuse')]);
    await fs.writeFile(normFile, 'norm\n');
    refusals.push(['plan review', spawnSync(
      process.execPath, [runner, 'plan', 'closure-refuse', '--close-record-only'],
      { cwd: closureRoot, env: closureEnv, input: 'nope\n', encoding: 'utf8' },
    )]);
    refusals.push(['unknown session', runClosure('closure-never-reviewed')]);
    for (const [label, run] of refusals) {
      assert.equal(run.status, 3, `${label} must refuse closure: ${run.stdout}${run.stderr}`);
      assert.match(run.stderr, /record-only closure refused/);
    }

    // A commit between the reviewed round and the closure invalidates the baseline.
    await fs.writeFile(planFile, 'plan committed fix\n');
    git('add', '-A');
    git('commit', '-qm', 'fixture follow-up');
    const afterCommit = runClosure('closure-refuse');
    assert.equal(afterCommit.status, 3, afterCommit.stderr);
    assert.match(afterCommit.stderr, /head_sha_changed_since_previous_round/);

    // Missing policy is fail-closed.
    await fs.rm(path.join(closureRoot, '.agents', 'review-closure-policy.json'));
    await seedNeedsChanges('closure-no-policy');
    await fs.writeFile(planFile, 'plan without policy\n');
    const withoutPolicy = runClosure('closure-no-policy');
    assert.equal(withoutPolicy.status, 3, withoutPolicy.stderr);
    assert.match(withoutPolicy.stderr, /closure policy missing/);
  } finally {
    await fs.rm(closureRoot, { recursive: true, force: true });
  }

} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

process.stdout.write('run-codex-review tests passed\n');
