# 2026-08-03 memo-primed — tier: standard

Work item: `codex-cli-memo-primed`(memo-v1 機構 + 運営執筆 primer-v1 注入)と
直列2 run(vs reset 先行・vs memo-v1 後続、@high)。
Plan: `docs/plans/2026-08-03-memo-primed.md`(direction: direction-memo-primed)。

確定事項: (1) Primer 著者は運営(ユーザー裁定 — 自己蒸留は将来の別検証)。
(2) 比較腕は直列ペアに改訂(proxy 指摘 T001): vs reset がユーザー命題への直接
回答、vs memo-v1 が純効果。実行順 2→1(命題直結を先に確保)。(3) primer は
≤2000字目標・2500字上限、全文をプランに収載しレビュー対象化。(4) Template v2
(Threats 節)・自己蒸留・対局中書き換えは本スライス外。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "d573b3ea-fa2a-4e35-b644-4615b017d841",
      "work_item_id": "memo-primed",
      "session_key": "direction-memo-primed",
      "occurred_at": "2026-08-03T08:34:20.682Z",
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
            "value-cost"
          ],
          "question": "ユーザーの裁定は「リセットに勝てればハーネスの重要性の証明」なのに、事前登録は primed vs memo-v1。primed が負けた場合ユーザーの命題に使えるデータが残らないが、primed vs reset を先行/並走させない理由は何か",
          "context_refs": [
            "ORIGINAL PROPOSAL 対応案3",
            "ユーザー裁定引用「リセットに勝てれば…」",
            "Run 20 memo vs reset 4-0",
            "Run 17 guided 逆効果"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        },
        {
          "id": "T002",
          "families": [
            "value-cost"
          ],
          "question": "ユーザー明示の「重くならないように」に対し、~2500字≈700 tokens/手の毎手増分が予算内と判断した根拠、またはより短くできない理由は何か",
          "context_refs": [
            "ORIGINAL PROPOSAL tradeoff(4)",
            "ユーザー示唆「重くならないように」"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "simplified",
          "requested_evidence": null
        }
      ],
      "duration_ms": 74744,
      "input_tokens": 41979,
      "cached_input_tokens": 3107,
      "output_tokens": 3604,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 18825,
            "cached_input_tokens": 1434,
            "output_tokens": 2725
          },
          "normalized_delta": {
            "input_tokens": 18825,
            "cached_input_tokens": 1434,
            "output_tokens": 2725
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 23154,
            "cached_input_tokens": 1673,
            "output_tokens": 879
          },
          "normalized_delta": {
            "input_tokens": 23154,
            "cached_input_tokens": 1673,
            "output_tokens": 879
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
    "transcript_hash": "02ffd30ea1e2848ecce3fdce45f3dcb391e239ca4cdcd96867c30bbda1c643f7",
    "decision_context_hash": "8dc4dfd73d529dedd80314fdafc6af4d10f2402b78be69b1900714d039b8a644",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (plan-memo-primed): 3ラウンド・指摘計6件

- R1 NEEDS_CHANGES: (1) primer 規則不正確(挟撃着地側の NORMAL 限定欠落・
  enclosure 省略・skipped-color 例外欠落)→ 全て修正。(2) 実測 2,319 字で
  ≤2,000 目標超過 → 圧縮。(3) publicgames.ts 分類子の inventory 欠落
  (接頭辞順序含む)→ 追加。(4) 差分同一性テスト(primed から primer 除去 =
  memo-v1 バイト一致)欠落 → 追加。
- R2 NEEDS_CHANGES: (5) enclosure 記述が依然不正確(edges/corners 限定・
  着地square隣接の欠落)+ Void の center 適格欠落 — **R2 で私が「修正済み」と
  申告した enclosure 置換は字下げ不一致で実際には未適用だった(レビュアーの
  再検査が検出。開示済み)**。(6) smoke spec が未登録の短縮名。→ 両方修正。
- R3: 全解消・primer 実測 1,986-1,987 字 → **APPROVED (0.99)**。
- ラウンド 3・指摘計 6 件で APPROVED(confidence 0.99)

## Impl review (impl-memo-primed): APPROVED (0.99)

1ラウンド・指摘0。primer 凍結はプラン fenced block とバイト一致(1,986字)を
レビュアー独立検証。ambient fail-closed は run ディレクトリ生成前の
assertTurnScopedCleanRoom が実ゲートであることを確認。差分同一性(primed −
primer = memo-v1 全 call バイト一致・memo JSONL 同一)・接頭辞順序・公開
matchup 除外はテストで固定。フルスイート 312+13 green・typecheck 緑・
memo-harness.test.ts 無編集 green(v1 バイト不変の証明)。
- ラウンド 1・指摘計 0 件で APPROVED(confidence 0.99)

## 実機 smoke (2026-08-03): `runs/smoke-primed-lowvsrandom-20260803`

primed:sol@low vs random、1局 max-plies 4、clean-room 既定。初回起動は
preflight で codex positive canary 1回死亡(canary 指示未注入)→ fail-closed
拒否・記録ゼロ → 同一 run-id で1度だけ再試行(Run 16 と同じ既知 flake 処置)。
再試行は preflight 合格・完走(horizon_draw、4 plies)。spec 受理・run.json
harness_conditions に primer-v1 mechanism 宣言・memo 遷移 2/2 updated を確認。

## 実験実行記録 (Run 22/23)

- Run 22 `harnesslab-sol56h-uncapped-primed-vs-reset-20260803`(システム比較・
  先行): preflight 一発合格・完走・verify 4/4。**primed 3-1**(後手 center
  36手勝ち含む。敗局は先手 reset の23手 center 快走 = center 捕獲 0-0 の
  無抵抗レース)。center 決着 2/4。コスト列は逆風: primed 3,577 vs reset
  2,658 out tok/move(1.35x)・平均44手(79手の長期戦含む)。
- Run 23 `harnesslab-sol56h-uncapped-primed-vs-memo-20260803`(純効果・後続):
  preflight 一発合格・完走・verify 4/4。**primed 4-0・後手2勝**・両腕
  illegal/failed 全ゼロ・memo 遷移 128/128 updated・コスト同等(2,951 vs
  3,061 — primed 側がわずかに安い)。center 捕獲コンテスト全勝。
- 両 run とも起動前に summary の run_dir を相対に正規化して収載(Run 21 の
  レビュー裁定の慣行に従う)。curated 10-11件目。arena golden 同一コミット
  再採取(8255620c…、構成的検証: 旧台帳→旧 golden バイト再現・公開局増ゼロ・
  counts 18->20 runs / 63->71 games)。
- FINDINGS Runs 22-23 節: 「primed > memo > reset は pairing 横断の読みで
  round-robin 実測ではない」を明記。Run 17(guided 逆効果)との対比で
  「内容介入が初めてペイした」+ Run 20/21 の能力物語と同方向。

## Follow-up review (impl-memo-primed 続き・Run 22/23 landing)

R1 NEEDS_CHANGES (0.98): 台帳・curated・条件宣言・相対 run_dir・全数値一致は
認定の上で —

- Q(review/net-cost-overclaim) major — 「pays for itself / at equal cost」が
  出力列の平坦さを純コスト主張へ拡大(総トークン/turn は primed 17,399 vs
  17,051、fresh 12,098 vs 11,903 で primer 入力分は相殺されていない = プランの
  net-light 基準未達)。裁定: accept。修正: 見出しを「wins」へ、本文に
  総/fresh トークンの実測と「純コスト回収は未実証・小さな純コスト増での
  W-L 反転」を明記。

R2: 解消確認 → APPROVED (0.99)。
- (Run 22/23 landing)ラウンド 2・指摘計 1 件で APPROVED(confidence 0.99)
