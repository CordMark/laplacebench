---
status: approved
direction: exempt
owner: bench
risk_tier: standard
last_updated: 2026-08-03
---

# 高能力プローブ第2弾: turn-scoped 記憶設計 vs reset @high

## Direction Brief

1. **Purpose** — ユーザー仮説 2026-08-03「notes や memo の強さが出ないのは
   モデルの reasoning が弱いからかも。high effort で試してほしい」。medium では
   notes vs reset = 2-2(Run 12-14 セット)、memo vs reset は未実施。能力を
   上げたとき、設計された持ち越し(notes / memo)が reset に **W-L で**勝る
   かを観測する。ユーザーの発信主題は「モデル単体でなくハーネス込みで能力が
   跳ね上がる」— その最初の証拠候補となるデータ点。

2. **Direction source(exempt)** — ユーザーの直接指示(原文上記)。high
   uncapped のコスト許容は Run 15 で既裁定(今回は両腕 turn-scoped のため
   入力は成長せず、persistent@high より軽い)。

3. **Adopted protocol(事前登録)** — 直列2 run、上限なし既定・clean-room・
   seed 42・seat 交互・4局固定・max-plies 100・telemetry 有効:

   ```
   laplacebench play --team-a codex-cli-notes:gpt-5.6-sol@high \
     --team-b codex-cli-reset:gpt-5.6-sol@high \
     --games 4 --swap --seed 42 --run-id harnesslab-sol56h-uncapped-notes-vs-reset-20260803
   laplacebench play --team-a codex-cli-memo:gpt-5.6-sol@high \
     --team-b codex-cli-reset:gpt-5.6-sol@high \
     --games 4 --swap --seed 42 --run-id harnesslab-sol56h-uncapped-memo-vs-reset-20260803
   ```

   停止規則 = 各固定4局・打ち切り・再抽選なし。全滅時のみ別 run-id で1度
   再実行(別報告・pool しない)。両 run とも harness ablation(蓄積面へ
   収載候補)。

4. **読み方(事前約束)** — 各 n=4 の示唆。W-L・コスト列(出力トークン)・
   illegal/format 率・手あたりレイテンシ(reset@high は毎手再導出で遅い —
   Run 15 の観察の追試)・center 決着比率を同格で報告。medium 世代
   (uncapped-notes-vs-reset 2-2)との比較は能力条件が異なる観察比較。
   notes が illegal を出すか(medium では 0.068/turn)も見る。

5. **What disappears** — guided 系の high 腕(内容誘導は medium で逆効果 —
   opponent-modeling を含む guided-v2 プロンプト再設計はユーザー示唆どおり
   次スライスの設計課題であり、本 run には入れない)。persistent 腕(Run 15
   で既測)。3 run 目以降。

## Tier: standard(操作のみ)

コード変更なし。実行・verify・台帳収載・FINDINGS のみ。

## Execution / criteria

- 完走→verify→community コピー→curated list 追記→FINDINGS→follow-up
  review→コミット(台帳 admit コミットは push 前に全体スイート必須 —
  arena golden 再採取を同一コミット内で行う)。
