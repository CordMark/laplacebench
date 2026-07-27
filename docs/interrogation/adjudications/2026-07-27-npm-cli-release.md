# work item: npm-cli-release — tier: heavy

Slice: stale な npm `laplacebench@0.1.1` を、clean Git source と一致する CLI
`0.2.0` として検証・公開し、clone 前の利用者が README の
`npx laplacebench play` を実行できる状態にする。プラン:
`docs/plans/2026-07-27-npm-cli-release.md`。

Requirement source: ユーザー対話 2026-07-27。npm 公開物が current README より古く
`play` を持たない実測報告に対して「これやろ」。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "935202c7-06b2-4a79-9008-f71e88ab3016",
      "work_item_id": "npm-cli-release",
      "session_key": "direction-npm-cli-release",
      "occurred_at": "2026-07-27T09:38:00.645Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "external-reality",
            "recurrence"
          ],
          "question": "Local package.json says 0.1.0 while the registry owns 0.1.1 — was the prior release published from an uncommitted tree, and does the proposal prevent that drift from recurring rather than only bumping past it?",
          "context_refs": [
            "proposal observed facts: npm latest 0.1.1 gitHead f9ea61d; local packages/cli/package.json 0.1.0; main b8e48e1 is 42 commits after f9ea61d"
          ],
          "author_position": "DEFEND",
          "outcome": "defended-and-clarified",
          "effect": "no-change",
          "requested_evidence": null
        }
      ],
      "duration_ms": 41825,
      "input_tokens": 17839,
      "cached_input_tokens": 0,
      "output_tokens": 2958,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17839,
            "cached_input_tokens": 0,
            "output_tokens": 2958
          },
          "normalized_delta": {
            "input_tokens": 17839,
            "cached_input_tokens": 0,
            "output_tokens": 2958
          },
          "reason": null
        }
      ],
      "active_provider": "claude",
      "providers_used": [
        "claude"
      ],
      "fallback_count": 0
    },
    "transcript_hash": "4007678d76d1a7e39d7a483ccf55f5ccd4caa63c374ee75170e99b3c0d62d83d",
    "decision_context_hash": "22a30d300e618cf01f370a6ddf5ec640fb98f6be2ddeea7017a373e39330c304",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 1
  }
}
```

## Plan review (codex-plan-review, session plan-npm-cli-release)

- Q(review/exact-artifact): workspace publish が `prepublishOnly` を再実行して再packするため、
  事前 smoke した tarball と実際の公開 bytes の同一性が未証明 → 受理。clean pushed commit
  から final pack を2回作り deterministic integrity を確認し、その exact tarball で
  inventory/install/smoke。npm directory publish は registry `gitHead` を保つため維持するが、
  `--ignore-scripts` で同一 clean input を再packし、公開後 `dist.integrity` / `shasum` を
  expected final tarball と照合して byte identity を確定する(revise, class: A)。
- Q(review/ambiguous-retry): 不明応答後の negative/stale registry 観測を根拠に同じ
  `0.2.0` を retry できる余地がある → 受理。応答種別に関係なく publish attempt は1回。
  不明時は external-state reconciliation として停止し、必要な回復 publish は新しい reviewed
  version のみ(revise, class: A)。
- Q(review/publication-inventory): `package.json#files` の `bridge`, `skills`, `FINDINGS.md`
  が inventory に無く、blacklist 外の意図しない内容を見逃す → 受理。全 files root と
  npm-added `package.json` を分類し、`npm pack --json` の全 entry を fail-closed で照合。
  全 text payload の secret/host-path/run-state pattern scan を追加(revise, class: B)。
- ラウンド 2・指摘計 3 件で APPROVED（confidence 0.96）

## 2026-07-27 npm CLI release [impl]（tier: heavy）

- Q(author/package-inventory): approved plan は source map 非同梱を仮定したが、clean build の
  `npm pack --json` は29 mapと npm auto-included `LICENSE` を示した。これは意図しない
  leak か。
  - 弁明: `tsconfig.build.json` が明示的に `sourceMap: true` を所有し、公開済み `0.1.1`
    にも17 mapが存在する。current 29 map を全件 parse した結果、`sourcesContent` は無く、
    source path は relative で absolute/home path を含まない。`LICENSE` は root MIT license
    の npm 標準同梱物。削除は release alignment に不要な debugging contract 変更になる。
  - 裁定: revise(実 tarball inventory; class: B)。plan inventory を JS+safe map と auto
    `LICENSE` を明示する形へ修正し、全 map の fail-closed content check を gate に追加。
  - by: auto
  - prediction: none
- Q(author/packaged-readme): exact tarball の内容監査で、npm package page と tarball に入る
  `packages/cli/README.md` が、非同梱の `src/cli.ts` を `npx tsx` で実行する旧 pilot/setup
  手順と `LAPLACE_APP_ROOT` を案内していた。version bump だけで公開してよいか。
  - 弁明: これは clone 前のユーザーが見る npm 配布契約そのもので、root README の
    `npx laplacebench play` と矛盾し、packed tarball では実行不能。plan は packaged README
    と CLI help の一致を completion criteria に含み、packaging gap 発見時の focused fix を
    許可している。
  - 裁定: revise(approved plan の package contract; class: B)。packaged README を実在する
    `npx laplacebench` commands、verify/submit、absolute docs links へ更新し、非同梱 source
    command と旧 checkout 前提の再侵入をテストで禁止。
  - by: auto
  - prediction: none
- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.94。残る final two-pack と public
  `npx` acceptance は plan 済みの release boundary gate）

## Impl review (codex-impl-review, session impl-npm-cli-release)

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.97。clean release commit 後の
  two-pack digest check と public npm acceptance は後続 gate として維持）

## Publication evidence

- clean source / registry `gitHead`:
  `f7cbf3dba81cb6f7ce1d9cf7ae2a1ccff9aea363`
- final two-pack: 67 files / 29 safe source maps / version `0.2.0` / byte-identical
- expected and registry integrity:
  `sha512-l2dSKPpEutDMPNc93DWXgZIZoUEodwZQFt7Z97YVrDGRxZxIbiOv531A7OpETEBa0W2paIdSZE2EHkCh/nBADQ==`
- expected and registry shasum: `ff36c3750a9f5b7e53d6f8a70d2c528b6c6c3e3f`
- npm `latest=0.2.0`; publish time `2026-07-27T09:58:47.861Z`
- GitHub source commit checks: CI success、Publish community arena success
- isolated external acceptance: fresh directory / fresh npm cache の
  `npx --yes laplacebench@latest play` が Team A provider menu（Claude / Codex /
  Anthropic API / LaPlace CPU / Baseline）まで到達。モデル未選択・対局未開始で中止
