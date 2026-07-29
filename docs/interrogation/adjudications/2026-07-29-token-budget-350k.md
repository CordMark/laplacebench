# work item: token-budget-350k — tier: standard

Requirement source: 2026-07-29 ユーザー指示「25万ではトークンが足りなく
なりがち」「これからハーネス対局みたいな可能性も含め」新規LLM対局の
標準値を35万へ上げる。

Tier defense: 通常のマッチ資源既定値とモデルへ開示される具体値を変更する
ため standard。既存schema、admission機構、過去データ意味、認可・金額・
外部契約・不可逆操作は変更しないため heavy ではない。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "971ba3fb-65d1-4cf8-9231-bda55bb8d6a0",
      "work_item_id": "token-budget-350k",
      "session_key": "direction-token-budget-350k",
      "occurred_at": "2026-07-29T06:56:09.934Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "value-cost",
            "external-reality",
            "recurrence"
          ],
          "question": "Is 350k derived from the actual demand distribution (per-move thinking telemetry × realistic ply counts across recorded runs) or only from the single GPT-5.6 run plus arbitrary headroom — i.e., will heavy-thinking models like Opus-class profiles exceed it and recreate the same distortion?",
          "context_refs": [
            "docs/plans/2026-07-24-token-budget.md"
          ],
          "author_position": "DEFEND",
          "outcome": "evidence-found",
          "effect": "no-change",
          "requested_evidence": "Ledger-wide reasoning-inclusive output token distribution: four long GPT-5.6 Sol high sides at 254,272/258,356/282,156/283,682; overall LLM-side median 144,770; next-heaviest Opus 5 high at 159,038/183,502; observed overshoot/final-turn sizes (~32k, ~8k, ~41k) supporting the one-worst-turn margin criterion."
        }
      ],
      "duration_ms": 44663,
      "input_tokens": 34890,
      "cached_input_tokens": 0,
      "output_tokens": 2312,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 16316,
            "cached_input_tokens": 0,
            "output_tokens": 1360
          },
          "normalized_delta": {
            "input_tokens": 16316,
            "cached_input_tokens": 0,
            "output_tokens": 1360
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 18574,
            "cached_input_tokens": 0,
            "output_tokens": 952
          },
          "normalized_delta": {
            "input_tokens": 18574,
            "cached_input_tokens": 0,
            "output_tokens": 952
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
    "transcript_hash": "4f4f1788984efa3f58aa3eb4a57a7cbfc41e21e1d6143541c0d7f445b2e465ef",
    "decision_context_hash": "36fc7f24f58703cde49d6c0dbf62afe699272aacb9a075a5babdd4fa93bf8b17",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review

- Q(review/readme-progress-example): 現行READMEの一般的なprogress例が
  `/250k` のままで、既定値変更後にstale contractへ見えるのではないか。
  - Defense: 当初は表示fixtureとして保持する想定だったが、ユーザー向け現行例で
    override/historyのラベルがない以上、現在値のderived copyとして扱うべき。
  - Ruling: revise（class: B）。README例を350kへ更新し、inventoryとabsence
    検証へ追加する。
- Q(review/canonical-owner): briefがrunner.tsとcli.tsを双方ownerとしたが、
  実際にはcli.tsはrunnerの定数を消費するderived ownerではないか。
  - Defense: reviewerの指摘どおり。値のownerと解決/helpのownerを分離すると
    source of truthが一意になる。
  - Ruling: revise（class: B）。briefをrunner canonical / cli derivedへ修正する。
- ラウンド 2・指摘計 2 件で APPROVED（confidence 0.98）

## Implementation review

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.99）
