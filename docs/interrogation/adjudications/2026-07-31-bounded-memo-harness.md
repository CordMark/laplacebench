# work item: bounded-memo-harness — tier: standard

Slice: 有界・可視のメモ持ち越し harness `codex-cli-memo`(毎手 fresh exec +
固定フォーマット・キャップ付きメモを次手へ注入、全メモを run artifact として保存)
を追加し、GPT-5.6 Sol@medium の memo vs persistent を Run 9 と同一プロトコルで
事前登録実測する。Run 9 の reset 腕との「共通対戦相手・共通seedの間接比較」を
副次読みとして事前登録する。封筒 350k は据え置き(上限は今回の実証対象ではない)。

Requirement source: ユーザー指示 2026-07-31「後半に行ってもトークン使用量が
増えすぎないような仕組みにできたらしたい。今実際どのような思考の引き継ぎに
なっているか履歴を分析してこちらから最低限のフォーマットやルールと共に
プロンプトを渡すなど」。分析実測: Run 9 persistent の出力の95-96%が不可視
reasoning で、入力コンテキストにほぼ比例して毎手成長(再導出税)。可視返答は
毎手200-400バイトで一定。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "dd30a834-6ef4-4c3f-89b9-eea06d4875a7",
      "work_item_id": "bounded-memo-harness",
      "session_key": "direction-bounded-memo-harness",
      "occurred_at": "2026-07-30T17:59:45.116Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "CHANGE",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "process",
            "absence"
          ],
          "question": "Run 9(先日のH0 curated ablation)にturn-scopedなreset腕が既にあるなら、memo条件を同一プロトコルで走らせるだけで memo vs persistent と memo vs reset の両方が読め、「H0+H1複合として分解しない」という宣言が不要になるのではないか。reset腕の有無と、副次読みとして載せない理由を確認する。",
          "context_refs": [
            "docs/plans/2026-07-30-harness-lab-contract.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 63651,
      "input_tokens": 64646,
      "cached_input_tokens": 22149,
      "output_tokens": 3973,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 18903,
            "cached_input_tokens": 0,
            "output_tokens": 1883
          },
          "normalized_delta": {
            "input_tokens": 18903,
            "cached_input_tokens": 0,
            "output_tokens": 1883
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 45743,
            "cached_input_tokens": 22149,
            "output_tokens": 2090
          },
          "normalized_delta": {
            "input_tokens": 45743,
            "cached_input_tokens": 22149,
            "output_tokens": 2090
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
    "transcript_hash": "d3b4c3200ee91b053a5ad8ce2b150bb09da298985d89c1a7ff77dd40b65610c9",
    "decision_context_hash": "66f82aa47a1093010d17e80430550a4103641fd15e647a06bc5a36782f1bebd0",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-bounded-memo-harness)

- ラウンド1: NEEDS_CHANGES 3件(.md artifact が community gate 非適合、attempt
  意味論の未定義、adapter テスト seam の未指定)→ 全件 ACCEPT し、attempt 付き
  append-only JSONL、毎呼び出し遷移(修復・timeout 含む)、pure 合成関数 +
  注入可能 runner へ改訂。
- ラウンド2: APPROVED (confidence 0.96)。

## Implementation review (codex-impl-review, session impl-bounded-memo-harness)

- ラウンド1: NEEDS_CHANGES 1件(ambient 実行では tool + 共有 cwd が宣言外の
  持ち越しチャネルになる)→ ACCEPT。turn-scoped 条件(reset / memo とも)は
  `assertTurnScopedCleanRoom` で ambient を run dir 作成前に拒否(fail-closed)、
  HARNESS_CONDITIONS へ「clean-room execution required」を宣言、ガードの unit +
  end-to-end 回帰を追加。
- ラウンド2: APPROVED (confidence 0.98、実験と FINDINGS は宣言どおり後続ラウンドへ)。
- ラウンド3(follow-up): Run 10 実測(2-2 全局 Team A center 勝ち・memo 64,847 vs
  persistent 300,545 出力トークン・34/34 memo updated・両側 illegal 0)と FINDINGS
  Run 10・direction doc 追記(§5 pack 仮説の裏付け・§9.5 提供価値の言語化)を
  検証し APPROVED (confidence 0.97)。
- 検証証跡: 240テスト green・typecheck clean・実機 smoke(memo 生成・注入・JSONL・
  meta 記録)・replay verify 4/4・standings 0 matchup・community 台帳収載。
