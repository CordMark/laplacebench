# LaplaceBench Harness Lab 方向性

作成: 2026-07-30。現時点は**方向性と論点の記録**であり、UI、投稿契約、
実行基盤、ランキングを実装済みとするものではない。

きっかけは OpenAI の
[ARC-AGI-3 で reasoning retention と compaction が結果を大きく変えた報告](https://openai.com/index/how-two-settings-tripled-our-arc-agi-3-scores/)。
LaplaceBench には既に同一モデルの learning-vs-cold 実験
([FINDINGS Run 7](../packages/cli/FINDINGS.md))があるが、n=4 の探索であり、
上記2設定を個別に立証したものではない。本書は「ハーネスで差が
出る」という方向を、モデル比較と混ぜずに公開する形へ進める。

## 0. 一行の定義

- **Model Arena**: 違うモデルを、できるだけ同じ対局条件で比べる。
- **Harness Lab**: モデルとハーネスの組を選び、ハーネス込みのAI同士を比べる。

Harness Lab 全体でモデルを1つに固定するわけではない。対戦する2組に
**同じモデルを選ぶことも、違うモデルを選ぶこともできる**。前者はハーネス差を
読みやすく、後者はシステム全体の対戦として楽しめる。Model Arena の
モデル強さと、Harness Lab のハーネス込みシステム性能を同じ戦績に合算しない。

## 1. UI の情報設計と名前

LaplaceBench 配下に次の2タブを置く方向とする。

| 日本語 | English | タブ直下の説明 |
|---|---|---|
| **モデルアリーナ** | **Model Arena** | 違うモデル、同じ対局条件 |
| **ハーネスラボ** | **Harness Lab** | モデルと組み方を選んで対戦 |

タブ名だけで「harness」の意味を背負わせず、必ず下の一行を併記する。
「通常ベンチ」と「特殊ベンチ」に分けると後者が例外や低信頼に見えるため、
両方を対等な別目的の面として扱う。

- 既定の入口は Model Arena。Harness Lab を選ばないユーザーの体験を
  変えない。
- URL、絞り込み状態、対局集計、強さの主張はタブごとに独立させる。
- `Agent Arena` は使わない。「agent」がモデル単体か、ハーネス込みの
  システムかを曖昧にするため。
- 対局作成では両陣営に `model` と `harness revision` の選択欄を置く。
  対戦相手側の model は `同じモデル（ハーネス比較向け）` を既定候補にするが、
  別モデルへ変更できる。
- 対局カードには **同一モデル比較** / **異モデル・システム対戦** の種別を
  自動表示し、勝敗から言えることの違いを短く説明する。

## 2. 何を対戦者として数えるか

Harness Lab の対戦者はハーネス単体ではなく、次の組である。

> **Harness revision × declared model identity/version × effort/resource condition**

同じハーネスでもモデルが違えば別ペア。同じ名前のハーネスでも
プロンプト、メモ形式、コール構成が変われば別 revision とする。
投稿者と対戦者は各陣営のペアを独立に選べる。

比較は次の3種を混ぜない。

1. **Controlled ablation** — 同一モデルで、事前に宣言したハーネス要素だけを
   変える。1要素なら個別効果、複数なら複合ポリシーの効果として読む。
   Harness Lab の最初の主役。
2. **Fixed-model harness competition** — モデルとリソース封筒を固定し、
   許可範囲内でハーネス設計を競う。
3. **Open system competition** — モデルもハーネスも変える。Harness Lab で
   対戦可能にするが、fixed-model の記録と集計・主張を分け、この結果から
   ハーネス単体の因果効果を主張しない。

## 3. ハーネスの違いをどう見せるか

対局カードの見出しをハーネス名だけにせず、次の3層で表す。

1. **Brain** — declared model identity、providerが露出する場合のversion/snapshot、
   provider、effort。
2. **Harness** — コンテキストの寿命、reasoning 保持、プロンプト/メモ、
   コール構成、検証、ツール、対局間学習。
3. **Envelope** — 全コール合算の出力トークン、制限時間、コール数、
   コンテキスト/圧縮方針。

比較ヘッダーは二重にする。

- **共通条件バー**: ルール、観測、行動契約など左右で同じ条件を1回だけ表示。
  model、effort、リソース封筒も、実際に共通ならここへ置く。
- **差分カード**: model を含め、左右で違う行だけを先に表示。完全 manifest は
  折りたたみの技術情報に置く。

最初の reasoning retention / compaction 実験なら、例えば次の差分になる。

| 項目 | Turn-reset | Persistent + compact |
|---|---|---|
| 公開された観測・着手ノート | 保持 | 保持 |
| private reasoning | 毎手破棄 | 次手へ保持 |
| 長文脈の処理 | rolling truncation | native compaction |
| model / effort / budget | 同じ | 同じ |

結果面は W-D-L と対局数に加え、次を同じ重さで見せる。

- reasoning 込み出力トークン/手、latency/手、model call/手
- illegal move、format failure、timeout、token-budget skip
- 序盤/中盤/終盤の推移と、圧縮イベントの発生点
- レフェリーで再検証できる生ログと盤面リプレイ

公開の着手ノートとテレメトリは見せるが、private chain-of-thought は
求めず、復元せず、表示も採点もしない。

## 4. 許可するハーネスの深さ

「ハーネス」を1つの無制限カテゴリにせず、能力階層を manifest に記録する。

| level | 許可すること | 初期の扱い |
|---|---|---|
| **H0: Context** | reasoning保持/破棄、全文履歴、切り捨て、compaction | **対象** |
| **H1: Prompt & memory** | 戦略書、構造化メモ、決定論的な要約・注入 | **対象** |
| **H2: Orchestration** | 同じモデルの複数コール、自己検証、議論、planner/actor | **対象** |
| **H3: Tool-assisted** | 合法手列挙、ゲーム専用探索、コード実行、レフェリー照会 | 別部門の論点 |
| **H4: Open system** | 任意コード、ネットワーク、追加モデル、外部endpoint | 初期はホストしない |

**初期の公開 Harness Lab は H0〜H2 まで**を基本とする。この上限は
「両陣営を同じモデルにする」という意味ではなく、各 harness × model ペアが
選んだモデルをどう使えるかの上限である。H3 は検索エンジンや合法手 oracle の
強さが結果を支配し得るため、同じ戦績に入れない。

H0〜H2 の対局でも、次を共通の不変条件とする。

- 同一対局内では rulebook、observation、action protocol、referee を共通にする。
- 各ペアの全内部コールは、そのペアが宣言した model identity / effort を使い、
  別モデルへの silent fallback を許さない。異モデル対戦では、左右のペアが
  それぞれ別モデルを宣言してよい。
- 全内部コールを記録し、トークン封筒と時間制限は合算で適用する。
- 対戦相手の private context や、通常の観測にないレフェリー内部情報を
  渡さない。
- ハーネス revision とリソース条件を対局前に凍結する。対局間で書き換える
  学習型は、static harness とは別の lifecycle として表示・集計する。

## 5. 将来の投稿・対戦システム

面白い最終形は、ユーザーが **harness × model ペア**を登録し、
他のペアと対戦させる形である。ただし、現時点で仕組みを固定しない。

候補となる投稿形式:

1. **Declarative pack** — prompt、memory schema、workflow、許可機能の manifest。
   監査と再現がしやすく、最初の有力候補。
2. **Code package / container** — 表現力は高いが、sandbox、secret、network、
   依存の固定が必要。
3. **Remote agent endpoint** — 参加しやすい可能性はあるが、model identity、
   生ログ、課金、可用性を主催が検証しにくい。

誰が対戦相手を選ぶかも未決定とする。

| 方式 | 良い点 | 問題 |
|---|---|---|
| 投稿者が挑戦相手を指定 | 分かりやすく、会話が生まれる | 相性の良い相手だけ選べる |
| 相互承認の challenge | 人対人の代理対戦感が強い | 不成立・不在が増える |
| 中立 scheduler / rating 帯 | 公平で、継続的に回せる | 初期のデータ不足と実行費 |
| season 固定表 | 条件と停止規則を事前凍結できる | 常設の遊びとしては遅い |
| 運営の curated experiment | 因果を読みやすい | コミュニティ主導にならない |

初期は curated controlled ablation から始めるのが安全だが、その後の
採用方式はここで決めない。信頼水準の異なる記録を同じ集計に混ぜないことだけを
固定し、自己申告のセルフサーブ、コミュニティ台帳、中央実行の公式ランを
Model Arena と同様のレーンにするか、Harness Lab 固有の区分にするかも
未決定とする。

## 6. 主張と集計の境界

- 同一 model identity / effort / resource envelope の対局だけを
  **同一モデル比較**と表示する。ハーネス差の因果を読む入口はこちらにする。
- モデルが異なる対局は**異モデル・システム対戦**と表示する。これは
  harness × model ペア全体の勝敗であり、モデル差とハーネス差を分解しない。
- controlled ablation では seat swap、事前に固定した対局数・停止規則、
  全ゲーム公開を必須にする。
- 「ハーネスが強い」だけでなく、勝敗・効率・信頼性を分けて表示する。
- 同時に複数要素を変えた対局は「複合 harness 差」と呼び、
  個々の要素の因果効果に分解しない。
- provider-native の reasoning / compaction を比べるときは、同じ名前でも
  provider ごとに意味が異なる可能性を manifest とUIで開示する。
- Model Arena のモデル戦績、rating、「どちらのモデルが強いか」
  という主張に Harness Lab の対局を入れない。

## 7. 未決定の論点

### ハーネスとリソース

- 公平性を出力トークンだけで拘束できるか。input、model call数、wall time、
  費用をどこまで上限化するか。
- 将来の別 division で、H2 の role ごとに effort を変えることを許すか。
- 対局前の自己対戦・公開ログ学習・人手の戦略書をどう開示するか。
- 対局間で更新される learning harness の series 単位と初期状態をどう凍結するか。

### 投稿・信頼・安全

- harness revision と model binding の manifest / digest をどう定義するか。
- 誰が実行費を負担し、model identity/version の非公開・差し替え・廃止、
  レート制限、再試行をどう扱うか。
- declarative pack の表現力と、実行時に検証可能な制限のバランス。
- arbitrary code / container / remote endpoint を将来許可するなら、sandbox、
  network、secret、ライセンス、悪意ある出力をどう管理するか。
- コミュニティ実行の model identity を検証できない限界をどう表示するか。

### 対戦とランキング

- 挑戦者選択、合意式 challenge、中立 scheduler、season表のどれか。
- 固定モデル内の harness rating を作るか、matchup record に留めるか。
- モデルも変える open system 部門を Harness Lab 内に置くか、完全に
  別種目にするか。
- 相性の良い対戦の cherry-pick、対手別ハードコード、結果後の
  harness 更新をどう検出・分離するか。

### UI・説明

- 日本語の「ハーネス」をどこまで「AIの組み方」と言い換えるか。
- 差分カードの共通語彙と manifest schema をどちらが正本になるか。
- 対局中の compaction や複数コールを、勝敗より強く見せすぎずに
  観戦価値へつなげる方法。

## 8. 段階的な進め方

これは実装日程の確約ではなく、依存関係の順序である。

1. 本書で UI、比較単位、許可階層、未決定事項を固定する。
2. 運営所有の controlled ablation を1つ、対局数と停止規則を事前に
   固定して実行する。最初の有力候補は GPT-5.6 Sol 同士を同一 effort / envelope
   で戦わせ、turn-reset と reasoning retention + compaction の条件を比べる実験。
   コミュニティ投稿はまだ作らない。
3. 実測から Harness Lab manifest と差分表示に必要なフィールドを決める。
4. H0〜H2 の declarative pack とセルフサーブ投稿を検討する。対局作成では
   同一モデルを既定候補にしつつ、異モデルのペアも選べるようにする。
5. 中央実行、sandbox、中立 scheduler、season/rating は、実際の参加需要と
   運営費を見て別途決める。

## 9. 現時点で固定すること

- Model Arena と Harness Lab は別タブ、別集計、別主張にする。
- 作業名/英語名は `Model Arena` / `Harness Lab`、日本語表示は
  「モデルアリーナ」/「ハーネスラボ」とする。
- Harness Lab の対戦者IDは harness revision だけでなく model / effort / resource
  条件まで含む。モデル選択は自由で、同じモデル同士も選べる。
- 同一モデル対戦はハーネス比較、異モデル対戦はシステム対戦として表示・集計を
  分ける。
- 初期は controlled ablation を主役とし、許可範囲は H0〜H2。
- 投稿形式、sandbox、費用負担、対戦相手の選定、rating は未決定のまま残す。

## 10. 現在の Arena はハーネス入りか

**技術的には yes。現在もモデルを裸で呼んでいるわけではない。**

- LaplaceBench 共通ハーネスが、rulebook、観測 JSON、着手 JSON、公開着手ノート、
  retry、timeout、output-token envelope、referee を与える
  ([prompt.ts](../packages/cli/src/prompt.ts))。
- サブスク経由では `claude` / `codex` CLI 自体の system prompt と実行環境が
  加わる。Claude 側は tools を明示的に禁止する一方、Codex 側は現在
  benchmark から tool-disable option を渡していない
  ([agents/cli.ts](../packages/cli/src/agents/cli.ts))。
- Claude CLI は `--resume`、Codex CLI は `codex exec resume` を使い、どちらも
  1対局中の会話を持続する。Codex 条件は既に persistent thread だが、
  turn-reset との比較、compaction policy の宣言、compaction event の記録はない。
  したがって現在の記録から retention / compaction の個別効果は読めない。
- 対局ログは `harness:model@effort` を保持している。一方、現在の Model Arena の
  headline は認識済み harness を畳んで `model@effort` で集計し、同一モデル・
  同一 effort の異 harness 対局を既定の公開 matchup から外す
  ([catalog.ts](../packages/cli/src/catalog.ts),
  [publicgames.ts](../packages/cli/src/publicgames.ts))。

つまり現状は「ハーネスなしのモデル比較」ではなく、**共通の対局ハーネスに
provider CLI 固有ハーネスが加わった条件を、モデル名中心に見せている**。
Harness Lab はこの隠れがちな条件を対戦者IDと差分表示の主役へ引き上げる役割を持つ。

## 11. Model Arena の clean-room 境界

Model Arena で許すのは、全参加者に共通の LaplaceBench prompt と、provider が
モデル/CLI と一緒に配布する**公式 built-in harness**までとする。後者の内容が
非公開でも、model snapshot / CLI version / provider release へ結び付けて記録する。
providerが同じ識別子のまま変更し得るなら同一条件と断定せず、opaque condition とする。

| 入力源 | verified Model Arena |
|---|---|
| LaplaceBench rulebook / protocol / adapter revision | 固定・記録して許可 |
| provider公式 system prompt / built-in orchestration | CLI versionと能力を記録して許可 |
| 個人/組織管理のinstructions、settings、skills、plugins、hooks、MCP、agent、home artifact | **禁止または別condition** |
| ambient envによる effort/model/fallback/tool/network変更 | **禁止** |

verified run は fresh session と clean scratch cwd に加え、次を fail-closed で満たす。

- model / effort / CLI version / adapter revision / prompt revision を明示する。
- authだけを渡す isolated profile/home/container を使い、残る全surfaceの無効化を
  positiveに確認する。Claude `--safe-mode`、Codex `--ignore-user-config
  --ignore-rules` は補助例であり、それだけで十分とはしない。admin policyや
  user-home artifactを除外できなければfailまたは別conditionにする。
- tools、MCP、network、fallback、環境変数を明示的 allowlist にし、左右で同じ
  policyにするか、別 condition として分離する。
- synthetic global/user/project fixturesでinstructions、settings、skills、plugins、
  hooks、MCP、agents、rules、fallback、tools、network、envのcanaryを検証する。
  隔離能力やversionを確認できなければ official 集計へ入れない。

(2026-07-30 実装) サブスクCLI対局は clean-room が既定になった
(`docs/plans/2026-07-30-clean-room-execution.md`): 認証ファイルだけを持ち込む隔離
config home + 隔離OS HOME、env allowlist、抑止フラグ(Claude `--safe-mode
--setting-sources "" --strict-mcp-config`、Codex `--ignore-user-config
--ignore-rules --disable shell_tool` 等)、run dir 作成前の fail-closed preflight
(managed policy検査・ホーム内容列挙・両方向 canary matrix)を実装し、結果を
run.json の `isolation` manifest(`laplace-isolation-v1`)に記録する。ambient
環境コピーは `--ambient-cli-env` の明示opt-in・別条件ラベルとしてのみ残る。
clean-room は個人設定の隔離を証明する実行条件であり、それ自体は model identity の
検証(official verified)ではない。
