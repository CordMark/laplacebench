# work item: clean-room-execution — tier: standard

Slice: サブスクCLI対局(claude-cli/codex-cli)を、認証だけを持ち込む隔離ホーム+
env allowlist+抑止フラグの clean-room 実行に既定で切り替え、fail-closed の
canary/静的検査と isolation manifest を run.json に記録する。ambient環境コピーは
`--ambient-cli-env` の明示opt-in・別条件ラベルとしてのみ残す。公開レーン/UI/
community schema の変更は含まない。

Requirement source: ユーザー指示 2026-07-30「Claude/Codexのサブスク認証を維持
しながら、個人設定、instructions、skills、plugins、hooks、MCP、環境変数などを
確実に隔離するclean-room実行」「仮置き順 1. Model Arena clean-room実行と
manifest 2. その適合性テスト・canary検査」。正本方針: docs/harness-lab-direction-ja.md §11
(2026-07-30 人間裁定)。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "b03749ee-71bb-4876-a9ea-4da6169a8347",
      "work_item_id": "clean-room-execution",
      "session_key": "direction-clean-room-execution",
      "occurred_at": "2026-07-30T08:30:08.933Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "CHANGE",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "value-cost",
            "non-entity",
            "time-scope"
          ],
          "question": "サブスクCLI実行で汚染可能なambientコピー挙動を既定のまま残す理由はあるか。CLAUDE_EFFORT リーク実例がある以上、新規runに対しては clean-room を既定にし ambient コピーを明示opt-inへ倒すべきではないか（「既存runの再現性」は記録済みの過去runには適用済みで、新規runの根拠にならない）",
          "context_refs": [
            "docs/plans/2026-07-27-bench-effort-identity.md",
            "docs/harness-lab-direction-ja.md §11"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 59150,
      "input_tokens": 44456,
      "cached_input_tokens": 0,
      "output_tokens": 3462,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 20413,
            "cached_input_tokens": 0,
            "output_tokens": 2321
          },
          "normalized_delta": {
            "input_tokens": 20413,
            "cached_input_tokens": 0,
            "output_tokens": 2321
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 24043,
            "cached_input_tokens": 0,
            "output_tokens": 1141
          },
          "normalized_delta": {
            "input_tokens": 24043,
            "cached_input_tokens": 0,
            "output_tokens": 1141
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
    "transcript_hash": "0fa9cba881ce01fdbfb03812e0edee8d59c3e606ce5b803d0ae62191bd57c793",
    "decision_context_hash": "221651bf73755f0c6f7911bb4a240d9b894d06042ff5e8b7b652840d52283c2a",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-clean-room-execution)

- ラウンド1: NEEDS_CHANGES 6件(HOME/codex shell残余面、cwd契約、隔離ホームlifecycle、
  canary matrix不足、manifest/version未指定、orchestrationテスト不足)。全件ACCEPTし、
  隔離OS HOME・`--disable shell_tool`(NOSHOLL実測)・cwd契約・run-scope所有・
  surface別canary matrix・`laplace-isolation-v1`スキーマ・orchestrationテストへ改訂。
- ラウンド2: NEEDS_CHANGES 1件(learning分析中のcwd削除競合)→ cwd削除をdispose責務へ移動。
- ラウンド3: APPROVED (confidence 0.99)。

## Implementation review (codex-impl-review, session impl-clean-room-execution)

- 実装中の逸脱1件: codex sandbox指定を `-s read-only` から `-c sandbox_mode="read-only"` へ
  (`codex exec resume` が `-s` を拒否 — plan必須のbounded実対局で検出)。方向前提は不変。
- ラウンド1: NEEDS_CHANGES 4件(web-search主張の過大表示、shell陽性のhallucination許容、
  canary effort未記録、run.json書き込み失敗時のリソースリーク)。全件ACCEPTし、
  `codex features list` の決定論記録(feature-state-recorded)、command_executionイベント必須、
  effort記録("cli-default"/"low")、cleanupガード拡大で修正。
- ラウンド2: APPROVED (confidence 0.98)。
- 検証証跡: typecheck clean、222テストpass、実機clean-room対局2種
  (claude-haiku@low vs random、codex@low vs random — 後者はresume経路の実手と
  厳格canary合格を含む)、canary matrix実測合格(claude 4レッグ + codex 6レッグ + feature記録)。
