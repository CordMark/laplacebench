import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-interrogation-runner-'));

try {
  const project = path.join(tempRoot, 'project');
  const scriptDir = path.join(project, '.agents', 'scripts');
  const binDir = path.join(tempRoot, 'bin');
  await fs.mkdir(scriptDir, { recursive: true });
  await fs.mkdir(binDir, { recursive: true });
  for (const name of ['run-claude-interrogation.mjs', 'review-schema.json']) {
    await fs.copyFile(path.join(sourceDir, name), path.join(scriptDir, name));
  }

  const argsFile = path.join(tempRoot, 'args.jsonl');
  const fakeClaude = path.join(binDir, 'claude');
  await fs.writeFile(fakeClaude, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_CLAUDE_ARGS, JSON.stringify(args) + '\\n');
const sessionFlag = args.includes('--resume') ? '--resume' : '--session-id';
const sessionId = args[args.indexOf(sessionFlag) + 1];
const emit = (event) => console.log(JSON.stringify({ session_id: sessionId, ...event }));
const succeed = () => emit({
  type: 'result',
  duration_ms: 10,
  total_cost_usd: 0,
  num_turns: 1,
  usage: { output_tokens: 1 },
  structured_output: { verdict: 'APPROVED', issues: [], summary: 'fixture', confidence: 1 },
});
process.stdin.resume();
process.stdin.on('end', () => {
  if (process.env.FAKE_CLAUDE_MODE === 'healthy-long') {
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      emit({ type: 'system', subtype: 'status', status: 'working', count });
      if (count === 5) {
        clearInterval(interval);
        succeed();
      }
    }, 300);
    return;
  }
  if (process.env.FAKE_CLAUDE_MODE === 'stall') {
    emit({ type: 'system', subtype: 'init' });
    setInterval(() => {}, 1000);
    return;
  }
  succeed();
});
`);
  await fs.chmod(fakeClaude, 0o755);

  const baseEnv = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    FAKE_CLAUDE_ARGS: argsFile,
    CLAUDE_INTERROGATION_STALL_SECONDS: '1',
  };
  const runner = path.join(scriptDir, 'run-claude-interrogation.mjs');
  const run = (sessionKey, mode) => spawnSync(process.execPath, [runner, 'impl', sessionKey], {
    cwd: project,
    env: { ...baseEnv, FAKE_CLAUDE_MODE: mode },
    input: 'Review fixture.',
    encoding: 'utf8',
    timeout: 10_000,
  });

  const healthy = run('healthy', 'healthy-long');
  assert.equal(healthy.status, 0, healthy.stderr);
  assert.deepEqual(JSON.parse(healthy.stdout), {
    verdict: 'APPROVED', issues: [], summary: 'fixture', confidence: 1,
  });
  const healthyMetrics = JSON.parse((await fs.readFile(
    path.join(project, '.agents', 'state', 'claude-impl-healthy.log.jsonl'),
    'utf8',
  )).trim());
  assert.equal(healthyMetrics.stalled, false);
  assert.ok(healthyMetrics.elapsedMs >= 1_200, healthyMetrics.elapsedMs);

  const stalled = run('fixture', 'stall');
  assert.equal(stalled.status, 1, stalled.stderr);
  assert.match(stalled.stderr, /no Claude activity for 1s/);
  assert.match(stalled.stderr, /retained stalled session/);

  const sessionFile = path.join(project, '.agents', 'state', 'claude-impl-fixture.session');
  const retainedSessionId = (await fs.readFile(sessionFile, 'utf8')).trim();
  assert.match(retainedSessionId, /^[0-9a-f-]{36}$/);

  const resumed = run('fixture', 'success');
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.deepEqual(JSON.parse(resumed.stdout), {
    verdict: 'APPROVED', issues: [], summary: 'fixture', confidence: 1,
  });

  const invocations = (await fs.readFile(argsFile, 'utf8')).trim().split('\n').map(JSON.parse);
  for (const args of invocations) {
    assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 4), [
      '--model', 'fable', '--effort', 'medium',
    ]);
    assert.ok(args.includes('--verbose'));
    assert.deepEqual(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 2), [
      '--output-format', 'stream-json',
    ]);
    assert.ok(args.includes('--include-partial-messages'));
    assert.ok(args.includes('--include-hook-events'));
  }
  assert.deepEqual(invocations[1].slice(-2), ['--session-id', retainedSessionId]);
  assert.deepEqual(invocations[2].slice(-2), ['--resume', retainedSessionId]);

  const metrics = (await fs.readFile(
    path.join(project, '.agents', 'state', 'claude-impl-fixture.log.jsonl'),
    'utf8',
  )).trim().split('\n').map(JSON.parse);
  assert.equal(metrics[0].stalled, true);
  assert.equal(metrics[0].sessionId, retainedSessionId);
  assert.equal(metrics[0].model, 'fable');
  assert.equal(metrics[0].effort, 'medium');
  assert.equal(metrics[0].stallSeconds, 1);
  assert.equal(metrics[1].stalled, false);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

console.log('run-claude-interrogation tests passed');
