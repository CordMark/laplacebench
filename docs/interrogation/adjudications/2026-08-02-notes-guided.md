# work item: notes-guided — tier: standard

Slice: 新腕 `codex-cli-notes-guided`(notes-v1 の機構完全共有・告知文のみ差し替え:
「(a) この手の目的、(b) 次の手番の自分が知っておくべきこと」。ゲーム固有戦術は
注入しない・書式指示ゼロ維持)。notes-v1 は無指示対照として不変。

確定事項: (1) guided vs persistent は**システム比較**とラベルし要因分解を主張
しない(要因分解は guided vs v1 が担う)。(2) 対称比較の完成形 guided-notes vs
primed-persistent は**名前付きの次セット本命**(能力プローブ後)。(3)「目的・
引き継ぎ」は内容方向づけであって書式ではない(denylist の線引き)。
実験: guided vs v1 / guided vs persistent 各4局・上限なし・Sol@medium。
実装は Opus 5 サブエージェント予定(未着手)。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "98443167-e791-4ebf-8953-685ee7cebb5e",
      "work_item_id": "notes-guided",
      "session_key": "direction-notes-guided",
      "occurred_at": "2026-08-02T09:35:25.883Z",
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
            "absence"
          ],
          "question": "notes-guided vs persistent(素)は「公的 vs 私的持ち越し」と「指示あり vs なし」の2変数が同時に動く非対称比較になっている。勝敗をどちらの結論として読むのか、またユーザーが示唆した persistent+primer を論点記録に落とすことで本命比較の解釈可能性を犠牲にしていないか。",
          "context_refs": [
            "docs/plans/2026-08-02-notes-carry.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 56403,
      "input_tokens": 37817,
      "cached_input_tokens": 3107,
      "output_tokens": 3192,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17412,
            "cached_input_tokens": 1434,
            "output_tokens": 1825
          },
          "normalized_delta": {
            "input_tokens": 17412,
            "cached_input_tokens": 1434,
            "output_tokens": 1825
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 20405,
            "cached_input_tokens": 1673,
            "output_tokens": 1367
          },
          "normalized_delta": {
            "input_tokens": 20405,
            "cached_input_tokens": 1673,
            "output_tokens": 1367
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
    "transcript_hash": "05bfbd4580aa9b2f6465cc3fb478e732ebbffe4b9418066686c027880c4dfb42",
    "decision_context_hash": "03b43114d78fb44af645bd9c2ca45e7063ad215585114f6cf94460bfc9010091",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (plan-notes-guided): 3ラウンド(variant API 後方互換の穴を検出→
NOTES_V1 既定引数+alias で解決)→ APPROVED (0.99)。

## Impl review (impl-notes-guided): APPROVED (0.98)。Opus worktree 実装、
notes-carry.test.ts 無編集 green = v1 byte 不変の証明。+13 テスト。
あわせて bounded corrective 2件(c038092 が live データを読む2テストを陳腐化 —
shipped list は schema 検証のみへ、arena golden は自文書の規則に従い同一コミットで
再採取 882142ae…。G6 agent の独立実測と一致し builder 不変を証明)。305/305 green。

## 実機 smoke (2026-08-02, orchestrator): `runs/smoke-guided-lowvsrandom-20260802`

guided:gpt-5.6-sol@low vs random、1局 max-plies 4、clean-room 既定。完走
(horizon_draw、4 plies)。guided 側 2 手とも note が記録され、両方が
「目的 + 次手番への引き継ぎ」の形(ply0: center 足場の確立+Yellow 追加の
準備を明示 / ply2: ply0 の脚本の継続を明示)。act() 経路の毎手注入自体は
`test/notes-guided.test.ts` が injectable runner で直接証明済み(隔離
CODEX_HOME は run 後に削除されるため rollout の事後 grep は不可 — smoke の
役割は spec 受理〜記録の end-to-end 動作確認)。残作業: Run 17/18(Run 16
完走後に直列)。

## 完走処理レビュー (impl-notes-guided 続き): APPROVED (0.99)

Run 17(guided vs v1、指示の純効果)= **v1 3-1**(うち後手2勝、コスト同等
1,375/1,461 tok/手、両腕クリーン)。Run 18(guided vs persistent、システム
比較)= 2-2 全局先手勝ち(事前約束: W-L 無信号)、persistent 6.2x コスト、
guided に illegal 4 + failed turn 1。curated 5-6件目・FINDINGS Runs 17-18 節・
arena golden 同一コミット再採取(bc5aa0e3…、構成的検証: 旧 golden バイト再現・
公開局増ゼロ)。レビュアー独立再ビルド一致・全数値照合済み。初回チェーンの
untracked 起動は preflight 中 kill(run 記録ゼロ、availability 記録不要)として
開示。次セット本命: guided-notes vs primed-persistent。
