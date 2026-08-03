# 2026-08-03 high-turnscoped-vs-reset — tier: standard(操作のみ)

Work item: Run 19/20(notes vs reset @high / memo vs reset @high、初の memo-reset
直接対決)の実行と完走処理。
Plan: `docs/plans/2026-08-03-high-turnscoped-vs-reset.md`(direction: exempt —
ユーザー直接指示 2026-08-03「notes や memo の強さが出ないのはモデルの reasoning が
弱いからかも。high effort で試してほしい」)。コード変更なし。工程開示: プロトコルは
run 起動前にセッション内で固定したが、pre-registration コミット(6f7e153)は完走後
(起動順はコミット本文に明記)。

## 実行記録

- Run 19 `harnesslab-sol56h-uncapped-notes-vs-reset-20260803`: preflight 一発
  合格・完走・verify 4/4・台帳収載・curated 7件目。**2-2 全局先手勝ち**(事前
  約束: W-L 無信号)。信頼性は medium から反転: notes クリーン、reset に
  illegal 0.044/turn + failed turn 1。
- Run 20 `harnesslab-sol56h-uncapped-memo-vs-reset-20260803`: preflight 一発
  合格・完走・verify 4/4・台帳収載・curated 8件目。**memo 4-0(後手2勝、
  ともに 34手 elimination)** — harness ablation で初めて reset を W-L で
  破り、初めて seat 支配を破った。memo 書式遵守全数クリーン(omission 0・
  cap 超過破棄 0)。
- 事前登録の center 読み: 勝者が center 捕獲を制す従来パターン継続。memo の
  後手勝ち2局は center 捕獲 5-0 / 5-1。
- 内容検証: game-001 の勝ち筋 (6,3)->(6,4) 二重捕獲が **2手番前(ply 29)の
  memo の standing plan に明記** — 引き継がれた攻め筋が実際の勝ち筋になった
  初の観測。ただし notes 側の高 effort ノートにも条件付き複数手番計画が実在
  (g0「On Red’s next turn, the key tactic remains…」)するため、「notes は
  盤面再導出可能な内容のみ」という強い読みは成立しない — memo の 4-0 の
  要因(構造化された書き換え/有界単文書形式/high effort/run 分散)は本
  設計では分離不能、と FINDINGS に明記。
- arena golden 再採取(4419d13b…)を同一コミットで実施。構成的検証: 新2 run を
  除いた台帳が旧 golden bc5aa0e3… をバイト再現(builder 不変)、公開局増ゼロ
  (memo/notes/reset 腕は公開 matchup 非適格)、verified counts のみ移動
  (runs 15->17, games 51->59, public 11 不変)。

## Follow-up review (impl-high-turnscoped)

R1 NEEDS_CHANGES (0.98): 台帳コピー verbatim・curated 整形・memo 計画/捕獲・
center 捕獲数・golden 現台帳合格は全て実測一致と認定の上で —

- Q(review/causal-overclaim) major — 「notes は per-move rationale のみ、
  fresh 文脈は何も失わない → 設計構造+reasoning が勝因」という因果説明が
  run artifact と矛盾(notes にも複数手番の条件付き計画が実在)し、n=4 の
  事前姿勢を超える。裁定: accept。修正: 検証済み観測(ply-29 memo の
  standing plan)と仮説を分離し、notes の反例引用を原文どおり収載、4-0 の
  要因は分離不能と明記。
- Q(review/missing-preregistered-metric) major — 事前登録した center 決着
  比率が節に欠落(5-0/5-1 は捕獲数であって決着比率ではない)。裁定: accept。
  修正: Run 19 = 3/4 center・1/4 elimination、Run 20 = 1/4 center・3/4
  elimination を明記。

- ラウンド 2・指摘計 2 件で APPROVED(confidence 0.99)
