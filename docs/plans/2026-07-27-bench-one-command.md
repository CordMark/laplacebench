---
status: implemented
direction: direction-bench-one-command
owner: bench
risk_tier: standard
last_updated: 2026-07-27
---

# 対局の入口を `play` 一本にする

## Tier: standard（plan review で確定）

npm 公開済み（`laplacebench` 0.1.1）の CLI コマンド面を変えるので外部契約に触るが、
重量基準には当たらない見込み:

- `arena` は**削除せず alias として残す**ので、既存スクリプトは動き続ける
  （非推奨警告が出るだけ）。破壊的変更を今は入れない
- ゲームルール・レフェリー・凍結ルールセット・公開 payload・集計はいずれも無変更
- 認可 / identity trust / 金銭 / 不可逆 migration / cutover なし
- 提出の既定は変えない（非対話でも明示フラグが要る）

検証構成: 方向づけ対話（完了・ACCEPT、event `7a1c6291`）→ 本プラン →
`/codex-plan-review` → `/codex-impl-review`（6項目弁明同梱）。

## Direction Brief

1. **Purpose** — 対局を回す入口を1つにする。今は人間向けの `play` と自動化向けの
   `arena` に分かれ、**提出の存在が `play` 側にしか無い**。実際にその割れ目で
   「自動提出されると思っていたのに提出されていない」が起きた（`arena` で対局を
   回した側で発生）。

2. **Concept owner** — 対局の起動と引数解決の正本は `packages/cli/src/wizard.ts`
   の `runPlay` に移る。`arena()` 関数は実行本体として残り、`runPlay` が呼ぶ
   （現在も内部でそうしている）。**新しい実行経路は作らない。**

3. **Lifecycle and scope** — laplacebench の CLI とドキュメントのみ。製品側は無関係。
   CI は `arena` を使っていない（使うのは別コマンドの `public-arena`）ので影響なし。

4. **Value hierarchy** — 出す数字の正直さ（再現可能性込み）> 入口の分かりやすさ >
   コマンド面の小ささ。今回は第1位が「alias を即削除しない」を要求し、第2位が
   「入口を1つにする」を要求する。

5. **Adopted direction** —
   - **`play` 一本化。** `play` がフラグを受けて非対話でも動く。フラグが揃って
     いれば TTY 無しで走り、足りない分は TTY があれば対話で聞く。TTY が無く
     フラグも足りなければ、何が足りないかを言って落ちる。
   - **非対話で提出は絶対に既定にしない。** ウィザードの原則
     "Publishing is on the player's account, so it is never the default" を維持し、
     非対話では明示フラグ（`--submit`）を要求する。
   - **非対話終了時に提出状態を必ず出力する。** 提出したのか、していないなら次に
     何をすればよいのか（`laplacebench submit runs/<id>`）を必ず出す。**これが
     今回の誤解の本体への対処**であり、原因は「経路が2つあること」より
     「提出について何も言わずに終わること」の側にある。対話側は「しない」を
     選んだ人へ既に手動手順を出しているので、その挙動を非対話へ広げるだけ。
   - **`arena` は alias として残す。** `--help` には出さず、実行時に非推奨と
     移行先を1行出す。**alias は現行 `arena` の既定値を適用してから委譲する**
     ので、`arena` の観測挙動は今日と1ミリも変わらない（下記「互換の正確な形」）。
     厳格なのは `play` だけ。
     **撤去条件は時期ではなく事象に紐付ける。** 判定可能にするため条件を厳密化する:
     **`docs/anchor-ladder-v1.md` と `v2.md` の両方**が、(i) `play` で新たに実行した
     コマンドを記載し、(ii) その実行で得た測定値へ更新されている、を満たしたときに
     alias を落とす。片方だけでは落とさない（v1 の記録が孤立して偽になるため）。
     この条件は **alias のすぐ横のコメントに書き、両文書を名指しする**ので、
     alias を触る人が必ず目にする。撤去判断に人の気分を入れない。
     **棄却した代案**: 即削除（anchor-ladder の再現手順が動かない文書になる。
     takeshi.ts を「測定が再現不能な主張になるため削除しない」とした前例と同型）、
     恒久 alias（「入口を1つにする」目的と恒久的に矛盾する第二の名前が残る）。

6. **What disappears / is not protected** —
   - **`arena` という見える名前。** `--help` から消え、README からも消える。
     動きはするが「推奨される入口」ではなくなる。
   - **`play` の TTY 拒否メッセージ**（現在 `arena` を案内している）。非対話でも
     動くようになるので不要になる。
   - **anchor-ladder 文書の「現行コマンド」としての地位**（守らない）。ただし
     黙って書き換えない: 実行していないコマンドを実行したと書かないため、
     **当時 `arena` / 現在は `play` に統合**を併記する。
   - **コマンド面の小ささ**（守らない）。`play` のヘルプが対話・非対話の両モードを
     説明することになり、単体では重くなる。入口が1つであることの価値を上に置く。

## 非対話 `play` の入力契約（実装が推測せずに済む形）

**必須**（欠けたら対局を開始せず、欠けている名前を挙げて終了コード非0）:

- `--team-a`, `--team-b`

**任意・既定あり**（`--seed` を除き現行 `arena` と同一。`--seed` の意図的な差は後述）:

| フラグ | 既定 |
|---|---|
| `--games` | 2 |
| `--swap` | 付けなければ off |
| `--seed` | 乱数。**採用値を必ず出力**し、`run.json` に記録される（再現可能性のため） |
| `--max-plies` / `--output-token-budget` / `--turn-timeout-ms` | 現行の正準既定 |
| `--run-id` | 現行の生成規則 |
| `--submit` | 付けなければ提出しない |

**条件付き（team spec が `product-cpu:` のときのみ意味を持つ）**:
`--product-repo` / `--product-commit`。いずれも環境変数
`LAPLACE_PRODUCT_REPO` / `LAPLACE_PRODUCT_COMMIT` をフォールバックとして受ける
（現行 `resolveMatchResources` と同じ）。**認可された引数一覧に必ず含める** —
含め忘れると「未知フラグはエラー」と「product-cpu の値は引数からも受ける」が
衝突し、認証契約が要求する引数を実装が拒否することになる。

**`--seed` だけは `arena` と既定が違う（意図的）**: `arena` の既定は 42 のまま
維持する（互換）。`play` は乱数を選び、**採用値を必ず出力**する。固定既定 42 は
「同じコマンドを2回打つと同じ対局になる」ことに気づきにくく、対話版が既に乱数を
提示しているので、そちらへ揃える。

### フラグ構文の検証（既存パーサの落とし穴を塞ぐ）

現行 `parseArgs` は `--x` の次が無い / 次も `--` 始まりなら **`true`（真偽値）**を、
それ以外なら**文字列**を入れる。素直に使うと次の事故が起きる:

- `--team-a`（値なし）→ `true`。文字列として扱うと `"true"` という spec で走り出す
- `--submit false` → 文字列 `"false"` は**真値**。**提出しないつもりが提出される**
- `--swap false` → 同上で swap が有効になる

したがって値検証を実行前に行う:

- **値を取るフラグ**（`--team-a` `--team-b` `--games` `--seed` `--max-plies`
  `--output-token-budget` `--turn-timeout-ms` `--run-id` `--product-repo`
  `--product-commit`）は**値必須**。`true`（値なし）で来たらエラー
- **`--swap` と `--submit` は presence-only の真偽値**。値を伴って来たら
  （`--submit false` を含め）**エラー**にする。真偽リテラルは受け付けない
- 未知フラグはエラー
- 整数フラグは対話版と同じ述語を共有して検証（二重実装しない）
- **これらの検証は認証チェックより前・対局開始より前**に行う

**認証・プロバイダ要件は headless では絶対に prompt しない。** 現行 `authGate` は
CLI 不在時にループして再チェックを促し、product-cpu の repo/commit を対話で聞く。
非対話ではこれを**1回の判定に落とし**、不足（CLI 不在、必要な環境変数未設定、
product-cpu の repo/commit が引数にも環境変数にも無い）があれば**その全部を列挙して
即失敗**する。対局は開始しない。

## 互換の正確な形（`arena` は今日と同じ挙動）

`arena` の観測挙動を変えないため、alias は**委譲前に現行の既定値を適用する**:
`--team-a` 未指定→`random`、`--team-b` 未指定→`takeshi`、`--games`→2、`--seed`→42。
つまり `laplacebench arena`（引数ゼロ）は今日どおり random 対 takeshi を2局走らせる。
**厳格化は `play` にだけ入り、`arena` には入らない。** これがないと
「既存スクリプトは動き続ける」という tier 弁明が成立しない。

## 変更インベントリ

| ファイル | 変更 |
|---|---|
| `packages/cli/src/wizard.ts` | `runPlay` が CLI 引数を受ける。揃っている値は対話を飛ばし、足りない分だけ TTY があれば聞く。TTY 無し・引数不足なら**何が足りないかを名指しして落ちる（対局は開始しない）**。`--submit` が無い非対話では提出しない。**終了時に提出状態を必ず出力**する（対話・非対話の両方）。`submissionGuidance` を `laplacebench submit runs/<id>` を第一手に書き直す（後述） |
| `packages/cli/src/cli.ts` | `play` に `args` を渡す。`arena` は同じ経路へ委譲する**非推奨 alias** にし、実行時に1行警告。usage から `arena` 行を落とし、`play` のフラグを記載 |
| `README.md` | Quickstart の先頭を `play` に。`arena` の例を置き換える（`play` は0回出現という現状 drift の解消） |
| `packages/cli/README.md` | 既に play 先頭。フラグ例を新しい形へ揃える |
| `docs/anchor-ladder-v1.md` / `v2.md` | 記録コマンドは**書き換えず**、「当時は `arena`、現在は `play` に統合。alias が生きている間は記載どおり再現できる」の注記を足す |
| `community/README.md` | 提出手順の第一手を `laplacebench submit runs/<id>` に。現在は `cp -R` + PR の手動手順しか書いておらず、`submissionGuidance` だけ直すとリンク先の公式案内と食い違う |
| `packages/cli/test/wizard.test.ts` | 下記 |

### `submissionGuidance` の是正（直接関連する残骸）

現在この案内は `cp -R runs/<id> community/runs/<github名>--<id>` と PR 作成という
**手動手順しか教えず、`laplacebench submit` に一言も触れていない**。本スライスの
主眼は「提出しなかったときに次の一手を示すこと」なので、その文言が実在する
1コマンド経路を隠しているのは残せない。`submit` を第一手にし、手動手順は
フォールバックとして残す。

## テスト

`wizard.test.ts` は既に注入可能な IO を持つので同じ harness で書ける。

- 引数完備 + TTY 無し → 対話ゼロで対局が走り、**提出されない**、かつ「提出して
  いない」ことと**次に打つ正確なコマンド** `laplacebench submit runs/<id>` が
  出力される。3つの完了状態（未提出／提出成功／提出失敗）すべてを出力で固定し、
  「提出状態を必ず言う」という本スライスの本体が黙って壊れないようにする
- 引数完備 + `--submit` + TTY 無し → `submitRun` が呼ばれ、**成功した旨の完了
  メッセージが出る**
- `--submit` 付きで提出が失敗 → 失敗を告げ、手動フォールバック案内が出る
  （対話側の既存挙動と同じ形）
- **引数不足 + TTY 無し → 不足項目を名指しして失敗し、`runArena` は呼ばれない**
  （中途半端に既定値で走り出さないこと。現行 `arena` は `--team-a` 省略で
  `random` に落ちるので、この暗黙の既定を非対話 `play` へ持ち込まない）
- 引数一部 + TTY あり → 足りない分だけ聞く
- **`arena` 互換の回帰**: 引数ゼロの `arena` が今日どおり random 対 takeshi を
  2局走らせること、`--team-a` だけ / `--seed` だけ など個別に省略しても既定が
  効くこと、いずれでも非推奨警告が出ること
- 非対話で認証・product-cpu 要件が欠けている → **prompt せず**、不足を全部
  列挙して失敗し、`runArena` は呼ばれない
- `--product-repo` / `--product-commit` が**引数で**渡された場合と**環境変数で**
  渡された場合の両方が通ること
- **フラグ構文**: `--team-a`（値なし）はエラー／**`--submit false` はエラーで、
  かつ提出されない**（真値文字列で提出されてしまう事故の回帰）／`--swap false`
  もエラー／未知フラグはエラー。いずれも `runArena` は呼ばれない
- 既存の対話フローのテストが無改変で通ること（回帰）

## 検証

1. `npm run build && npm test`
2. **実バイナリの headless 実行**: `node packages/cli/dist/cli.js play --team-a random
   --team-b takeshi --games 1 --seed 7` を TTY 無しで走らせ、対局が完了し提出状態が
   出力されることを確認する。baseline 同士なので LLM コストゼロ・数秒
3. `arena` alias が同じ引数で従来どおり動き、警告を出すこと
4. anchor-ladder 文書の記録コマンドを1本そのまま実行し、alias 経由で通ること
   （記録が真であることの実測）

## ロールバック

`arena` を alias にしただけで削除していないので、実装を revert すれば利用者側の
見え方は完全に元へ戻る。公開済み成果物・台帳・集計はいずれも触らない。
