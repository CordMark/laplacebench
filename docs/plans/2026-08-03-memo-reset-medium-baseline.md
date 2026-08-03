---
status: implemented
direction: exempt
owner: bench
risk_tier: standard
last_updated: 2026-08-03
---

# memo vs reset @medium 基線: Run 20 の因果分離

## Direction Brief

1. **Purpose** — Run 20(memo vs reset @high = memo 4-0、後手2勝)の解釈は
   「high effort が設計された持ち越しを解錠した」だが、memo-vs-reset には
   medium 基線が無く、この読みは notes ペアからの推論に留まる
   (FINDINGS Runs 19-20 の明記済み限界)。ユーザー指示 2026-08-03
   「ではmediumでやってみようか」— 同一ペアを medium で回し、within-pair の
   effort 比較を成立させる。medium でも memo が勝てば「解錠」でなく
   「memo 設計そのものの優位」、負けまたは無信号なら能力仮説が強まる。

2. **Direction source(exempt)** — ユーザーの直接指示(原文上記)。
   プロトコルは Run 19/20 プラン(2026-08-03-high-turnscoped-vs-reset.md)の
   effort 違いの同型再演で、新規裁定事項なし。

3. **Adopted protocol(事前登録)** — 1 run、上限なし既定・clean-room・
   seed 42・seat 交互・4局固定・max-plies 100・telemetry 有効:

   ```
   laplacebench play --team-a codex-cli-memo:gpt-5.6-sol@medium \
     --team-b codex-cli-reset:gpt-5.6-sol@medium \
     --games 4 --swap --seed 42 --run-id harnesslab-sol56m-uncapped-memo-vs-reset-20260803
   ```

   停止規則 = 固定4局・打ち切り・再抽選なし。全滅時のみ別 run-id で1度
   再実行(別報告・pool しない)。harness ablation(蓄積面へ収載候補)。

4. **読み方(事前約束)** — n=4 の示唆。W-L・出力トークン・illegal/format
   率・手あたりレイテンシ・center 決着比率・center 捕獲コンテスト・memo
   書式遵守を同格で報告。high(Run 20)との対比は同一ペア内の effort 比較
   として報告してよいが、n=4×2 なので方向の示唆に留める。

5. **What disappears** — notes の medium 再戦(既測: 2-2)。3局目以降の
   追加。memo-v2 設計(並行スライスだが本 run には入れない — 本 run は
   memo-v1 不変が前提)。

## Tier: standard(操作のみ)

コード変更なし。実行・verify・台帳収載・FINDINGS のみ。

## Execution / criteria

- 完走→verify→community コピー→curated list 追記→FINDINGS→follow-up
  review→コミット(台帳 admit コミットは push 前に全体スイート必須・
  arena golden 同一コミット再採取)。
