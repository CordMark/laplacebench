# work item: arena-team-latency — tier: heavy

Requirement source: ユーザー対話 2026-07-28。新規arena gameへreplay由来の
`team_latency_ms`を追加し、Web consumerを先に安全に受理可能にしてからcommit/pushする。

## Direction dialogue (human-direction-proxy)

<!-- completed trace appended unchanged below -->
```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "4782b4d3-a02a-4a67-9174-4c0331107f41",
      "work_item_id": "arena-team-latency",
      "session_key": "direction-arena-team-latency",
      "occurred_at": "2026-07-27T18:21:19.855Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "HUMAN_DECISION",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "non-entity",
            "external-reality"
          ],
          "question": "Does 'zero validated turns' truly coincide with 'no latency telemetry' for every publishable side type (including product-CPU bridge and historical replays), or can a side record turns with an unmeasured avgLatencyMs of 0, producing the silent unmeasured zero the proposal claims to exclude?",
          "context_refs": [
            "proposal: null semantics / closest observable equivalent to actCalls === 0"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        },
        {
          "id": "T002",
          "families": [
            "time-scope",
            "external-reality"
          ],
          "question": "Between pushing this producer change and the Web parser accepting the new key, can any non-user path (e.g., community submission) trigger a catalog publish that the deployed exact-key-rejecting Web parser cannot read, breaking the live arena page?",
          "context_refs": [
            "proposal: release-order dependency on laplace-main parseArenaCatalog.ts",
            "direction-brief: docs/plans/2026-07-26-public-arena-catalog.md publication lifecycle"
          ],
          "author_position": "HUMAN_RESIDUAL",
          "outcome": "changed",
          "effect": "complexity-exposed",
          "requested_evidence": null
        }
      ],
      "duration_ms": 65669,
      "input_tokens": 39083,
      "cached_input_tokens": 3107,
      "output_tokens": 3980,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17900,
            "cached_input_tokens": 1434,
            "output_tokens": 2224
          },
          "normalized_delta": {
            "input_tokens": 17900,
            "cached_input_tokens": 1434,
            "output_tokens": 2224
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 21183,
            "cached_input_tokens": 1673,
            "output_tokens": 1756
          },
          "normalized_delta": {
            "input_tokens": 21183,
            "cached_input_tokens": 1673,
            "output_tokens": 1756
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
    "transcript_hash": "cdc9d615af3e09b6196f1a2069ef11c8ee26292c8acc5fa85a74b82a1756759d",
    "decision_context_hash": "80464c8a279f269ae44169dc1dd3d1ba3ed21d01bc4c59c7c857e2b5ccc7013a",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

- 実装尋問: ラウンド 2・指摘計 2 件で APPROVED（confidence 0.93）

## Implementation review (codex-impl-review, session impl-arena-team-latency)

- ラウンド 2・指摘計 1 件で APPROVED（confidence 0.98。重なった既承認スライスを確認）

## Plan review (codex-plan-review, session plan-arena-team-latency)

- Q(review/telemetry-registry): adapter追加やreply path driftで未計測0が数値として漏れないか？
  - 弁明: 初稿のsample testとcatalog choicesはaccepted spec全体を覆わず不十分。
  - 裁定: revise (class: B)。`makeAgent`全branchを列挙するclassifier/inventory testと、baseline omission・
    LLM/product CPU success/error/timeout latency presenceをfail-loudに固定する。
- Q(review/rollback-order): producer公開後にcombined Web commitをrevertするとexact-key parserも戻らないか？
  - 弁明: 初稿のrollback順序ではlive catalogを拒否し得る。
  - 裁定: revise (class: B)。parser compatibilityを分離・保持し、必要時はproducer revert/republicationを
    先に完了してからparserを戻す。
- Q(review/adapter-inventory): `baselines.ts`という不存在pathとcenter-greedy/learning漏れでcompleteと言えるか？
  - 弁明: 指摘どおりfactory inventoryが事実と不一致。
  - 裁定: revise (class: B)。実pathへ直し、全12 spec formを明示する。
- ラウンド 3・指摘計 4 件で APPROVED（confidence 0.96）

## 2026-07-28 arena-team-latency [impl]（tier: heavy）

- Q(reply-path-telemetry): adapterがlatencyMsを落としてもreplay/catalog一致testが同じ偽0を通さないか？
  - 弁明: 指摘どおり値転記testだけでは共通upstream corruptionを検出できない。
  - 裁定: revise(approved planのfail-loud telemetry invariant; class: B)。shared factory classifierとruntime
    wrapperでmeasured/none reply contractを全act pathへenforceし、success/error/timeout/baseline testsを追加。
  - by: auto
  - prediction: none
- Q(registry-exhaustiveness): hardcoded testだけで将来のmakeAgent branch追加を検出できるか？
  - 弁明: 旧実装はfactoryとclassifierが別ownerで、追加漏れを許した。
  - 裁定: revise(approved planのsingle registry; class: B)。makeAgent自体をshared parsed unionのswitchへ変更し、
    unknown/unrunnable specはnullでbaselineへdefaultしない。
  - by: auto
  - prediction: none


```json
{
  "direction_correction_v1": {
    "correction_id": "cc91b6e9-408d-45f8-8047-9b570c824662",
    "related_direction_event_id": "4782b4d3-a02a-4a67-9174-4c0331107f41",
    "occurred_at": "2026-07-28T02:20:36.112Z",
    "source": "human",
    "missed_families": [
      "time-scope",
      "external-reality"
    ],
    "summary": "The user authorized the minimal Web parser repair first; Web production acceptance must precede the automatically publishing bench main push.",
    "effect": "premise-corrected",
    "high_risk": true
  }
}
```
