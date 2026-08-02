# 2026-08-02 high-capability-probe — tier: standard(操作のみ)

Work item: Run 15/16(Sol@high ablation + Opus5@high 旗艦戦)の実行と完走処理。
Plan: `docs/plans/2026-08-02-high-capability-probe.md`(direction: exempt —
ユーザー直接指示 2026-08-02「codex high effortとかclaudeのopus5とかでも今の
状態で一回やってみてほしい」)。コード変更なし。

## 実行記録

- Run 15 `harnesslab-sol56h-uncapped-persistent-vs-reset-20260802`: 完走・
  verify 4/4・台帳収載・curated list 4件目。persistent 3-1(後手 center 勝ち
  含む)。
- Run 16 `arena-opus5h-vs-sol56h-uncapped-20260802`: **初回試行は preflight で
  claude positive canary が1回死亡(canary 指示未注入)→ fail-closed 拒否・
  run 記録ゼロ**。記録ゼロのため同一 run-id で1度だけ再試行(FINDINGS に明記)。
  再試行は preflight 合格・完走・verify 4/4・台帳収載。Opus 4-0(後手2勝含む)。
  model-arena につき curated list 対象外(公開 matchup 適格)。
- 事前登録の center 防御事後読みで**検出器バグを発見・訂正**: capture イベントは
  `{"at":[r,c],"owner"}` 形式。初回パースの「center 捕獲ゼロ」は誤り。訂正後:
  全16 uncapped 局で center は争奪され、勝者側捕獲が 2.2-2.4x(34/14 med,
  11/5 high)。FINDINGS にバグごと開示。

## Follow-up review (impl-high-probe): 2ラウンド

R1 NEEDS_CHANGES (0.99): 数値・台帳コピー・curated 追記・canary/検出器開示は
全て実測一致と認定の上で —

- Q(review/cross-provider-cost) major — Run 16 の「敗者の請求書が大きい」系の
  表現が cross-provider トークン合計をコスト比較として扱い、usage schema 自身の
  descriptive-only 規約に違反。裁定: accept。修正: 記述的報告+非比較性の明記+
  結論語の除去(トークン列と時計列を並記)。あわせて自己検出: 「Sol は center
  捕獲ゼロ」が同節の 9-1 と矛盾 → game-001 の1捕獲を正しく帰属。
- Q(review/multiplier) minor — 「~2.5-3x」が実数(2.43x/2.2x)と不一致。
  裁定: accept。修正: 「roughly 2.2-2.4x (34/14, 11/5)」。

R2: 2件 ACCEPT → **APPROVED (0.99)**。

## Bounded corrective (impl-arena-golden-recapture): APPROVED (0.99)

d26fc32 の台帳追加時に arena golden の再採取を同一コミットで行わず CI が
fail(規則の文言違反 — push 前の全体スイート再実行を怠った工程ミス)。
構成的検証(旧台帳で旧 golden をバイト再現・新公開局が Run 16 の4局のみ・
カウント増分一致)の上で c4fd7280… へ再採取、レビュアーも独立再ビルドで一致を
確認。教訓: 台帳へ run を admit するコミットは push 前に必ず全体スイートを回す。
