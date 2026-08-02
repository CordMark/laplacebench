# work item: harnesslab-catalog — tier: standard

Slice: Harness Lab 蓄積面のカタログ artifact
(`laplace-bench-harnesslab-catalog-v1`)。器はアリーナ同型(contender =
harness:model@effort、matchup が溜まる・rating 無し)。収載の**選択子は
リポジトリ内 curated list**(`community/harnesslab-experiments.json`)、
budget null・非 model-arena・clean-room の3機械条件は **fail-loud の検証子**
(budget 撤廃後は budget null が curation の代理として壊れているため —
direction 対話で確認)。compaction 列(telemetry 由来、無い run は null)、
replay 同梱。laplace-main UI は別スライス。

Requirement source: ユーザー裁定 2026-08-02「運営者として実験した結果はそこで
見せるでいい。見せ方はモデル×ハーネスで試合が溜まっていく感じ。基本的には
アリーナと同じ構造でいい」。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "669ef762-5c8d-4ecc-8e21-0372fa579a83",
      "work_item_id": "harnesslab-catalog",
      "session_key": "direction-harnesslab-catalog",
      "occurred_at": "2026-08-02T07:30:40.851Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "CHANGE",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "concept",
            "time-scope"
          ],
          "question": "収載規則(matchup_kind ≠ model-arena かつ budget null)は、デフォルトbudget撤廃後は「運営者の事前登録実験」と ambient/community 由来の非アリーナrunを区別できず、機械的規則が curation 境界の代理として壊れていないか。運営者実験を機械的に識別できる台帳フィールドは存在するか。",
          "context_refs": [
            "a39ba7a Remove the default output-token budget",
            "ユーザー裁定 2026-08-02「自分が運営者として実験した結果はそこで見せるでいい」",
            "提案テスト項目「ambientの除外」"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 62585,
      "input_tokens": 41504,
      "cached_input_tokens": 3107,
      "output_tokens": 3202,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 18899,
            "cached_input_tokens": 1434,
            "output_tokens": 2097
          },
          "normalized_delta": {
            "input_tokens": 18899,
            "cached_input_tokens": 1434,
            "output_tokens": 2097
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 22605,
            "cached_input_tokens": 1673,
            "output_tokens": 1105
          },
          "normalized_delta": {
            "input_tokens": 22605,
            "cached_input_tokens": 1673,
            "output_tokens": 1105
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
    "transcript_hash": "5987f4caec7449507e55fb1dd05aaeab7d477af36b464c054455667e4243b8c9",
    "decision_context_hash": "9f658bbbb1985d0296e863e45bca47cdabb93e3292c40a23ce60ddbf39108f58",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-harnesslab-catalog)

- ラウンド1: NEEDS_CHANGES 6件(公開 workflow の第2出力破棄、writer 原子性、
  schema 精密化、telemetry status 正直さ、arena byte 不変の oracle、list パス
  解決)→ 全件 ACCEPT し改訂。
- ラウンド2: NEEDS_CHANGES 1件(writer 原子性 regression のテスト明記)→ 追記。
- ラウンド3: APPROVED (confidence 0.99)。

## Implementation review (codex-impl-review, session impl-harnesslab-catalog)

- 実装: Opus 5 サブエージェント(main tree)。golden hash
  (17392795dae6aba1…)を実装前の未変更実装から採取し byte 不変を証明。
- 自己検出バグ2件を修正済み(harness_conditions を ledger 側でなく spec で
  join — swap 対局の条件誤帰属を防止 / illegalRatePerTurn の pure 化)。
- ラウンド1: APPROVED (confidence 0.94)。申告judgment call 7件を受理
  (import cycle は関数本体内使用のため初期化安全、本スライスでは rehome 不要)。
- 発見リスク(別裁定へ委譲): buildPublicReplay の UNSAFE_COMMENTARY が
  note 内の "->" 等を拒否するため、矢印を含む run は curated list 追加時に
  replay 構築で fail-loud する(memo run で実証)。公開境界の変更は別スライス。
- 検証証跡: orchestrator 独立再検証 typecheck clean・278/278 green。
