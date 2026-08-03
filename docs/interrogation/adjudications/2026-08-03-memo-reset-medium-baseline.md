# 2026-08-03 memo-reset-medium-baseline — tier: standard(操作のみ)

Work item: Run 21(memo vs reset @medium、Run 20 の因果分離基線)の実行と完走処理。
Plan: `docs/plans/2026-08-03-memo-reset-medium-baseline.md`(direction: exempt —
ユーザー直接指示 2026-08-03「ではmediumでやってみようか」)。コード変更なし。
今回は起動前に pre-registration をコミット(1d82fec)。

## 実行記録

- Run 21 `harnesslab-sol56m-uncapped-memo-vs-reset-20260803`: preflight 一発
  合格・完走・verify 4/4・台帳収載・curated 9件目。**2-2 全局先手勝ち**(事前
  約束: W-L 無信号)。center 決着 2/4・elimination 2/4。信頼性は high と正反対:
  memo 側に illegal 0.088/turn + failed 2(reset ゼロ)。memo 書式は全60遷移
  updated(欠落・cap超過なし)— 「memoは書けるが、周りのプレーが弱い」。
  コスト memo 1,482 vs reset 1,283 out tok/move、レイテンシ 51s vs 48s。
- within-pair の effort 比較が成立: **medium 2-2(seat)→ high 4-0(後手2勝)**。
  能力仮説の向きどおり。各 n=4・別対局群につき方向の示唆に留める(FINDINGS に
  明記)。
- arena golden 再採取(4b3f94bf…)を同一コミットで実施。構成的検証: 新 run を
  除いた台帳が旧 golden 4419d13b… をバイト再現、公開局増ゼロ、counts のみ
  17->18 runs / 59->63 games。

## Follow-up review (impl-memo-reset-baseline)

R1 NEEDS_CHANGES (0.97): 台帳コピー byte 一致・run.json が codex-cli-memo(primed
でない)・数値/center 集計/メモ遷移全一致・golden 構成的検証再現は認定の上で —

- Q(review/causal-headline) major — Run 21 見出し「the within-pair evidence
  that effort unlocked the carryover」が事前約束(方向の示唆に留める)を超える
  因果表現。裁定: accept。修正: 「directional evidence consistent with effort
  unlocking the carryover」へ。
- Q(review/run-dir-path-leak) minor — 公開 summary.json の run_dir が
  ホスト固有絶対パスを露出(Fixed Check 7)。裁定: accept。修正: source +
  community copy を相対 "runs/<id>" に正規化(byte 同一維持・verify 4/4・
  スイート 312+13 green 再確認)。**残渣 follow-up(named)**: 既公開の4 run
  (guided 2本・sol56h persistent-vs-reset・sol56m-uncapped-memo 以前の世代)
  にも絶対 run_dir が残存 — 別スライスで一括正規化+republish する。

R2 NEEDS_CHANGES (0.99): 記録のみの指摘1件 — 親裁定が「記録済み」と申告した
本ログが実際には「記入待ち」のままだった(工程ミス、開示)。record-only
closure を試行したが本プロジェクトに closure policy が無く refused(exit 3)
→ 通常ラウンドで記入を検証。

R3 NEEDS_CHANGES (0.99): R2 分の記録は正確化されたが、上記の旧 R2 記述が
「record-only closure で APPROVED」という虚偽の履歴になっていた(締め行の
先走り記入)→ 本修正で R2/R3 を実際の経過どおりに訂正。

- ラウンド 4・指摘計 4 件で APPROVED(confidence 0.99)
