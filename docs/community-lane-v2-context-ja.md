# Community レーン v2 — 設計コンテキスト

2026-07-25。**この文書はプランではなく、方向づけ対話に入る前の「ここまでに
確定した理解」の保全記録**である。正式プランは方向づけ対話のあとに
`docs/plans/` へ作る。

対象は「誰でも対局を投げられる公開ベンチ」を、**順位表ではなく対戦記録**
として成立させる再設計。laplacebench と laplace-main の2リポジトリにまたがる。

---

## 1. 前提（ユーザーから明示されたもの）

この再設計の自由度を決める重要な前提。**後続のエージェントはこれを
覆さないこと。**

1. **laplace.zone/bench は 2026-07-24 に作ったばかりで、まだ誰も見ていない。**
   後方互換を守る理由がない。UI も配信形式も大きく変えてよい
2. **既存の同梱ベンチデータは全削除して構わない。** 価値のあるもの
   （Codex 対 Fable のようなフロンティア同士の対局）だけ残せばよい
3. **UI は大幅に変わる前提**。既存レイアウトへの追従は制約にしない
4. **official（✓公式）レーンはコスト都合で当面やらない。** ただし概念
   としては保持する
5. **自動マージは受け入れる**（人間がマージ承認する設計にはしない）
6. **虚偽ラベル（自己申告のモデル名）は検出不能な限界として受け入れる**

---

## 2. 現状の実装（事実）

### 2.1 laplacebench 側

**台帳の構造**
- 正本は `community/runs/<gh名>--<run-id>/` 以下の生ログ
  （`events.jsonl` に全手）
- そこから計算した集計を2ファイルとして**リポジトリにコミット**している
  - `community/STANDINGS.md`（人間向け）
  - `community/standings.json`（機械可読、schema `laplace-bench-standings-v1`）
- laplace.zone が raw URL で `standings.json` を直接 fetch するため、
  マージ = 即公開（再デプロイ不要）

**集計ロジックの欠陥（`packages/cli/src/standings.ts`）**
- ソート第1キーが**生の勝ち数**（`b.wins - a.wins`）
- 集計ループは**対戦相手を一切記録していない**（`row(t.agent)` に自分の
  勝敗を足すだけ）
- 帰結: `center-greedy` に100勝と `level_5` に100勝が同価値。
  **試合数を増やせば機械的に順位が上がる**

**提出フロー（現行）**
1. 対局 → `runs/<run-id>` を `community/runs/<gh名>--<run-id>` へ手でコピー
2. 提出者が standings 再生成コマンドを叩いて2ファイルを更新
3. PR → CI がリプレイ検証 + 成果物のバイト整合を検査 → **人間がマージ**

**CI（`.github/workflows/community-verify.yml`）**
- トリガは `on: pull_request` のみ。**main への直接 push は無検証**
- `verify community/runs/*/` で**毎 PR 全 run を再検証**（O(n)、将来の
  ボトルネック）
- `community/runs` が空だと `exit 1`

**エージェント識別子（`packages/cli/src/catalog.ts`）**
- 構造化されている: `provider : model @ effort`
  - 例 `claude-cli:opus@high`、`codex-cli@medium`、
    `product-cpu:cpu-v4:level_5`
- カタログ公開は claude-cli / anthropic-api / codex-cli / product-cpu /
  baseline。**takeshi は既にカタログ外**（free-form spec でのみ到達可能）
- product CPU はコミットピン（`LAPLACE_PRODUCT_COMMIT` = `d316b30`）で固定

**実データの現状**
- `community/runs/` には `example--baselines` が1本だけ
  （`takeshi` vs `center-greedy`、4局）。**外部からの提出は一度もない**

### 2.2 laplace-main 側

**進行中の他エージェント作業（触らない）**
- ブランチ `agent/cpu-lv6-search-width-dev`、`origin/dev` より2コミット先行
- `6386ffc` cpu-v5 tactical candidate reserve を registered-inactive で着地
- `6a347f3` 探索幅ラダーの実験ラボ
- `ai/evaluation/lab/results/phase1-width-ladder.json` に未コミット変更 =
  **実行中**

**community standings 表示（`web/src/components/bench/CommunityStandings.tsx`）**
- laplacebench の raw URL を**クライアント fetch**
- `schema` 文字列と全フィールドを**厳格検証**。1つでも不一致なら
  `parsePayload` が null → セクション非表示（fail-soft）
- **帰結: laplacebench 側でスキーマを上げると、製品側を更新するまで
  セクションが静かに消える**

**再利用できる資産**
- `web/src/components/bench/presentation.ts` の `presentAgent` が**既に
  harness / model / effort をパースして「表示名」と「文脈」に分解**して
  いる（`claude-cli` → "Claude CLI"、`@medium` → "思考: 中"）。
  対戦見出しの階層化はこの上に乗る
- `web/src/components/bench/BenchMatchupBanner.tsx` が既にある

**リプレイビューア（`web/src/app/bench/replay/`）**
- **既に存在し、`?src=` クエリパラメータを受ける**
- ただし `src` は `/bench/<name>.json` という**内部パスのみ**を正規表現で
  許可。データは `web/public/bench/*.json` に静的同梱、`index.json` が
  マニフェスト
- **帰結: 現状のリプレイ公開は製品の再デプロイが必要**

---

## 3. 決まったこと（設計判断とその理由）

### D1. ランキングをやめ、対戦記録にする

**判断**: エージェント単位の順位表を廃止し、**対戦（matchup）単位の記録**
を主データにする。

**理由**:
- 現行ランキングは壊れている（§2.1）
- 正しいレーティング（Bradley-Terry 等）を出すにはデータ密度が全く足り
  ない。n=4 で順位は主張できない
- **直接対戦記録は n=4 でも嘘をつかない唯一の形式**。「Codex 対 Fable、
  7勝3敗2分」は何局だろうと事実そのもの
- **副次効果が大きい**: 順位がなければ吊り上げる対象が消える。
  多重アカウント・レーティング農場の問題がほぼ丸ごと蒸発し、自動マージ
  のゲートもスパム対策だけで済む

**検討して棄却した案**: アンカー相手との対局だけを集計対象に絞る案。
**フロンティア同士（Codex 対 Fable）が最も見たいものであり、かつ情報量
も最大**なので、それを外すのは本末転倒。「どの対局を数えるかを制限する」
のではなく「1勝の重みを変える」方向を一度検討したが、そもそも順位を
出さないなら重み付け自体が不要になった。

### D2. ペア爆発は「行列を描かない」ことで回避する

- カタログ上の組み合わせは30前後 → 総当たり行列なら435セルで表示不能
- しかし**行列は描かず、実際に行われた対戦だけを並べる**。空セルは存在
  しないので件数は「投稿された対戦の種類数」に等しい
- 人の関心は偏るので実際には上位20程度に集中する

### D3. 識別子の階層で畳む

見出しは**モデル単位**、展開すると**エフォート・ハーネス別の内訳**。

```
Codex  vs  Claude Opus                          24局
  ├ codex-cli@high    vs  claude-cli:opus@high      12局  6-4-2
  ├ codex-cli@medium  vs  claude-cli:opus@high       8局  2-5-1
  └ codex-cli@high    vs  claude-cli:opus@xhigh      4局  2-1-1
```

spec 文字列が構造化されているのでパースだけで実現でき、新しいデータ
モデルは不要。

**守るべき線**: 束ねた数字は「記録」であって「主張」ではない。内訳の
構成比が偏ると見出しが誤解を生むので、**内訳は畳んだ状態でも常に見える
形にする**（展開必須にしない）。数を隠さなければ嘘にはならない。

**ハーネスの畳み方（2026-07-25 決定）**: **通常ハーネスは見出しで畳む。
学習ハーネスは畳まない。**

- `claude-cli`（サブスクCLI経由）と `anthropic-api`（API直）は見出しでは
  同じ「Claude Opus」に畳む。根拠: **同じモデル・同じエフォートなら基本的に
  同じように動作するはず**であり、見出しの可読性を優先する。条件差は内訳行
  に常に残るので情報は失われない
- **`claude-cli-learn`（学習ハーネス）も畳む。例外を作らない**
  （2026-07-25 人間裁定 correction `363555d9`。当初は「対局をまたいで状態を
  持ち越すので別エージェント」としたが撤回）。撤回理由: **学習ハーネスは
  単体の存在ではなくハーネスの一部**であり、主たる表示のベースラインは
  ハーネスなしのモデル。現在 laplace-main の UI で学習ハーネスが単体として
  フィーチャーされてしまっているのは、比較実験のために一度回したものが
  そのまま前面に出た結果であって、意図した姿ではない
- **帰結**: `fable-low-learn-vs-cold` のようなハーネス比較対戦は、両側が
  同一見出し（同一モデル・同一エフォート）に畳まれる**自己対戦**になるため
  **公開一覧から除外**される。生ログは `community/runs` に残るので情報は
  失われない
- **繰り延べ**: ハーネス比較の適切な見せ方、学習ハーネス専用コードの整理、
  UI 上の単体フィーチャーの是正は、**汎用ハーネスを扱えるようにする後続
  スライス**でまとめて設計する。本スライスで守るのは「学習ハーネス専用の
  分岐を新設しない」ことだけ

### D4. 並び順は対局数の多い順

- コミュニティの関心がそのまま並び順になる（誰も設計しなくていい）
- **操作しても意味がない**。上に行くには実際に多く回すしかなく、それは
  「よく試されたペア」という主張と完全に一致する
- 同点時は最終対局の新しい順。新しい対戦が埋もれる問題は「最近の対局」
  を別枠で少数出して解決

### D5. エージェント単位の通算成績は消す

残すと結局それが順位表として読まれる。残す場合も**名前順**（勝敗で
ソートしない）で、対局数と対戦相手へのリンクのみ。`err_per_turn`
（指し手の妥当性）は別軸の情報なので保持する価値がある。

### D6. 参加者と相手のスコープ

- **参加側（人が動かす）**: 今は `claude-cli` と `codex-cli` の2プロバイダ。
  将来プロバイダを追加できる形にする（`catalog.ts` の `providers` 配列が
  既に拡張点）
- **相手側（こちらが出す基準相手）**: `product-cpu:cpu-v4:level_1..5`
- **公開対戦一覧に載る条件**: 少なくとも片側が LLM エージェントであること。
  baseline 同士（random / greedy / center-greedy）は動作確認用として残すが
  公開対象外

### D7. product CPU のバージョンは識別子の一部（ピンを上げない）

laplace-main で cpu-v5 / lv6 の作業が進んでいるが、**コミットピンは
上げない**。

- 識別子に既に `cpu-v4` が入っているので、v5 が出たら
  `product-cpu:cpu-v5:level_N` という**別のエージェント**として増えるだけ
- ピンを上げると同じ名前で中身が別物になり、**過去の記録が意味を失う**
- 対戦一覧に列が増えるだけで、既存記録は壊れない

### D8. 人はマージ経路から降りる（自動マージ）

**人間のマージが実際に捕まえられるものを数えた結果**:
- 偽ラベル → 捕まえられない（原理的限界、マージの有無と無関係）
- **PR が `community/runs/` の外を触る** → 実在する脅威だが、**パス
  allowlist で決定論的に置換可能**
- スパム・不快な文字列 → ほぼ機械化可能
- 多重アカウント水増し → 人間のマージでは止まらない（かつ D1 で動機が消滅）

**帰結: 人が門番である必然性がない。例外処理係になる。**

**機械ゲートの4条件**（全部通れば自動マージ）:
1. `community/runs/<新規1ディレクトリ>/**` 以外を1バイトも触っていない
2. ディレクトリ名の接頭辞 = PR 作成者の GitHub ログイン（身元確認では
   なく**帰属**。多重アカウントにアカウント作成コストを課す）
3. 追加された run のみリプレイ検証（全件ではなく差分）
4. アカウント単位のレート制限

**技術的必須事項**: fork からの PR はワークフロー定義ごと書き換えられる。
**ブランチ保護の required status check** にして「そのチェックが報告され
ない限りマージ不可」とする（ワークフローを消す PR は永久に pending）。

### D9. standings を提出物から外す

現行は提出者が集計を再生成してコミットする設計。理由は「PR の diff に
順位変動が見える」という価値だった（`docs/plans/2026-07-25-standings-json.md`
の direction 判断）。

**この前提が消える**: 自動マージにすれば diff を読む人はいない。一方
コストは volume に比例して爆発する（誰かの PR がマージされるたび、進行中
の全 PR の集計が陳腐化して CI が落ちる）。

**変更**: 集計は**マージ後に CI が生成して main へ push** する成果物にする。
- 衝突が構造的に消える（生ログは追加のみ、集計は1箇所が生成）
- **提出者の手順から再生成コマンドが丸ごと消える**
- laplace.zone の読み先（raw URL）は変わらない

**これは過去の direction 判断を明示的に覆す変更**。理由は「前提だった
人間レビューが無くなるから」。

### D10. 虚偽ラベルは受け入れる

- **普通に CLI を使う限り誤ラベルは起きない**。spec 文字列は人が入力する
  ものではなく、ランナーが「実際に何を呼んだか」から生成する。自動提出に
  すれば正常な経路で人がファイルに触らない
- 起こりうるのは**提出前の意図的な改竄**のみ。リプレイ検証は「手が合法で
  結果が整合」しか証明しないので検出できない
- **技術的に閉じない**: CLI はユーザーの手元で動くので、本物に署名できる
  鍵は偽物にも署名できる。手の並びからモデルを推定する方向も精度が出ない
- 「ラベルは自己申告」と明記して受け入れる。D1 により**嘘をつく動機自体
  がほぼ消えている**（順位が上がるわけでもなく、記録に1行増えるだけ）
- 将来 official ✓ レーンを作るなら、それが唯一の「ラベルが保証された区画」
  という位置づけになる

---

## 4. 全体フロー（確定版）

```
1. 人がターミナルで   npx laplacebench play
                     → プロバイダ・モデル・エフォートを選ぶ
                     → 「終わったら自動提出する？」を1回だけ聞く

2. 対局が走る         Claude / Codex  vs  product-cpu:level_N（または相手も LLM）

3. 終了と同時に自動   ローカルで verify（不正なら止まる）
                     → community/runs/<gh名>--<run-id> へ
                     → fork へ push → PR 作成

4. CI が機械ゲート    D8 の4条件。全部通れば自動マージ。
                     落ちたら人間のキューへ

5. マージ後に CI が   対戦記録データを再生成して main へ push（D9）
                     提出者は集計に一切触らない

6. laplace.zone/bench が raw URL を読んで表示
                     見出し = モデル単位の対戦（対局数の多い順）
                     展開 = エフォート・ハーネス別の内訳

7. ターミナルには2行  ▸ リプレイ URL（PR head を指すので即時）
                     ▸ PR URL（自動マージなので通常は数分で main 入り）
```

**人が触るのは 1 だけ。オーナーが触るのは 4 で落ちたものだけ。**

**リプレイが即時で順位が後回しな理由**: リプレイはただのログビューアで、
検証はクライアント側で凍結エンジンに流せば済むのでマージを待つ理由がない。
一方、集計は公開台帳なのでリプレイ検証とマージを通す必要がある。
未マージの間は「この対局はまだ台帳に未反映（PR #N 審査中）」と表示して、
集計に混ざっていないことを画面で担保する。

---

## 5. 未決の論点

1. ~~ハーネスを見出しで畳むか~~ → **2026-07-25 決定済み。D3 参照**
   （通常ハーネスは畳む / 学習ハーネスは別エージェント）
2. **`community/runs/example--baselines` の差し替え先**。CI が空ディレクトリ
   で fail するので単純削除は不可。実際の Claude または Codex vs product-cpu
   の run を録って差し替える必要がある
3. **`commentary-demo` の扱い**（§6）
4. **レート制限の具体値**（アカウントあたり何件 / 何分）
5. **takeshi 実装コードの去就**（§7）

---

## 6. データの取捨（`laplace-main/web/public/bench/`）

前提2により、価値のあるものだけ残す。参照は `index.json` 駆動で、
**コード内のハードコード参照は無い**（`grep` 確認済み）ので、
`index.json` と対象ファイルを消すだけで済む。

### 残す — フロンティア同士（Codex 対 Fable）

| ファイル | 対戦 | 結果 |
|---|---|---|
| `flagship-fable-codex-v2--game-000` | Fable 5 @medium vs GPT-5.6 Sol @medium | A勝 center 9手 |
| `flagship-fable-codex-v2--game-001` | GPT-5.6 Sol @medium vs Fable 5 @medium | B勝 center 28手 |
| `fable-vs-codex56-medium--game-000` | Fable 5 @medium vs GPT-5.6 Sol @medium | A勝 elimination 43手 |
| `fable-vs-codex56-medium-swap--game-000` | GPT-5.6 Sol @medium vs Fable 5 @medium | B勝 center 20手 |

計4局。先後入れ替えペアになっており、まさに D1 で「最も見たいもの」と
した内容。

### 前面から下げる — 学習ハーネス比較

| ファイル | 対戦 |
|---|---|
| `fable-low-learn-vs-cold--game-000..003` + `--learning.json` | 学習ハーネス vs 素の CLI（同一モデル・同一エフォート） |

同じモデルでハーネスだけを変えた対照実験。データとしての価値はあるので
削除しない。ただし **2026-07-25 人間裁定 correction `363555d9`** により、
**単体としてフィーチャーする現状の扱いはやめる**。比較のために一度回した
ものが前面に出てしまっている状態であって、意図した姿ではない。主たる表示の
ベースラインはハーネスなしのモデル。

適切な露出の仕方は**汎用ハーネスを扱えるようにする後続スライス**で決める。
それまでは前面に出さない扱い。

### 削除 — takeshi 戦

| ファイル | 対戦 | 備考 |
|---|---|---|
| `commentary-demo--game-000` | Sonnet @low vs takeshi-d2 | **唯一 commentary を持つ**（`bench.commentary` に4件） |
| `smoke-codex--game-000` | Codex default vs takeshi | 6手 horizon draw、明らかにスモークテスト |
| `validate-claude-cli--game-000` | Sonnet vs takeshi-d2 | 検証用 run |

**注意**: `commentary-demo` を消すと、**`BenchCommentary` 機能の唯一の
サンプルデータが無くなる**。残す4局はいずれも commentary を持たない。
機能を残すなら、Fable / Codex 戦で commentary 付きを1本録り直す必要がある。
→ §5-3 の未決事項。

### 削除（推奨） — baseline 戦

| ファイル | 対戦 |
|---|---|
| `fable-vs-centergreedy--game-000` | Fable 5 @medium vs center-greedy |
| `codex56-vs-centergreedy--game-000` | GPT-5.6 Sol @medium vs center-greedy |

D6 により baseline は基準相手ではなくなった（基準は product-cpu）ので
レガシー。害はないが価値も低い。

### laplacebench 側

- `community/runs/example--baselines`（takeshi vs center-greedy、4局）→
  差し替え（§5-2）

---

## 7. takeshi の扱い

**調査結果: takeshi は既にウィザードのカタログに載っていない**。free-form
spec 文字列としてしか到達できない。「公開ラインナップから外す」は実質完了
している。

残っているのは3つで扱いが異なる:

1. **`community/runs/example--baselines`** → 差し替え（§6）
2. **`packages/cli/src/agents/takeshi.ts`** → **削除しないことを推奨**。
   消すと `docs/anchor-ladder-v1.md` と `anchor-ladder-v2.md` の接続部分
   （`takeshi:d2` vs `level_1` / `level_5`）が**再現不能な主張**になる。
   product-cpu のレベルが現在の基準として立っているのは、この測定を経由
   しているため。free-form spec として残せば履歴は検証可能なまま、公開の
   場には一切出ない
3. **docs 各所の言及** → 過去の測定記録なのでそのまま。ただし「現行の
   ラインナップ」と読める箇所は履歴だと分かる書き方に直す

**要するに「公開ラインナップからの引退」であって「コードの削除」ではない。**

---

## 8. スケールの物理（将来の制約）

- **CI が PR ごとに全 run を再検証している**（`verify community/runs/*/`）。
  run が1000本になれば PR 1本に数分〜数十分。→ **差分検証 + 夜間に全件
  再検証**へ分ける（D8-3 に含む）
- **リポジトリ肥大**（1対局 = 全手のログ）は数千本オーダーの問題。
  今日の課題ではないが、いずれ保存戦略が要る

---

## 9. 作業の分割と依存

| # | リポジトリ | 内容 | 依存 |
|---|---|---|---|
| 1 | laplacebench | 集計を対戦記録へ（schema v2）+ 生成をマージ後 CI へ（D1〜D6, D9） | — |
| 2 | laplace-main | standings 表示を v1/v2 両対応 → 対戦一覧 UI へ | **1 より先に v2 対応** |
| 3 | laplacebench | 自動マージの機械ゲート（D8） | 1 |
| 4 | 両方 | `submit` / 自動提出 + リプレイ URL（`src` の外部許可） | 2, 3 |

### スキーマ切り替えの安全な順序（重要）

`CommunityStandings.tsx` は厳格検証 + fail-soft なので、**順序を間違えると
数時間セクションが消える**:

1. 製品側を先に **v1 / v2 両対応**にして deploy
2. laplacebench 側を v2 へ切り替え
3. 製品側から v1 対応を落とす（任意）

### 衛生

laplace-main 側は lv6 の作業中ブランチがあるため、**別ブランチを切って
dev へ PR**。`ai/` 配下には触らない。

---

## 10. 参照

- `packages/cli/src/standings.ts` — 現行集計（欠陥は §2.1）
- `packages/cli/src/catalog.ts` — エージェント識別子の構造
- `.github/workflows/community-verify.yml` — 現行 CI ゲート
- `docs/plans/2026-07-25-standings-json.md` — D9 が覆す元の direction 判断
- `docs/anchor-ladder-v1.md` / `v2.md` — product-cpu レベルの実測と takeshi 接続
- `docs/public-platform-strategy-ja.md` — 誠実さの原則、✓ verified の表現方針
- `laplace-main/web/src/components/bench/CommunityStandings.tsx` — 表示側の厳格検証
- `laplace-main/web/src/components/bench/presentation.ts` — 識別子パースの既存資産
- `laplace-main/web/src/app/bench/replay/page.tsx` — `?src=` の現行制約
