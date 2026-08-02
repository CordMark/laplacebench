---
status: approved
direction: exempt
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# 上限なし3つ巴の事前登録(reset / notes / persistent)

## Direction Brief

1. **Purpose** — direction doc §0.6 の3軸「私的に持ち越す vs 公的に持ち越す vs
   持ち越さない」を、上限が存在しない条件で初めて実測する。新しい Harness Lab
   蓄積面(G4)の初期コンテンツとなり、persistent の長期戦では provider 圧縮の
   初観測(context telemetry 配備済み)が期待される。

2. **Direction source(exempt の根拠)** — 人間の直接裁定の組み合わせで、新規の
   価値判断を含まない: 3軸は §0.6(裁定済み)、上限なしは uncapped-default
   スライス(人間裁定)、蓄積面の器はアリーナ同構造(人間裁定)、実験コストは
   「実験段階の今は一旦いらない」(ユーザー原文)。プロトコル自体は Run 9-11 と
   同型の事前登録。

3. **Adopted protocol(事前登録)** — G1(上限撤廃)と G2(notes-carry)の
   マージ後に、次の3 run を**直列**で実行する(サブスク同時負荷を1 run 分に
   抑えるため。run 内は既定の並列4局):

   ```
   laplacebench play --team-a codex-cli:gpt-5.6-sol@medium \
     --team-b codex-cli-reset:gpt-5.6-sol@medium \
     --games 4 --swap --seed 42 --run-id harnesslab-sol56m-uncapped-persistent-vs-reset-20260802
   laplacebench play --team-a codex-cli:gpt-5.6-sol@medium \
     --team-b codex-cli-notes:gpt-5.6-sol@medium \
     --games 4 --swap --seed 42 --run-id harnesslab-sol56m-uncapped-persistent-vs-notes-20260802
   laplacebench play --team-a codex-cli-notes:gpt-5.6-sol@medium \
     --team-b codex-cli-reset:gpt-5.6-sol@medium \
     --games 4 --swap --seed 42 --run-id harnesslab-sol56m-uncapped-notes-vs-reset-20260802
   ```

   条件: 上限なし(新既定)、seed 42 系(42/1042/2042/3042)、seat 交互、
   max-plies 100、turn timeout 1,200,000ms、clean-room 既定、
   context telemetry 有効(persistent 側)。停止規則 = 各ペア固定4局・途中打ち
   切り・再抽選なし。provider 失敗は availability failure として報告。1 run
   全滅時のみ同条件・別 run-id で1度再実行する。その場合、**元 run は
   availability 記録として報告し、再実行 run は別 ID の代替試行として報告する。
   両 run の局を混ぜて集計したり、結果を見て局単位で選び直すことは決してしない**
   (分析対象は run 単位で固定)。3 run の実行順は上記の
   固定順とし、途中結果を見て残りの run を中止・変更しない(全12局を完走する)。

4. **読み方(事前約束)** — 各ペア n=4 の示唆に留める。W-L と併せて、
   トークン/手・レイテンシ/手・illegal 率・compaction 発火(telemetry)を同格で
   報告する。Run 9-11(上限あり)との比較は**条件の異なる歴史との観察比較**と
   してのみ言及。3 run 横断の「リーグ表」的合算はしない(蓄積面 G4 の表示設計に
   委ね、本 FINDINGS では per-pairing で報告)。seat 支配(Run 10 の教訓)が
   再発した場合は W-L に信号なしと明記する。persistent の長期戦がスレッドを
   window(258,400)へ到達させた場合、compaction を FINDINGS の主要な観測として
   扱う — ただし報告するのは**既存 artifact が支える範囲のみ**: 発火回数・
   rollout 内イベント位置(index)・window 値・コール毎トークン系列。**発火の
   手番(ply)は telemetry に直接記録されない**ため、既存 artifact(トークン
   系列の落ち込み等)から独立に対応づけられる場合のみ報告し、できなければ
   「unknown」と明記する。手番記録の telemetry 拡張を本スライスの暗黙の前提に
   しない。

5. **What disappears / is not protected** — 3 run 横断の合算順位。個別要因の
   分解(各ペアは H0/H1 の複合差)。実行時間・サブスク消費の上限(persistent の
   上限なし長期戦は1局あたり数百万トークン規模になり得る — ユーザー裁定により
   許容)。memo 腕の再測(今回は3軸に絞る)。

## Tier: standard(操作のみ)

コード変更なし。事前登録された実験 run 3本と、その FINDINGS(Run 12-14)・
community 台帳収載のみ。

## Execution and verification

- 前提: G1・G2 が main にマージされ全テスト green であること。
- 各 run 完走後: `verify` → community/runs/keisuke70--<run-id>/ へコピー →
  FINDINGS Run 12/13/14 を記述規律つきで追記 → コミット。
- run.json の isolation / matchup_kind / harness_conditions と
  `output_token_budget_per_team_per_game: null` を確認。

## Failure and rollback

- 実験は additive(run artifact のみ)。失敗 run も記録として残す。

## Completion criteria

- 3 run 12局の完走(または availability failure の正直な報告)、verify、
  台帳収載、FINDINGS 3本、codex-impl-review(FINDINGS 文面の follow-up)
  APPROVED。
