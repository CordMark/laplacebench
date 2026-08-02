---
status: implemented
direction: exempt
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# 高能力プローブ: Sol@high 3腕の核 + Opus5@high 旗艦戦

## Direction Brief

1. **Purpose** — ユーザー仮説 2026-08-02「center 勝ち偏重と W-L の不安定は
   Sol@medium の能力が低いからかも。codex high や Opus 5 で今の状態を一回
   見たい」。能力を上げたとき (a) center 防御が現れるか、(b) 持ち越し効果が
   W-L に現れるかを観測する。

2. **Direction source(exempt)** — ユーザーの直接指示(原文上記)。実験コスト
   許容も既裁定。claude 側に reset/notes 変種が無いため、Opus は persistent
   同士の Model Arena 旗艦戦として組む(これは公開 matchup 適格の通常対局)。

3. **Adopted protocol(事前登録)** — 直列2 run、上限なし既定・clean-room・
   seed 42 系・seat 交互・max-plies 100・telemetry 有効:

   ```
   laplacebench play --team-a codex-cli:gpt-5.6-sol@high \
     --team-b codex-cli-reset:gpt-5.6-sol@high \
     --games 4 --swap --seed 42 --run-id harnesslab-sol56h-uncapped-persistent-vs-reset-20260802
   laplacebench play --team-a claude-cli:claude-opus-5@high \
     --team-b codex-cli:gpt-5.6-sol@high \
     --games 4 --swap --seed 42 --run-id arena-opus5h-vs-sol56h-uncapped-20260802
   ```

   停止規則 = 各固定4局・打ち切り・再抽選なし。全滅時のみ別 run-id で1度
   再実行(別報告・pool しない)。Run 15 は harness ablation(蓄積面へ収載
   候補)、Run 16 は **Model Arena の通常対局**(公開 matchup 適格、蓄積面
   対象外)。

4. **読み方(事前約束)** — 各 n=4 の示唆。W-L・コスト列・illegal 率・
   compaction(telemetry の範囲)・**center 防御の有無**(第2手番が center
   マスを物理的にブロックしたか — events から事後読み)を同格で報告。
   medium 世代の run との比較は能力条件が異なる観察比較。high の uncapped
   persistent は1局数百万トークン規模になり得る(ユーザー許容済み)。

5. **What disappears** — claude 側 reset/notes(未実装のまま)。Sol@high の
   notes 腕(今回はコスト対効果で見送り、必要なら追試)。3 run 目以降。

## Tier: standard(操作のみ)

コード変更なし。実行・verify・台帳収載・FINDINGS(Run 15/16)のみ。

## Execution / criteria

- 完走→verify→community コピー→(Run 15 のみ)curated list 追記→FINDINGS→
  follow-up review→コミット。
