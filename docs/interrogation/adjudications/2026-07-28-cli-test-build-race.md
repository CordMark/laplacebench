# work item: cli-test-build-race（tier: light）

## Bounded corrective defense

- User evidence: the main-branch CI repeatedly failed because the packaged CLI wrapper could not find `dist/cli.js`.
- Prior contract: the wizard help test verifies catalog-derived help; the separate repetition test owns packaged-wrapper integration.
- Semantic delta: test execution only. Runtime code, schemas, publication data, and external contracts are unchanged.
- Blast radius: one CLI help integration test; it now executes the TypeScript source entry point without rebuilding shared `dist`.
- Regression evidence: the help test passes with `dist` absent, the two formerly competing test files pass in parallel on Node 22, and the full suite is run on Node 22.
- Rollback: revert the test-only commit; no data or published artifact migration is involved.

## Implementation review

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.98）
