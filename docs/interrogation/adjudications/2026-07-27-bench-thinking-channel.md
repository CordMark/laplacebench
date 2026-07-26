# work item: bench-thinking-channel — tier: heavy（暫定・plan review で確定）

Slice: 「この手で考えたこと」をモデル非依存の共通基盤にする。着手ノートを応答
契約の必須フィールドにし、`agent-response` schema を v2 へ。プロバイダ固有の
reasoning 正規化は実測により棄却。プラン:
`docs/plans/2026-07-27-bench-thinking-channel.md`（status: draft）。

Requirement source: ユーザー対話 2026-07-27。「gpt側のモデルだけこの手で考えた
ことがいつも空だから何かおかしいと思う」→ 調査報告後「これからモデルを足すことも
考えてるからモデルによらず思考の過程が共通基盤として拾えてui上に見える方法を
考えて」。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "7e0a30ce-f8d2-4c17-ac14-30737e6e24cd",
      "work_item_id": "bench-thinking-channel",
      "session_key": "direction-bench-thinking-channel",
      "occurred_at": "2026-07-26T17:34:11.940Z",
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
            "concept"
          ],
          "question": "観戦表示の欠落を埋めるために測定契約（必須ノート）を変えるのは要求より重い手ではないか。F2修正＋明示ラベル（既存の「自己申告・記述的」パターン）でユーザーの問題は解消しないか。",
          "context_refs": [
            "design-v0.1 §5",
            "FINDINGS Run 8",
            "agents/cli.ts:311",
            "agents/llm.ts:94"
          ],
          "author_position": "DEFEND",
          "outcome": "evidence-found",
          "effect": "premise-corrected",
          "requested_evidence": "codex reasoning summary の実測内容（実際の盤面プロンプトでの出力）"
        },
        {
          "id": "T002",
          "families": [
            "time-scope",
            "concept"
          ],
          "question": "案A採用時、出力契約が変わるのにルールセットIDを据え置くのは「記録データより強い主張をしない」直近の判断（effort見出し）と整合するか。",
          "context_refs": [
            "docs/plans/2026-07-27-bench-effort-identity.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 71379,
      "input_tokens": 43552,
      "cached_input_tokens": 3107,
      "output_tokens": 3899,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 19663,
            "cached_input_tokens": 1434,
            "output_tokens": 1937
          },
          "normalized_delta": {
            "input_tokens": 19663,
            "cached_input_tokens": 1434,
            "output_tokens": 1937
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 23889,
            "cached_input_tokens": 1673,
            "output_tokens": 1962
          },
          "normalized_delta": {
            "input_tokens": 23889,
            "cached_input_tokens": 1673,
            "output_tokens": 1962
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
    "transcript_hash": "ca67ec63cb936ddb985b738ebe4e121ce30e72c3993e264780b84ba5d8ff308d",
    "decision_context_hash": "089e4c75339be16743bc230dc484cad318228b3d69a73f6d0cdb72977b55dc04",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-bench-thinking-channel)

- Q(review/tier-overstated): heavy 判定が実 delta と釣り合っていない。ルール・
  レフェリー・凍結ルールセット・公開 payload の形・消費者契約はいずれも不変で、
  条件分離は既存 `prompt_rev`、変更する schema は実行時に誰も参照しない →
  受理、**standard へ下げ**尋問ゲートを外した(revise, class: A)。
- Q(review/schema-v2-not-a-contract): 「schema を v2 にすれば契約が変わる」は
  誤り。当該ファイルは実行時 validator ではなく、しかも既に現行 CLI とずれて
  いる（`request_id` 必須・座標が配列） → 受理、実行時契約の正本は
  `prompt.ts`（`buildInstructions` + `PROMPT_REV`）であると訂正し、schema は
  非強制の設計記述として drift ごと明記。drift 解消は範囲外と宣言
  (revise, class: A)。`TeamStats` の所有者も types.ts → runner.ts へ訂正。
- Q(review/cot-ambiguity): 「思考の過程」という語のままでは design-v0.1 §5 の
  「private chain-of-thought を要求も採点もしない」と衝突して読める → 受理、
  要求物を**観測可能な着手理由**と定義し直した。ただし**短さの要求ではない**
  ことを明記（現在 Claude が書いている数百字の局面読み＋狙いは望ましい形で
  切り詰めない）(revise, class: A)。
- Q(review/compliance-undefined): 遵守率の分子分母と生対局の合否が未定義で、
  「遵守率が記録されたから成功」は反証不能 → 受理、分母＝採用された着手
  (`moves`)・分子＝空ノート(`noteOmissions`)と定義し、repair/timeout/skip/pass は
  どちらにも入れない。生対局の閾値を codex 側 ≤ 0.2 と定め、未達なら
  プロンプト文面の是正1回、それでも駄目なら direction へ差し戻すと明記
  (revise, class: A)。
- Q(review/doc-inventory-gap): `match-conduct-laplace-8x8-v1.md:63` と
  `usage-semantics.md:114` が p2 を正準世代として名指ししている → 受理、
  インベントリへ追加し p3 更新と p2 履歴保持の方針を記載(revise, class: C)。
- Q(review/parser-cannot-reuse-extractMove): `extractMove` は `Move` しか返さず
  文字範囲を持たないため、ノート抽出に再利用できない → 受理、最後に成立した
  着手 JSON とその範囲を返す共有パーサを計画し、JSON 複数・末尾散文・空白のみ・
  コードフェンスの期待を明記(revise, class: B)。
- Q(review/fallback-generation-blind): `note ?? raw` は p3 でノート未記載のとき
  着手 JSON を commentary として公開してしまい、自らの不変条件と矛盾する →
  受理、`note` フィールドの**有無**で分岐する3行規則へ（無し=raw／在って非空=note／
  在って空=commentary を出さない）。世代文字列をエクスポータが読まずに済む
  (revise, class: A)。
- Q(review/brief-contradicts-body): Direction Brief の Concept owner が schema を
  正本として残していた → 受理、`prompt.ts` 単独へ訂正(revise, class: C)。
- Q(review/denominator-mixed): metrics インベントリが turn 分母と書いており
  遵守定義（moves 分母）と食い違う → 受理、`note_omission_rate` として
  `noteOmissions / moves` を明示(revise, class: B)。
- ラウンド 3・指摘計 9 件で APPROVED（confidence 0.98）
