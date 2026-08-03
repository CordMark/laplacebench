---
status: approved
direction: direction-memo-primed
owner: bench
risk_tier: standard
last_updated: 2026-08-03
---

# memo-primed: 運営執筆 Strategy Primer 注入 variant と直列2 run

## Direction Brief

1. **Purpose / 要求出所** — ユーザー直接指示 2026-08-03「memo のより新しい
   バージョンを考えよう。このゲームをより理解して、CPU がどんな風に考えて
   いるのか、どういうポイントを確認すればよりよい手が打てるかなどルールから
   深く考えて、より効率的に・より深く・よりよい手を打たせられる仕組みにする」
   「重くならないように」「CPU のロジックも参考に」「ブロックの重要性・
   センターの守り方・2色の協調をルールから導出してもよい」。Primer 著者は
   運営(案b)と裁定済み — 自己蒸留は「運営作に勝てるか」という将来の別検証。

2. **良くしたいこと** — 設計された持ち越し(memo)にゲーム理解を加えたとき、
   W-L とコスト効率(再導出税の削減 = output tokens/move)がさらに動くかを、
   要因分離可能な形で測れるようにする。ユーザーの発信主題「ハーネス込みで
   能力が跳ね上がる」への直接データ。

3. **採用方向(direction ACCEPT 済み)** — 新 variant `codex-cli-memo-primed`
   = memo-v1 と機構完全同一 + 毎手、固定戦略文書 primer-v1(repo 内定数・
   凍結・public、**≤2000字目標・2500字上限**)を注入。実験は直列2 run
   @high・**実行順 2→1**:
   - Run A(先行): primed-memo vs codex-cli-reset @high — ユーザーの命題
     「立派なハーネスが reset に勝つ」への直接回答。
   - Run B(後続): primed-memo vs codex-cli-memo @high — primer の純効果
     (機構同一・注入物のみ差)。
   primed が両方負けても「運営知識注入は効かない」という発見として発信素材に
   なる(guided 逆効果と同級)。

4. **大きい tradeoff・不確実性** — (1) 運営執筆 = 人間知識注入込みの主張に
   なる(ユーザー承知の上で採用)。(2) primer 品質は執筆に依存 — 全文を本
   プランに収載しレビュー対象にする。(3) 毎手入力 +500-600 tokens は、狙い
   どおり output(支配項、high turn-scoped で ~2,100-2,750 tok/move)が数百
   減れば正味で軽い — 既存の output tokens/move 列で検証可能。

5. **消えるもの・守らないもの** — 自己蒸留 primer(将来の別実験として温存、
   今回は作らない)。Template v2(Threats 節追加)は本スライス外の別部品。
   primer の対局中書き換え(学習系 lifecycle)は不採用 — 静的凍結のみ。
   medium での primed 実験(Run 17 教訓: medium は内容誘導を活かせない —
   medium 基線 run の結果次第で追加裁定)。

6. **境界** — 方向性文書 §4: 「戦略書・構造化メモ・決定論的注入」は H1 で
   対象内。H3(合法手 oracle・実行時探索・外部 endpoint)には触れない。
   primer はチャネルでなく注入物(毎手同一・凍結)だが、HARNESS_CONDITIONS
   の mechanism 宣言に primer-v1 を明記し観測可能性を public とする。
   turn-scoped 系と同じく ambient 実行は fail-closed 拒否。公開 matchup
   非適格(learn/reset 系と同じ扱い)。

## Primer-v1 全文(凍結対象・レビュー対象)

英語・seat-invariant(Run 7 教訓: "we"/"the opponent"、チーム文字禁止)。
出典: rulebook 導出 + 蓄積 20 run の実証(center 争奪・二重捕獲・先手支配)+
product CPU 評価関数(material/threat/capture/mobility — center 盲目の補正)。

```
## Strategy primer (fixed harness guidance)

Priority order for choosing a move:
1. Win now: complete the four center squares, or the capture that
   eliminates the opponent's second color.
2. Stop the opponent's immediate win (center or elimination).
3. Leave nothing capturable. Captures trigger ONLY from the mover's
   landing square: entering a sandwich is safe, being left in one is
   not. For each exposed piece, scan its rook lines: if one end is
   flanked by an opponent color and a NORMAL piece of that SAME color
   can land on the other end before this piece moves again, the whole
   line dies (two of yours on it = double capture). Also check
   enclosure: a group adjacent to the mover's landing square with no
   empty neighbor square is captured whole, anywhere on the board.
4. Prefer multi-captures: a color dies at 3 losses, so a double
   capture can jump 1 -> 3. Aim at the opponent color with more
   losses; protect your color at 2 losses first.
5. Contest the center: winners capture intruders rather than
   blockade. A center piece that can be flanked will be cleared —
   keep support nearby.
6. Then: mobility and position.

Turn order is Red -> Blue -> Yellow -> Green (a color with no pieces
is skipped). Before this color acts again, normally both opponent
colors move and your other color once — list their most dangerous
replies and check your move against them.

Play your two colors as one army. Sandwich flanks must be the SAME
color: build capture geometry with pairs of one color; use the other
to block lanes, hold center, and stage attacks. Friendly
fire: teammate-color pieces inside a line you trigger are captured
and count as its losses.

Voids never capture but still move, and DO count for center
victory. Yours serve as far flanks and enclosure walls. Capturing
opponent Voids wins space, not elimination progress — prefer their
normal pieces.

Efficiency: do not re-derive the history. Trust your memo's plan;
verify only what changed.
```

(規則整合の注記: 挟撃の着地側は NORMAL 駒限定 — Void は動いても捕獲しない。
静止側 far flank は Void 可 — rulebook §4.1/§6 どおり両方 primer に反映。
enclosure と skipped-color 例外も明記。実装時に `PRIMER_TEXT.length <= 2000`
を番人テストで固定する — 2500 は絶対上限、2000 が凍結時の実測要件。)

## 実装 inventory

1. `packages/cli/src/agents/primer.ts`(新規): `PRIMER_REVISION = "primer-v1"`、
   `PRIMER_TEXT`(上記全文)。番人テスト用に export のみ、ロジックなし。
2. `packages/cli/src/agents/memo.ts`: `MemoSession` に任意 `primer?: string`
   を追加(既定 undefined = memo-v1 のバイト不変)。`prelude()` が primer を
   MEMO_INSTRUCTIONS の前に連結。NOTES_V1 既定引数 alias と同じ後方互換手法。
3. `packages/cli/src/agents/cli.ts`: `specHead` を variant 対応
   (`codex-cli-memo-primed`)。memo/notes 排他チェックは共通のまま。
4. `packages/cli/src/cli.ts`: spec 分岐 `codex-cli-memo-primed` 追加
   (clean-room 必須リスト・MemoSession(primer 付き) 生成)。
5. `packages/cli/src/catalog.ts`: `RECOGNIZED_HARNESSES` / LLM 判定 /
   `HARNESS_CONDITIONS`(context_lifetime は memo と同一、mechanism に
   「+ fixed public strategy primer (primer-v1) injected every turn」)/
   buildSpec 文法。公開 matchup allowlist には**入れない**。
6. `packages/cli/src/publicgames.ts`: `RunnableAgentSpec` /
   `classifyRunnableAgentSpec` に `codex-cli-memo-primed` を追加 —
   **長い接頭辞を `codex-cli-memo`・`codex-cli` より先に判定**(接頭辞順序
   バグの既知パターン)。catalog 認識だけでは smoke コマンドが走らない。
7. テスト: (a) memo-harness.test.ts **無編集 green** = memo-v1 バイト不変の
   証明。(b) 新 memo-primed test: injectable runner で act() 経路の毎手
   primer 注入・memo 遷移共存・**primer 文字数番人(≤2000)**。
   (c) **差分同一性テスト**: 同一スクリプト手順を memo-v1 と memo-primed の
   両方で injectable runner に流し、primed 側の毎 call user text から凍結
   primer ブロックを正確に除去したものが memo-v1 側と**バイト一致**する
   ことを全 call(初手・memo 持ち越し手を含む)で assert。memo artifact /
   status 遷移も harness 名以外同一であること。(d) classifier テスト:
   full spec / bare spec が memo・素の codex-cli に誤分類されないこと。
   (e) catalog parse/headline。(f) harness-boundary: ambient fail-closed。
8. 実機 smoke: `codex-cli-memo-primed:gpt-5.6-sol@low vs random`、1局 max-plies 4、
   clean-room 既定 — spec 受理〜記録の end-to-end。

## Adopted protocol(事前登録・直列2 run)

```
laplacebench play --team-a codex-cli-memo-primed:gpt-5.6-sol@high \
  --team-b codex-cli-reset:gpt-5.6-sol@high \
  --games 4 --swap --seed 42 --run-id harnesslab-sol56h-uncapped-primed-vs-reset-<date>
laplacebench play --team-a codex-cli-memo-primed:gpt-5.6-sol@high \
  --team-b codex-cli-memo:gpt-5.6-sol@high \
  --games 4 --swap --seed 42 --run-id harnesslab-sol56h-uncapped-primed-vs-memo-<date>
```

停止規則 = 各固定4局・打ち切り・再抽選なし。全滅時のみ別 run-id で1度
再実行(別報告・pool しない)。読み方(事前約束): W-L・**output tokens/move
(効率主張の主列)**・illegal/format・手あたりレイテンシ・center 決着比率・
memo 書式遵守を同格で、各 n=4 の示唆。Run A は「primed という系が reset に
勝つか」、Run B は「primer の純効果」であり、要因分解は Run B のみが担う。

## Execution / criteria

実装→フルスイート+typecheck→impl review(6項目弁明同梱)→smoke→
実験2 run→verify→台帳収載(golden 同一コミット再採取)→FINDINGS→
follow-up review→コミット。
