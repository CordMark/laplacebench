#!/usr/bin/env node
// Fake product-cpu bridge for repo-independent client tests.
// Behavior is selected with FAKE_BRIDGE_MODE:
//   normal      — valid hello, echoes fixed moves / two scored roots
//   bad_policy  — hello reports policy cpu-v9
//   no_hello    — never prints hello (client hello timeout)
//   nonjson     — hello ok, then answers requests with a non-JSON line
//   crash       — hello ok, then exits mid-request without answering
//   reorder     — hello ok, buffers two requests, answers them in reverse
//   silent      — hello ok, never answers requests (client request timeout)
//   stderr      — hello ok, writes to stderr instead of answering
const readline = require("node:readline");

const mode = process.env.FAKE_BRIDGE_MODE || "normal";
const commit = process.env.FAKE_BRIDGE_COMMIT || "d316b30914cb49942486f744099468fe0561ea02";

const policy = process.env.FAKE_BRIDGE_POLICY || "cpu-v4";
const visibleCount = Number(process.env.FAKE_BRIDGE_VISIBLE_COUNT || (policy === "cpu-v6" ? 6 : 5));
const hello = {
  t: "hello",
  protocol: "product-cpu-bridge-v1",
  policy_version: mode === "bad_policy" ? "cpu-v9" : policy,
  product_commit: commit,
  distribution: "bundled",
  python: "fake 3.99",
  visible_tiers: Array.from({ length: visibleCount }, (_, index) => index + 1).map((n) => ({
    level_id: `level_${n}`,
    profile_name: `fake_tier_${n}`,
    p95_limit_seconds: 1,
  })),
};

if (mode !== "no_hello") {
  process.stdout.write(JSON.stringify(hello) + "\n");
}

const buffered = [];
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const req = JSON.parse(line);
  if (mode === "silent") return;
  if (mode === "stderr") {
    process.stderr.write("fake bridge diagnostic\n");
    return;
  }
  if (mode === "nonjson") {
    process.stdout.write("this is not json\n");
    return;
  }
  if (mode === "crash") {
    process.exit(3);
  }
  if (mode === "reorder") {
    buffered.push(req);
    if (buffered.length === 2) {
      for (const r of buffered.reverse()) answer(r);
      buffered.length = 0;
    }
    return;
  }
  answer(req);
});

function answer(req) {
  let resp;
  if (req.op === "move") {
    resp = {
      id: req.id,
      move: { from: [0, 3], to: [3, 3] },
      seed_used: req.seed,
      elapsed_ms: 1,
    };
  } else if (req.op === "score_roots") {
    // Two roots; rank 1 is the [0,3]->[3,3] push. The `marker` id lets the
    // reorder test tell responses apart via depth.
    resp = {
      id: req.id,
      depth: req.state && req.state.currentPlayer ? req.state.currentPlayer : 0,
      roots: [
        {
          move: { from: [0, 3], to: [3, 3] },
          value: 10,
          rank: 1,
          selectionClass: 1,
          immediateWin: false,
          unsafe: false,
        },
        {
          move: { from: [0, 4], to: [3, 4] },
          value: 4,
          rank: 2,
          selectionClass: 1,
          immediateWin: false,
          unsafe: false,
        },
      ],
      elapsed_ms: 1,
    };
  } else {
    resp = { id: req.id, error: `unknown op: ${req.op}` };
  }
  process.stdout.write(JSON.stringify(resp) + "\n");
}
