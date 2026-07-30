# work item: harness-lab-contract — tier: standard

Slice: Model Arena 適格 harness の allowlist を集計境界の正本としてコード契約化し、
turn-reset 変種 `codex-cli-reset` と harness_conditions / matchup_kind manifest を
追加、GPT-5.6 Sol 同士の最初の curated controlled ablation(persistent vs turn-reset)
を事前固定条件で実測する。UIタブ・投稿・matchmaking・rating は含まない。

Requirement source: ユーザー指示 2026-07-30 スライス3+4。正本方針:
docs/harness-lab-direction-ja.md §2-§4・§6・§8。きっかけは OpenAI ARC-AGI-3 の
reasoning retention / compaction 報告。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "7e7ce62f-dd92-4450-adf4-918981a8b9e0",
      "work_item_id": "harness-lab-contract",
      "session_key": "direction-harness-lab-contract",
      "occurred_at": "2026-07-30T09:20:34.165Z",
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
            "absence"
          ],
          "question": "Model Arena 混入防止の境界正本は headlineKey 折り畳み（同一モデル・同一effortのみ排除）で足りるか。codex-cli-reset の cross-model 対局は headlineKey が異なるため公開集計に混入し得るのでは。arena 適格 harness の allowlist 相当の分類が正本であるべきではないか",
          "context_refs": [
            "docs/plans/2026-07-27-bench-effort-identity.md",
            "docs/harness-lab-direction-ja.md §2-§4"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": "community/runs 台帳に claude-cli-learn の cross-model 対局が存在しないことを実装時に確認（存在すれば遡及是正をスライスに含める）"
        }
      ],
      "duration_ms": 73549,
      "input_tokens": 19238,
      "cached_input_tokens": 1434,
      "output_tokens": 2383,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 19238,
            "cached_input_tokens": 1434,
            "output_tokens": 2383
          },
          "normalized_delta": {
            "input_tokens": 19238,
            "cached_input_tokens": 1434,
            "output_tokens": 2383
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 0,
            "cached_input_tokens": 0,
            "output_tokens": 0
          },
          "normalized_delta": {
            "input_tokens": 0,
            "cached_input_tokens": 0,
            "output_tokens": 0
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
    "transcript_hash": "80bae2bb88fa9c99ea9340f569c8f89e885ea533dcfd8a5085b6997041fdbb7e",
    "decision_context_hash": "e84a634ef38e935505b8c713ed8ab7e717ed5e744c286278b882668fafaf1e40",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-harness-lab-contract)

- ラウンド1: NEEDS_CHANGES 4件(fail-closed でない適格判定、anthropic 条件の未定義、
  実験プロトコルと runner 実挙動の乖離、inventory/テスト seam 不足)→ 全件ACCEPTし
  PUBLIC_MATCHUP_HARNESSES(認識済み harness 全体への positive 分類)、anthropic の
  transcript 記録事前定義、4-distinct-seed 設計と事前登録コマンド、pure session-plan
  helper へ改訂。
- ラウンド2: NEEDS_CHANGES 2件(runs/ が gitignore で artifact が追跡されない、
  旧名 MODEL_ARENA_HARNESSES の残存)→ community/runs/keisuke70--… への
  verify 後コピーと改名で修正。
- ラウンド3: APPROVED (confidence 0.98)。

## Implementation review (codex-impl-review, session impl-harness-lab-contract)

- ラウンド1: NEEDS_CHANGES 2件(Run 9 の move-quality 因果主張が n=4 telemetry を
  超える、direction doc の compaction 文言が新宣言と矛盾)→ 「支配的な観測 failure
  mode」への限定・counterfactual 明示・legality/format の限定表現・レンジ修正、
  compaction policy 宣言と event 観測不能の区別で修正。
- ラウンド2: APPROVED (confidence 0.99)。
- 検証証跡: 232テスト green・typecheck clean・replay verify 4/4・standings 0 matchup
  (境界を実台帳データで実証)・事前登録どおりの4局完走
  (turn-reset 3W-1L、persistent の budget 枯渇 forfeit ×11、clean-room 初の curated run)。
