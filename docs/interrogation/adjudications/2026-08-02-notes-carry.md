# work item: notes-carry — tier: standard

Slice: 第3の持ち越し腕 `codex-cli-notes`(毎手 fresh exec + 自分の過去着手ノートの
追記専用ジャーナルを毎手注入、public チャネル)。介入の本体は**持ち越し契約の
告知**(「あなたのノートは次手の自分に見せられる唯一の記憶」)で、書式・
セクション・長さの指示は一語も置かない(memo との対比軸「生の蓄積 vs 設計された
記憶」を保つ)。実装は Opus 5 サブエージェントへ委譲、レビュー・コミットは
orchestrator。

Requirement source: ユーザー対話 2026-08-02「内部推論の引き継ぎと、アリーナ側に
あるその手で考えたことを吐き出させればそれでよい気がする」。実測根拠: 素の
note は中央値200-300字で、告知なしでは「効かない」と「運ぶ中身が無い」を
切り分け不能(direction 対話で確認)。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "d9813899-c85c-4034-97a8-91bd58eff9c1",
      "work_item_id": "notes-carry",
      "session_key": "direction-notes-carry",
      "occurred_at": "2026-08-02T06:57:14.272Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-opus-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "external-reality",
            "value-cost",
            "concept"
          ],
          "question": "Run 9 で可視返答が毎手200-400バイトだった事実を踏まえると、p3-move-note の実測長が数百字しかない可能性があり、その場合 notes 腕は reset 腕とほぼ同一になり、null 結果を「公的持ち越しは効かない」と「運ぶ中身が無かった」に切り分けられない。書式・長さを一切強制しない方針が、この腕の測定可能性そのものを壊していないか。",
          "context_refs": [
            "docs/plans/2026-07-31-bounded-memo-harness.md",
            "docs/plans/2026-07-27-bench-thinking-channel.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": "既存対局イベント(Run 9-11)の p3-move-note 1手あたり文字数の中央値と上位裾 — 提出済み: persistent n=187 中央値239/p90 302/最大369、reset n=164 中央値189/p90 252/最大551"
        },
        {
          "id": "T002",
          "families": [
            "absence",
            "non-entity"
          ],
          "question": "「件数・総量キャップは置かない」という宣言と 2500字/note の切り詰めが整合していない。実測が数百字なら発火しない死んだ規則、発火するなら「無界」腕の定義と衝突する。この腕においてこの上限は何のために存在するのか。",
          "context_refs": [
            "docs/plans/2026-07-31-bounded-memo-harness.md"
          ],
          "author_position": "DEFEND",
          "outcome": "defended-and-clarified",
          "effect": "no-change",
          "requested_evidence": null
        }
      ],
      "duration_ms": 79926,
      "input_tokens": 39681,
      "cached_input_tokens": 3107,
      "output_tokens": 3933,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 18072,
            "cached_input_tokens": 1434,
            "output_tokens": 2407
          },
          "normalized_delta": {
            "input_tokens": 18072,
            "cached_input_tokens": 1434,
            "output_tokens": 2407
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 21609,
            "cached_input_tokens": 1673,
            "output_tokens": 1526
          },
          "normalized_delta": {
            "input_tokens": 21609,
            "cached_input_tokens": 1673,
            "output_tokens": 1526
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
    "transcript_hash": "bb8a104d61ec19c7a0dc6d6d9f54c6f5bc314a6ad6aa5f32292bf6af3944b8da",
    "decision_context_hash": "2fe5f45b486396e20ffea31d934ef4d1a24ce564362e604397b78929c3a59060",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-opus-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Direction correction (human-direction-proxy, session direction-notes-carry-accepted-only)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "9a8a2c4b-8bd6-4d58-915c-771b72c5cb1d",
      "work_item_id": "notes-carry-accepted-only",
      "session_key": "direction-notes-carry-accepted-only",
      "occurred_at": "2026-08-02T07:06:39.296Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "concept",
            "external-reality"
          ],
          "question": "pass 時のノートは公開記録に全文記録されるか。されるなら「passなら破棄」は等式(持ち越し=公開記録)を逆方向に破る — 正しい線引きは「受理された着手」ではなく「公開記録に全文載ったノート」ではないか。",
          "context_refs": [
            "ORIGINAL PROPOSAL: stageしたnoteは「recentに自分のmoveが現れたら確定、passなら破棄」",
            "commit 63cc525: 採用された返答からノートを抽出して move イベントへ記録"
          ],
          "author_position": "DEFEND",
          "outcome": "evidence-found",
          "effect": "no-change",
          "requested_evidence": null
        }
      ],
      "duration_ms": 43778,
      "input_tokens": 36730,
      "cached_input_tokens": 0,
      "output_tokens": 2246,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 16905,
            "cached_input_tokens": 0,
            "output_tokens": 1582
          },
          "normalized_delta": {
            "input_tokens": 16905,
            "cached_input_tokens": 0,
            "output_tokens": 1582
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 19825,
            "cached_input_tokens": 0,
            "output_tokens": 664
          },
          "normalized_delta": {
            "input_tokens": 19825,
            "cached_input_tokens": 0,
            "output_tokens": 664
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
    "transcript_hash": "7262b9287b97db67d15a166f35525ca28fb1fa8aa2335774551baac9fe918541",
    "decision_context_hash": "59db21359cfb36461d3288b0b71071f7321741c7fd6a7bb22c5492608f7b9d16",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-notes-carry)

- ラウンド1: NEEDS_CHANGES 3件(公開記録との等式不成立、notes_carried 意味論、
  denylist 不明示)→ direction correction(採用ノートのみ)+ recordedNote 共有
  関数 + pre-stage count + 明示 denylist へ改訂。
- ラウンド2-4: staging の空置換規則・実装節の旧設計残存・stale 文言を順次修正し
  APPROVED (confidence 0.99)。

## Implementation review (codex-impl-review, session impl-notes-carry)

- 実装: Opus 5 サブエージェント(worktree、base 32ecbf7 — 生成時 stale だったため
  agent が 32ecbf7 へ hard-reset してから作業、申告済み)。orchestrator が patch を
  main(a39ba7a)へ適用。
- ラウンド1: APPROVED (confidence 0.98)。申告逸脱2件を受理
  (composeCodexUserText の param 改名 memoPrelude→carryoverPrelude、README
  ハーネス表への行追加は plan スコープ外として見送り)。
- 検証証跡: orchestrator 独立検証で typecheck clean・267/267 green(baseline 253
  +新14)・boundary/conditions drift guard 無編集で自動カバー・実機 smoke で
  notes_carried 0→1→2 の持ち越し・budget null(上限なし既定の実動作)を確認。
