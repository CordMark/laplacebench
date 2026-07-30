# work item: harness-lab-direction（tier: light）

Slice: LaplaceBench のモデル比較とハーネス比較を別タブ・別集計に分け、
Harness Lab の名称、差分表示、初期の許可階層 H0〜H2、将来の
harness × model 投稿/対戦システムの未決定論点を文書化する。
タブ、manifest、実行基盤、投稿契約の実装は含まない。

Requirement source: ユーザー指示 2026-07-30「まずは全体の方向性をドキュメントに
残していこう。UI的普通のベンチマークとは別タブでやる。それぞれにどんな
タブの名前をつけたら分かりやすいか、対局のハーネスの違いをそれぞれどうやって
見せたらいいか。どのレベルまでハーネスを作ることを許すか。…ハーネス×モデルペアを
みんなが投稿できて選んで戦わせられるとかは面白いけど…全体の仕組みはまだ作り
きらなくていい。むしろ論点を洗い出せればおっけい」。

Tier defense: 文書・方向記録のみの lightweight slice。コード、schema、
状態遷移、API/external contract、データ、認可、金銭、不可逆操作は変更しない。
2026-07-27 の「Model Arena からハーネス比較を保留」は維持し、別 Harness Lab の
方向設計だけを再開する。先行 work item に completed Direction Brief event はないため、
架空の direction correction event は作らない。

## Intent inventory

- 新規の正本: `docs/harness-lab-direction-ja.md`
- 現行スコープと文書導線: `README.md`
- 実験軸の境界: `docs/experiment-axes-ja.md`
- 公開参加戦略と旧保留案の参照先: `docs/public-platform-strategy-ja.md`
- 設計上の deferred boundary: `docs/design-v0.1.md`
- 実測の現在地: `packages/cli/FINDINGS.md` Run 7

## 2026-07-30 harness-lab-direction [impl]

- Q(review/evidence-strength): Run 7 の n=4 探索を、ハーネス効果や部門の価値を
  実証した証拠として過大に記述していないか。
  - 弁明: 正本文書と FINDINGS は示唆に留めていたが、実験軸文書に旧来の
    「答えを得た」「存在意義は実証済み」が残っており、強度が不整合だった。
  - 裁定: revise(ユーザー要求と正本文書の evidence boundary; class: C)
  - by: auto
  - prediction: hit
- Q(review/private-reasoning): 公開戦略の「生の返答」「何を考えたか」という
  表現が、private chain-of-thought を求めず表示しない境界と矛盾していないか。
  - 弁明: 旧文言は公開用着手ノートと provider の private reasoning を区別せず、
    Harness Lab の開示境界を破っていた。
  - 裁定: revise(Harness Lab の disclosure boundary; class: C)
  - by: auto
  - prediction: hit
- Q(review/trust-lanes): 投稿方式を未決定としながら、Model Arena と同じ
  trust lane を採用すると先に固定していないか。
  - 弁明: 異なる信頼水準を同一集計に混ぜない原則は固定できるが、レーン数と
    区分方法は、投稿・実行方式と一緒に未決定であるべきだった。
  - 裁定: revise(ユーザー要求の論点洗い出し境界; class: C)
  - by: auto
  - prediction: hit
- Q(review/evidence-strength-sweep): Run 7 の証拠強度を直した後も、README と
  design-v0.1 に「答えた」「confirmed」とする active wording が残っていないか。
  - 弁明: 初回修正は実験軸文書に留まり、正本文書と FINDINGS に合わせるべき
    active scope 文書2つを見落としていた。
  - 裁定: revise(正本文書の evidence boundary と active wording sweep; class: C)
  - by: auto
  - prediction: hit

## Impl review

- ラウンド 3・指摘計 4 件で APPROVED（confidence 0.99）

## 2026-07-30 harness-lab-model-choice [impl]（tier: light）

Requirement update: ユーザーが「Harness Lab 全員を同じモデルに固定する」のではなく、
各 harness × model ペアでモデルを自由に選び、対戦相手に同じモデルも選べる形を指定。
GPT-5.6 Sol 同士は radio でも説明しやすい最初の controlled experiment 候補。
あわせて、現在のサブスク Arena が技術的にハーネス込みかを確認する。

Tier defense: 文書と current-state inventory の更新のみ。コード、schema、状態、API、
集計実装、認可、金銭、外部契約、不可逆操作は変更しない。先行の completed
Direction Brief event は存在しないため direction-correction helper の対象外。

- Q(human/model-choice): Harness Lab は全員を同一モデルへ固定するのか。
  - 弁明: 対戦者IDは当初から harness × model ペアだったが、一行定義と初期説明が
    同一モデル限定に読めた。ユーザー意図は左右でモデルを自由選択し、同一モデルも
    選択可能にすること。
  - 裁定: human(同一モデル比較と異モデル・システム対戦の両方を許し、表示・集計・
    主張を分ける)
  - by: human
  - prediction: none
- Q(review/fixed-model-leftovers): supporting docs の「固定モデル・自由設計」と
  「全員 sonnet@medium」が、Harness Lab 全体の定義として残っていないか。
  - 弁明: 近接文では自由選択を追記したが、旧構想の導入と公平性節を
    fixed-model division に限定する修飾が不足していた。
  - 裁定: revise(ユーザーの model-choice correction; class: C)
  - by: auto
  - prediction: hit

## Impl review: harness-lab-model-choice

- ラウンド 2・指摘計 1 件で APPROVED（confidence 0.99）

## 2026-07-30 model-arena-clean-room [impl]（tier: light）

Requirement update: ユーザーは provider がモデル/CLI と同時に配布する公式 system
prompt は条件として許容しつつ、各個人の設定が Model Arena へ入り込まない cleanup を要求。

Tier defense: clean-room 方針と current gap の文書化のみ。CLI invocation、環境、schema、
集計、認可、外部契約は変更しない。実装時は通常挙動を変えるため別の standard slice。

- Q(human/official-vs-personal-harness): provider公式 harness と個人 customization の
  境界をどこに置くか。
  - 弁明: 公式 built-in prompt もモデル単体ではないが、全利用者へ同条件で配布され、
    CLI versionと能力を記録できるなら再現可能な provider condition になる。個人設定は
    対戦者ごとに変わり、Model Arena の共通条件を壊す。
  - 裁定: human(公式 built-in harness はversion付きで許可し、personal instructions /
    settings / skills / plugins / hooks / MCP / ambient behavior override は禁止)
  - by: human
  - prediction: none
- Q(review/retained-config-surfaces): `--safe-mode` や `--ignore-user-config` の後にも
  admin policy / user-home artifact が残り、verified と誤認されないか。
  - 弁明: 初稿はflagsを「等」としていたが、Claude safe modeはadmin policyを保持し、
    Codex ignore-user-configもconfig.toml以外のhome surface不在を保証しない。
  - 裁定: revise(fail-closed config leakage boundary; class: C)
  - by: auto
  - prediction: hit

## Impl review: model-arena-clean-room

- ラウンド 2・指摘計 1 件で APPROVED（confidence 0.99）
