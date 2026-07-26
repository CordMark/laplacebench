---
status: implemented
direction: direction-bench-effort-identity
owner: bench
risk_tier: heavy
last_updated: 2026-07-27
---

# 見出し identity に effort を含める — 公開アリーナの粒度

## Tier: heavy

当初 standard としたが、plan review の指摘を受けて**重量へ昇格**する。本
スライスは公開成果物 `laplace-bench-arena-v1` の `id` / `label` /
`public_agent_count` / matchup id の**意味**を、スキーマ版を上げずに変える。
CLAUDE.md の「外部契約を変更する」に該当し、迷ったら上の階層に倒す規則に従う。
本スライスを生んだ human correction `d1ff0bf8` 自身が `high_risk: true` で
記録されている点とも整合する。

昇格の決め手は、当初の standard 弁明が**この checkout の中では検証不能**
だったこと。「消費者に粒度依存がない」という主張の根拠は別リポジトリ
（laplace-main）にあり、レビュアーからは確認できない。よって「消費者側の
受け入れ」を口頭の主張ではなく**再現可能な検証手順**（下記 検証 3）へ格上げし、
impl checkpoint の尋問でその実測結果を裁定対象にする。

該当しない重量基準（記録として）: 認可 enforcement / identity trust（ここでの
「identity」は表示上のグルーピングキーであって認証主体ではない）、金銭計算、
不可逆 migration、cutover。台帳の正本 `community/runs/*` は無変更で、変わるのは
publication ごとに再生成される派生集計のみ。

検証構成: 方向づけ対話（完了・ACCEPT）→ 本プラン → `/codex-plan-review` →
**`/interrogation`（impl checkpoint）** → `/codex-impl-review`。

## Direction Brief

1. **Purpose** — 公開アリーナの見出しが、記録されたデータより強い主張を
   しないようにする。現在の見出しは「Opus 5 対 GPT-5.6 Sol」だが、実際に
   戦ったのは `claude-cli:claude-opus-5@high` と `codex-cli:gpt-5.6-sol@high`
   で、effort は展開後の内訳行にしか現れない。effort が違えば別物として
   振る舞う以上、これは「Opus 5 が GPT-5.6 Sol に勝った」という過剰主張。

2. **Concept owner** — エージェント識別子の意味論（`harness:model@effort`）の
   正本は `packages/cli/src/catalog.ts`。見出し identity の導出は
   `headlineKey()` 単独が正本であり続ける（分岐を増やして第二の所有者を作らない）。
   公開ラベルの合成も同ファイルに置き、`publicarena.ts` はそれを呼ぶだけにする。

3. **Lifecycle and scope** — laplacebench 側のみ。laplace-main は**1行も
   変更しない**。当初案にあった「製品側で閉じたカードに effort を出す」項目は、
   ラベル合成の副産物として不要になった（`matchup.left.label` をそのまま
   描画しているため）。スキーマ版は `laplace-bench-arena-v1` のまま上げない。

4. **Value hierarchy** — 出す数字の正直さ（n が小さくても嘘をつかない形式）>
   見出しの可読性 > 一覧の行数の少なさ。community-lane-v2 の価値序列を継承し、
   今回はその第1位が第2位を明示的に上回る局面。

5. **Adopted direction** —
   - **`headlineKey()` を model 単位から model + effort 単位へ変える。**
     ハーネスの畳み込みは維持する（`claude-cli` / `anthropic` /
     `claude-cli-learn` を区別しない）。理由: 「同一モデル・同一エフォートなら
     経路が違っても同じ挙動を期待する」という既存の論拠は、effort を固定した
     時点でそのまま生きているため。2026-07-25 の human correction `363555d9`
     （学習ハーネスを別建てにしない）も維持される。
     **棄却した代案**: 完全 agent spec を identity にする案（ハーネスまで割ると
     n がさらに薄くなり、学習ハーネスが自動的に単体で見出しに立って
     `363555d9` を再反転してしまう）。
     **実務上の帰結（明示しておく）**: 素の Anthropic API アダプターは effort を
     記録しない（`agents/llm.ts:27` の記録形は `anthropic:<model>`）。したがって
     「ハーネスは畳む」は、**同一 effort が記録されている場合にのみ実際に畳む**。
     API 経由の対局は CLI の `@high` とは別 identity になる。これは effort を
     identity にした以上避けられない帰結であり、隠さずに受け入れる。API 側にも
     effort 相当を記録させるかは本スライスの範囲外。
   - **ラベルは合成にする。** `PUBLIC_HEADLINE_LABELS` は「厳密な headline
     identity → ラベル」の表で、キーに effort が入ると全モデル × 全 effort の
     行が要る。モデル部分のラベル引きと effort 表記の合成へ変える
     （例: `Opus 5 (high)`）。表そのものはモデル部分のキーとして残す。
   - **effort は「あれば付く」。新しい未知トークンは作らない。** identity は
     `model` に、spec が effort を持つときだけ `@effort` を付けたもの。
     したがって effort 未指定 spec（`anthropic:claude-opus-5` → `claude-opus-5`）
     は `@high` 付きの identity とは自然に別物になり、「不明」を表す特別な
     トークンを id へ持ち込む必要がない。effort という軸を持たないハーネス
     （`product-cpu:cpu-v4:level_5` → `cpu-v4:level_5`）と opaque spec
     （`takeshi:d2`）は**今日と同一の identity のまま**であり、それらに
     「effort 未指定」と書かない。
   - **不明を隠さないのはラベル側で行う。** LLM 見出し（`kind === "llm"`、
     `participant()` が既に算出している）で effort が付いていない場合に限り、
     ラベルへ effort が記録されていない旨を付す。**これは今日の公開表示を
     1行も変えない将来向けの規約**である:
     公開対象 `community/runs/*` に実在する spec は
     `claude-cli:claude-opus-5@high` / `codex-cli:gpt-5.6-sol@high` /
     `center-greedy` / `takeshi` の4つのみで、effort 未指定の LLM spec も
     モデル名未記録 spec も存在しない。
   - **モデル名未記録 spec も effort で割る。** `codex-cli:default@medium` は
     現在ハーネス単位（`codex-cli`）へ落として「その effort 同士を畳む」と
     `headlineKey` のコメントが明示しているが、これをやめて
     `codex-cli@medium` / `codex-cli@high` を別 identity にする。
   - **自己対戦の境界を identity と一致させる。** 「同一見出しに畳まれる自己
     対戦は公開一覧から除外」は維持するが、その「同一」が model + effort まで
     一致する場合を指すようになる。結果として `opus@high vs opus@low` は
     除外されず正規の対戦として公開される。これは副作用ではなく裁定の意図された
     帰結であり、「effort を上げると本当に強くなるのか」はこのベンチの主要な
     問いの一つ。

6. **What disappears / is not protected** —
   - **「モデル1つ = 見出し1つ」という可読性。** 同一モデルの effort 違いが
     一覧で別行に分かれる。明示的に順位を下げる。
   - **当初案の第3項（製品側で閉じたカードに effort を出す変更）。** 不要化に
     より消える。ただし「内訳は畳んだ状態でも常に見える」という
     community-lane-v2 の要件は、ラベル合成によって**満たされる側へ動く**。
   - **公開済み matchup id の安定性**（守らない）。
     `matchupId = sha256(left.id\0right.id)` なので identity が変われば id も
     変わる。製品は id を React の key と展開パネルの DOM id にしか使って
     おらず、リプレイ id（内容アドレス）と OG カードは無関係なので、実害の
     ない範囲として受け入れる。
   - **`public_agent_count` の従来の意味**（「モデル数」）。今後は
     「model + effort の異なり数」を指す。製品はこの値をカタログ内部の自己
     整合チェック（`participantMap.size` との一致）にしか使っていないため、
     粒度が何であれ自動的に成立する。
   - **スキーマ版を上げること**（やらない）。形状不変・消費者非依存が確認済み。

### 方向づけ対話で確認した根拠（受け入れ側は無変更で通る）

- `web/src/lib/bench/parseArenaCatalog.ts:19`
  `const HEADLINE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,127}$/;` — **`@` は既に
  許可**。`claude-opus-5@high` は製品を触らずにバリデーションを通る。
  bench 側 `packages/cli/src/publicarena-contract.ts:94` も同一。
- 製品側の消費は `matchup.id`（React key / DOM id）、`left.label` / `right.label`
  （そのまま描画）、`public_agent_count`（表示 + 自己整合チェック）、
  `headline_id`（自己整合チェック）のみ。粒度に依存する消費はゼロ。

## 変更インベントリ

| ファイル | 変更 |
|---|---|
| `packages/cli/src/catalog.ts` | `headlineKey()` を model+effort へ。ラベル合成関数を新設し `PUBLIC_HEADLINE_LABELS` はモデル部分のキー表として残す。`UNNAMED_MODEL` 分岐のコメント（「その effort 同士を畳む」）を新方針へ更新 |
| `packages/cli/src/publicarena.ts` | `participant()` のラベル導出を合成関数呼び出しへ差し替え。`assertHeadline` はそのまま（`@` 通過を確認済み） |
| `packages/cli/src/publicgames.ts` | コード変更なし。`publicPair` の自己対戦除外は `headlineKey` の結果で判定しているため、境界が自動的に新 identity へ追随する。doc コメントの「same-headline harness matches」文言のみ実態に合わせる |
| `packages/cli/src/standings.ts` | コード変更なし。`matchupData` / `matchupsJson` / `matchupsMarkdown` は `publicPair` 経由なので出力粒度が自動追随する。ローカル `matchups` コマンドの出力が変わることを確認する |
| `packages/cli/test/matchups.test.ts` | 既存期待値の更新（下表）＋新規ケース |
| `packages/cli/test/publicarena.test.ts` | 現行台帳から生成する id / label の期待値更新（下表） |
| `packages/cli/scripts/verify-product-acceptance.mjs` | **新規。** 外部消費者（laplace-main）の受け入れ実測。オンデマンド・非 CI（`packages/engine/scripts/verify-against-product.cjs` と同じ位置づけ）。手順は下記 検証 3 |

laplace-main 側の変更はなし（検証用のテストも追加しない。下記 検証 3 は
laplacebench 側から sibling checkout を読むだけ）。

### 更新が要る既存アサーション（棚卸し）

| 位置 | 現在 | 変更後 |
|---|---|---|
| `matchups.test.ts:47-70` | `matchupsJson` golden の `headline.left/right` = `claude-fable-5` / `gpt` | `claude-fable-5@medium` / `gpt@medium` |
| `matchups.test.ts:103-134` | テスト名「headline folds every harness onto the model」と `headlineKey` 期待値7件（106-118, 122, 133） | テスト名を effort 分割を含む表現へ。106/107 は `claude-opus-5@high` と `claude-opus-5`（未指定）で**別値**、110 は `claude-opus-5@high`、113 は `opus@high`、116/117 は `codex-cli@medium` / `codex-cli@high` で**別値**、118 は `codex-cli`、122・133 は不変 |
| `matchups.test.ts:170-191` | 「実際に記録される文字列が意図どおり畳まれる」テスト。`claudeCli`（`@medium`）/ `claudeCliLearn`（`@low`）/ `anthropicApi`（**effort なし**）の3つが `claude-fable-5` 1つに畳まれると主張 | **主張を2つに割る。** フィクスチャは実際の記録形（`agents/llm.ts:27` は effort を記録しない）なので変えない。(i) 同一モデル・同一 effort ならハーネスが違っても畳む、(ii) effort が違えば／未記録なら畳まない、を別々に検証する。`codexDefault` は `codex-cli@medium`、`codexNamed` は `gpt-5.6-sol@medium`、`productCpu` は `cpu-v4:level_5` で不変 |
| `matchups.test.ts:194-220` | 自己対戦除外テスト。206-210 の learn vs cli（同一モデル・同一 effort）が畳まれて除外され、`headline` = `claude-opus-5` / `cpu-v4:level_5` | 除外は**維持**（identity が model+effort まで一致するため。correction `363555d9` が守られる）。`headline.left` が `claude-opus-5@high` へ |
| `matchups.test.ts:164-167` | `headlineKey("codex-cli:@medium")` = `codex-cli` | `codex-cli@medium`。`parseAgentSpec` の期待値（164-166）は不変 |
| `matchups.test.ts:257-283` | 「total order」テスト。`claude-cli:claude-opus-5@high` と `anthropic:claude-opus-5` が**1つの見出しに畳まれる**前提で、2つの breakdown のタイブレークを検証している | 新規則ではこの2つは別 identity になり、見出しが2つに割れてテストの前提が崩れる。**畳まれる側のフィクスチャの effort を揃える**（`anthropic:claude-opus-5@high`）ことでテストの目的（同一見出し内の breakdown 全順序）を保存する。フィクスチャ変更であって主張の緩和ではない |
| `publicarena.test.ts:50-65` | 現行台帳の `left.id`/`right.id` = `claude-opus-5` / `gpt-5.6-sol`、label = `Opus 5` / `GPT-5.6 Sol` | id = `claude-opus-5@high` / `gpt-5.6-sol@high`、label = `Opus 5 (high)` / `GPT-5.6 Sol (high)`。決定性（`catalogBytes` 一致）と件数は不変 |
| `publicarena.test.ts:103-110` | 未知モデル見出し。`copyRunWithCodexModel` が `codex-cli:<model>@high` を作る一方、`item.id === model` で探して `label === model` を期待 | id は `<model>@high`、label は `<model> (high)`。探索キーと期待ラベルの両方を更新 |

新規に追加するケース:

- effort 違いが別 identity になる（`opus@high` ≠ `opus@low`）
- ハーネス違いが同一 identity のまま（`claude-cli` / `anthropic` /
  `claude-cli-learn` が同一モデル・同一 effort で1つ）— correction `363555d9`
  の pin
- `opus@high vs opus@low` が `publicPair` で**除外されない**（新しい境界）／
  完全同一 spec 同士は**除外される**（既存の境界）
- effort を持たない product-cpu / opaque spec の identity と label が不変
- LLM 見出しで effort 未記録のときだけラベルに未記録である旨が付く
- ラベル合成（既知モデル + effort、未知モデル + effort）

## 検証

1. `npm run build && npm test`（全 workspace）
2. 実データでの再生成: 既存 `community/runs/*` からアリーナ成果物を生成し、
   見出しが `Opus 5 (high)` / `GPT-5.6 Sol (high)` になること、
   `public_agent_count` が 2 のままであること（今日のデータでは effort が
   揃っているため粒度変更でも数は変わらない）を確認する
3. **外部消費者の受け入れ実測（再現可能手順）。** 「laplace-main は粒度に
   依存しない」という主張の唯一の実測点であり、通らなければ方向へ差し戻す。

   - **成果物**: 使い捨てスクリプトではなく、
     `packages/cli/scripts/verify-product-acceptance.mjs` として置く。
     `packages/engine/scripts/verify-against-product.cjs` と同じ位置づけ
     （オンデマンド・非 CI・ローカルの製品 checkout に対する相互検証）で、
     6つのアサーションを誰でも同じ形で再実行できるようにする。
   - **消費者リビジョンをワークツリー状態に依存させない**: sibling checkout
     （既定 `../laplace-main`、環境変数 `LAPLACE_MAIN_DIR` で上書き可）の
     `HEAD` をそのまま使わず、**裁定済みリビジョン `3a1d474` の内容を
     `git -C <dir> show 3a1d474:<path>` で取り出して**一時ディレクトリへ展開し、
     それに対して検証する。対象は
     `web/src/lib/bench/{parseArenaCatalog,contracts,shape}.ts` の3ファイル
     （`parseArenaCatalog` の依存はこの2つと `node:crypto` のみで Next に
     依存しない）。sibling のワークツリーは読むだけで変更しない。
   - **drift も同時に見る**: `git -C <dir> rev-parse HEAD` を記録し、
     `3a1d474` と異なる場合は**現 HEAD の同3ファイルに対しても同じ検証を
     実行**して、両方の結果を報告する。裁定は pin 側を正とし、HEAD 側が
     落ちた場合は drift として尋問へ上げる。
   - **環境が無ければスライスを止める**: checkout が無い、`3a1d474` が
     取り出せない、対象パスが無い場合は「実環境検証が未実施」と明示し、
     green を主張しない（sandbox green ≠ 実環境 green）。
   - **実行コマンド**:

     ```bash
     npm run build && npx tsx packages/cli/scripts/verify-product-acceptance.mjs
     ```

     `tsx` 経由なのは、製品側パーサが TypeScript で拡張子なし相対 import を
     使っており、Node のネイティブ type stripping では解決できないため。

     スクリプトの中身は (i) `buildArenaArtifacts` で現行台帳からカタログを
     生成、(ii) 上記の取り出した `parseArenaCatalog` を import、
     (iii) 生成カタログの JSON を通して下記6点を検査する。
   - **意味論アサーション**（non-null だけでは不十分）:
     - 戻り値が `null` でない
     - `matchups[0].left.id === "claude-opus-5@high"`、
       `right.id === "gpt-5.6-sol@high"`
     - `matchups[0].left.label === "Opus 5 (high)"`、
       `right.label === "GPT-5.6 Sol (high)"`
     - `public_agent_count === 2` かつ、パーサ内部の
       `participantMap.size` 一致チェックを通過している（= null でないことが
       その証明）
     - 各 `games[].team_a.headline_id` / `team_b.headline_id` が
       `left_side` に応じて左右 id と一致する
     - `matchups[0].id` が `sha256("claude-opus-5@high\0gpt-5.6-sol@high")` と
       一致する
   - **結果の扱い**: 実行したリビジョンと出力を impl checkpoint の尋問へ
     証拠として提出する。

## ロールバック

`headlineKey()` とラベル合成を戻して再 publish すれば元の粒度に戻る。台帳
（`community/runs/*`）は無変更なので、どちらの粒度でも同じ生ログから再生成
できる。
