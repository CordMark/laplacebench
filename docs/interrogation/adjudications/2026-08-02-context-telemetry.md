# work item: context-telemetry — tier: standard

Slice: clean-room 対局の persistent 系 adapter に endGame 時の context telemetry
収穫を追加する。codex は隔離ホームの rollout から `context_compacted` 数と
`token_count` 系列(window 込み)、claude はセッション転写から compact マーカー数と
転写サイズを抽出し、`games/<id>/context-telemetry-<team>.json`
(laplace-context-telemetry-v1)として保存。生 rollout は保存しない。

Requirement source: ユーザー指示 2026-08-02「圧縮が本当に観測できていないなら、
少なくとも何回圧縮したかとかは観測できたほうがいい(codex/claude両方)」。
ARC-AGI-3 記事の設定2(compaction)の観測装置。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "344ffd25-cfce-4094-910a-9b203a4b5a01",
      "work_item_id": "context-telemetry",
      "session_key": "direction-context-telemetry",
      "occurred_at": "2026-08-02T06:01:30.280Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "absence",
            "concept"
          ],
          "question": "compaction発火済み対局の解釈上の地位(公開matchup適格性・harness_conditions・ablation解釈)を観測のみに留めるのは意図した採用方向か、それとも未検討の欠落か",
          "context_refs": [
            "docs/plans/2026-07-30-harness-lab-contract.md"
          ],
          "author_position": "DEFEND",
          "outcome": "defended-and-clarified",
          "effect": "no-change",
          "requested_evidence": null
        }
      ],
      "duration_ms": 65274,
      "input_tokens": 40169,
      "cached_input_tokens": 0,
      "output_tokens": 3491,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 18072,
            "cached_input_tokens": 0,
            "output_tokens": 3003
          },
          "normalized_delta": {
            "input_tokens": 18072,
            "cached_input_tokens": 0,
            "output_tokens": 3003
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 22097,
            "cached_input_tokens": 0,
            "output_tokens": 488
          },
          "normalized_delta": {
            "input_tokens": 22097,
            "cached_input_tokens": 0,
            "output_tokens": 488
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
    "transcript_hash": "567c6b49eba721dc423bf2e030607c608d4273ac4b70736045dda896233b8e3a",
    "decision_context_hash": "2e66d93fc617b28817f4323766e7083723cf8d870524e13332c94fb3c8206f0a",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-context-telemetry)

- ラウンド1: NEEDS_CHANGES 2件(status 意味論の未定義、timeout 時の id 追跡
  未検証)→ per-source records + 最悪値集約 + 4 status の発火条件、timeout 前の
  stdout 解析 + unobserved_timeouts へ改訂。
- ラウンド2: NEEDS_CHANGES 2件(全面改名検出可能と読める残存文言、「全数追跡」
  invariant の矛盾)→ 検出可能なのは既知マーカーの構造劣化のみ・観測済み id のみ
  保持へ整合。
- ラウンド3: APPROVED (confidence 0.99)。

## Implementation review (codex-impl-review, session impl-context-telemetry)

- ラウンド1: NEEDS_CHANGES 3件(claude の未使用 session id 混入、既知マーカーの
  緩い検証、locator 例外の握り潰し)→ 遅延 id 割当、trigger∈{auto,manual}+数値
  必須の厳格形状、per-source parse-error 化。
- ラウンド2: NEEDS_CHANGES 1件(last_token_usage 欠落/非オブジェクトが ok の
  まま)→ info/usage の欠落・型不一致を全て marker-format-unknown へ。
- ラウンド3: APPROVED (confidence 0.99)。
- 検証証跡: 253テスト green・typecheck clean・実機 smoke(clean-room codex 対局で
  context-telemetry-A.json 生成、window 258,400・status ok・complete true)・
  実 rollout に対する厳格 parser 検証 ok。
