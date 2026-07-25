---
status: draft
direction: direction-community-lane-v2
owner: bench
risk_tier: heavy
last_updated: 2026-07-25
---

# Community レーン v2 — 対戦記録・自動マージ・自動提出

## Tier: heavy

当初 standard としたが、plan review の指摘（R-6）を受けて**重量へ昇格**する。
本スライスは (a) 提出ディレクトリ接頭辞 = PR 作成者という **identity trust
の判定**を新設し、(b) 「誰がマージしてよいか」の **authorization enforcement**
を人間から機械へ移し、(c) その判定主体に write 権限を与える。CLAUDE.md の
「authorization enforcement / identity trust を変更する」に該当し、迷ったら
上の階層に倒す規則に従う。

検証構成: 方向づけ対話（完了）→ プラン → `/codex-plan-review` →
**`/interrogation`（impl checkpoint）** → `/codex-impl-review`。

## Direction Brief

1. **Purpose** — 公開ベンチとして (a) 出す数字が嘘をつかないこと、
   (b) 他人の提出が増えてもオーナーがボトルネックにならないこと、
   (c) ターミナルで対局したら手を動かさずに反映されること。現状は3つとも
   満たしていない: 集計は生の勝ち数でソートし対戦相手を記録していないため
   試合数を増やせば順位が上がる、マージは人間が承認する前提、提出は手作業
   4ステップ。
2. **Concept owner** — 台帳の正本は `community/runs/*`（リプレイ検証済み
   イベントログ、追加のみ）。**集計の正本は CI の生成ジョブ1箇所**に移る
   （提出者は集計に触らない）。エージェント識別子の意味論
   （`provider:model@effort`）の正本は `packages/cli/src/catalog.ts`。
   マージ可否判定の正本は base 側定義の単一ワークフロー。
3. **Lifecycle and scope** — laplacebench 側のみ。laplace-main 側の表示
   （v1/v2 両対応 → 対戦一覧 UI）とリプレイ URL の外部ソース許可、および
   fetch 先 URL の切り替えは**別スライス**で、本スライスより**先に**製品側
   の受け入れ準備が要る。official（✓公式）レーンは実体化しない。
4. **Value hierarchy** — 出す数字の正直さ（n が小さくても嘘をつかない形式）
   > オーナーが門番にならないこと > 提出者の摩擦ゼロ > 表示の可読性 >
   自動化機構の少なさ。最後の項目は本スライスで**明示的に順位を下げる**
   （下記 6）。
5. **Adopted direction** —
   - **集計をエージェント単位のランキングから対戦（matchup）単位の記録へ**
     置換し、schema を `laplace-bench-standings-v2` へ版上げする。理由:
     正しいレーティングを出すにはデータ密度が全く足りず（現状 n=4）、
     直接対戦記録は n=4 でも嘘をつかない唯一の形式。副次効果として順位が
     消えれば吊り上げ対象が消滅し、多重アカウント対策が不要になる。
     **棄却した代案**: アンカー相手との対局だけ集計する案（フロンティア
     同士が最も見たいものかつ情報量最大なので本末転倒）、Bradley-Terry 等
     の重み付けレーティング（順位を出さないなら不要）。
   - **表示粒度**: 見出しは**全ハーネスを一律にモデル単位へ畳む**
     （`claude-cli` / `anthropic` / `claude-cli-learn` を区別しない）。
     内訳（エフォート・ハーネス別）は畳んだ状態でも常に見える。並びは
     対局数の多い順、同数なら最終対局の新しい順。行列は生成せず、実際に
     行われた対戦のみを列挙する。**同一見出しに畳まれる自己対戦
     （left と right の見出しキーが一致）は公開一覧から除外する。**
     （2026-07-25 人間裁定 correction `363555d9` により、当初案の
     「学習ハーネスは別エージェント」を撤回。学習ハーネスは単体の存在では
     なくハーネスの一部であり、主たる表示のベースラインはハーネスなしの
     モデル。ハーネス比較の見せ方は汎用ハーネス設計の後続スライスが担う。）
   - **集計生成を提出者から CI へ移す**。マージ後に CI が再生成し、
     **専用ブランチ（`standings`）へ push** する。main の保護に bypass
     例外を開けずに済み、譲歩が「1ワークフローが1データブランチへ書ける」
     まで縮む。台帳の正本は main の `community/runs` のままなので監査
     可能性は落ちない。
   - **自動マージの機械ゲート**は、判定もマージも **base 側定義の
     `pull_request_target` ワークフローが行い、PR のコードを一切実行しない**。
     判定入力を (a) GitHub API の changed-file リスト、(b) base 側のコード、
     (c) PR 側のデータファイルの中身、の3つに限定する。required status
     check という名前だけの縛りは**成立しない**（fork PR は
     `pull_request` でワークフロー定義ごと差し替えられ、同名の pass する
     check を偽造できる）。
   - **`submit` / 自動提出**: 対局終了 → ローカル verify → `community/runs`
     へ配置 → PR 作成 → ターミナルにリプレイ URL と PR URL を出す。push
     権限のあるオーナーは PR を経由しない直接 push 経路を持つ。
   - **参加者と相手**: 参加側は `claude-cli` / `codex-cli`（プロバイダ追加
     可能な形を保つ）。基準相手は `product-cpu:cpu-v4:level_1..5`。
     **product CPU のコミットピンは上げない**（バージョンは識別子の一部。
     v5 が出れば別エージェントとして増える）。公開対戦一覧に載る条件は
     「少なくとも片側が LLM エージェント」。
6. **What disappears / is not protected** —
   - **エージェント単位の順位表そのもの**（`StandingsRow` の通算成績行）。
   - **提出者による standings 再生成手順**（正準コマンドが提出フローから消える）。
   - **「PR diff に順位変動が見える」という価値** —
     `docs/plans/2026-07-25-standings-json.md` の direction 判断を明示的に
     覆す。前提（人間がマージ前に diff を読む）が自動マージで消滅するため。
   - **「常設 write 権限を持たない」という価値項目** — 同 direction の価値
     序列にあったが、明示的に覆す。譲歩の発生点は自動マージの受諾
     （ユーザー明示裁定）であり、集計生成の CI 移管はその同じ credential を
     再利用するだけで新しい信頼上の譲歩を追加しない。実行ごとに失効する
     `GITHUB_TOKEN` に閉じ、常設 PAT は使わない。
   - **公開ラインナップとしての takeshi と baseline**。ただし
     `packages/cli/src/agents/takeshi.ts` は削除しない
     （`docs/anchor-ladder-v1.md` / `v2.md` の測定が再現不能な主張になるため）。
   - **偽ラベルの検出**（守らない）。CLI はユーザーの手元で動くため署名でも
     閉じない。「ラベルは自己申告」と明記して受け入れる。
   - **official（✓公式）レーンの実体**（本スライスでは作らない）。
   - **ハーネス比較の公開露出**（correction `363555d9`）。学習ハーネス
     （`claude-cli-learn`）は現在 UI 上で単体としてフィーチャーされているが、
     本来はハーネスの一部であって独立したエージェントではない。主たる表示の
     ベースラインはハーネスなしのモデルとし、**学習ハーネス専用の分岐コードを
     本スライスで新設しない**。同一モデル・同一エフォートのハーネス比較対戦は
     見出しが自己対戦になるため公開一覧から落ちる。生ログは
     `community/runs` に残るので情報は失われない。汎用ハーネスを扱えるように
     する後続スライスで、露出の仕方をまとめて設計する。

## Implementation

### Phase 1 — 対戦記録データ（schema v2）

1. **`packages/cli/src/standings.ts` を matchup 集計へ書き換える。**
   - 新しい正本 `matchupData(runDirs): MatchupData`。1 game ごとに
     `final.json` の `teams.A.agent` / `teams.B.agent` から**対戦ペア**を作る。
   - **正準化は2段。向きの正本は headline 側**（plan review R-3 の指摘）。
     raw spec を先にソートしてから畳むと、provider 名の序数順によって
     同一 headline の左右が内訳ごとに反転し `left_wins` / `right_wins` を
     合算できない。したがって:
     1. **headline ペアを独立に正準化する**。2つの headline key を序数比較
        で昇順ソートし `[left, right]` に固定。これが**その matchup の
        向きの唯一の正本**
     2. **内訳（breakdown）は headline の向きに揃える**。raw 正準順は
        保持しない。1 game ごとに、その game の A/B が headline left/right の
        どちらに属するかを判定し、`left_wins` / `right_wins` へ remap する
     3. 同一 headline 内で raw spec の序数順が headline 順と逆になる組み
        合わせが存在しうるため、**remap は raw 順ではなく headline 帰属で
        行う**
     - draws は向きに依存しないのでそのまま加算
   - **識別子のパース**: `parseAgentSpec(spec): {harness, model, effort}` を
     `catalog.ts` に置く（識別子の意味論の正本と同じ場所）。
     **文法は `catalog.ts` の `buildSpec` から導出する**（plan review R-4 の
     指摘。当初案の例示が実装と食い違っていた）。実際に生成される形:

     | catalog key | spec の形 | 例 |
     |---|---|---|
     | `claude-cli` | `claude-cli:<model>[@<effort>]` | `claude-cli:opus@high` |
     | `codex-cli` | `codex-cli[:<model>][@<effort>]`、**model 省略 + effort 指定は `codex-cli:@medium`** | `codex-cli:gpt-5.6-sol@medium` / `codex-cli:@medium` / `codex-cli` |
     | `anthropic` | **`anthropic:<model>`**（effort なし） | `anthropic:claude-opus-4-5` |
     | `product-cpu` | `product-cpu:<policy>:<level>`（3セグメント） | `product-cpu:cpu-v4:level_5` |
     | `baseline` | **接頭辞なしの裸の名前** | `random` / `greedy` |

     **パースは「認識済みハーネスの allowlist」で決める**（形では決めない。
     plan review 指摘）。colon を含むというだけでは分解しない:

     ```
     RECOGNIZED_HARNESSES = catalog keys
                            ["claude-cli","codex-cli","anthropic",
                             "product-cpu"]
                          + 明示的に追加する ["claude-cli-learn"]
     ```

     - 第1セグメントが `RECOGNIZED_HARNESSES` にあるものだけ
       `{harness, model, effort}` に分解する
     - **それ以外は形が似ていても raw fallback**（`{harness: null,
       model: null}`、headline key は raw spec）。したがって
       `claude-cli-learn:claude-fable-5@low` は**分解され**、
       `takeshi:d2` は**分解されない**。同じ colon 形でも扱いが分かれるのは
       この allowlist が理由
     - `baseline`（`random` / `greedy`）は接頭辞を持たないので常に raw
       fallback 側に落ちる。LLM 判定にも入らないので整合する
     - round-trip テストの対象は **catalog の全 published spec +
       `claude-cli-learn` の実データ例**。加えて
       **`claude-cli-learn:...` と `takeshi:d2` の対照テスト**で allowlist
       が効いていることを固定する

     注意点: `anthropic-api` は **spec 接頭辞ではなく usage source ラベル**
     （`agents/llm.ts` の `usageProfile.source`）。LLM 判定に使ってはいけない。
     `codex-cli:@medium` の空 model セグメントを model 名として拾わないこと。
     **パース不能な free-form spec（`center-greedy`、`takeshi:d2`、`chaos` 等）は
     分解せず raw のまま扱う**（`model: null`、`harness: null`）。
     フォールバック分岐を増やさず、`model ?? raw` の1本で headline key を作る。
   - **見出しキー（headline key）**: `model`（パース不能なら raw spec）。
     **ハーネスによる例外分岐を一切持たない** — 学習ハーネス専用の
     allowlist（`STATEFUL_HARNESSES` 相当）は本スライスで導入しない
     （correction `363555d9`）。ハーネスの区別が必要になるのは汎用ハーネス
     設計の後続スライス。
   - **公開条件**（2つとも満たすものだけ `matchups` に載る）:
     1. 少なくとも片側が LLM プロバイダ。判定は
        **`LLM_HARNESSES = ["claude-cli", "claude-cli-learn", "codex-cli",
        "anthropic"]`**（spec 接頭辞。`anthropic-api` ではない）。
        baseline 同士・product-cpu 同士・free-form 同士は除外
     2. **left と right の見出しキーが異なる**。同一見出しに畳まれる自己対戦
        （例: 学習ハーネス vs 素の CLI で同一モデル・同一エフォート）は
        「Fable 5 対 Fable 5」という無意味な見出しになるため除外する。
        これはハーネス比較を**意図的に公開対象外へ倒す**判断であり、
        後続の汎用ハーネススライスが適切な見せ方を決めるまでの状態
     除外された対戦も `game_count` / `run_count` には算入する（台帳としての
     総数は正しく保つ）。
   - **決定論のバイト契約を維持（全順序を両レベルで閉じる）**:
     - 見出しの並び: 対局数 desc → 最終対局 desc → **`headline.left` の
       序数比較 asc → `headline.right` の序数比較 asc**
     - 内訳の並び: 対局数 desc → 最終対局 desc → **`left_agent` の序数比較
       asc → `right_agent` の序数比較 asc**。内訳同士は headline key が
       同一なので、raw spec を最終 tie-breaker に置かないと全順序にならない
     - **入力 `runDirs` の順序に依存しないこと**を契約とする（並べ替えても
       バイト一致）
     JSON はプロパティ挿入順をスキーマ記載順に固定、
     2-space インデント、末尾改行ちょうど1つ。**浮動小数は出さない**
     （`err_per_turn` は内訳行に残すので `Math.round(x*1000)/1000` の既存
     契約を踏襲）。
2. **スキーマ**:
   ```
   {
     schema: "laplace-bench-standings-v2",
     lane: "community",
     game_count, run_count, matchup_count,
     matchups: [{
       headline: { left, right },            // 序数昇順で正準化。向きの唯一の正本
       games, left_wins, right_wins, draws,
       last_game: <run-id/game-id>,
       breakdown: [{
         left_agent, right_agent,            // headline の向きに揃えた raw spec
         games, left_wins, right_wins, draws,
         center_wins, elim_wins, horizon_draws, repetition_draws,
         left_err_per_turn, right_err_per_turn
       }]
     }],
     agents: [{ agent, games, err_per_turn }]  // 名前順。順位ではなく参加者一覧
   }
   ```
   `agents` は**勝敗を含めない**（順位表として読まれないため）。
3. **`standingsMarkdown` を matchup 表へ書き換える**。`STANDINGS.md` は
   見出し + 内訳のネストした表。Regenerate 行は Phase 2 でコマンドが
   消えるため、**「この成果物は CI が生成する。手で編集しない」** の注記に
   置換する。
4. **`cli.ts`**: `standings` サブコマンドは**内部生成用に残すが**、
   `--out` / `--json-out` の既定を維持しつつ usage から「提出者が叩く
   コマンド」という位置づけを外す。`STANDINGS_REGEN_COMMAND` の参照元
   （README・wizard の `submissionGuidance`・生成 Markdown・CI 失敗
   メッセージ）を Phase 2 の新しい導線に合わせて更新する。
5. **データ差し替えと成果物の置き場確定**（成果物は main に置かない）:
   - `community/runs/example--baselines`（takeshi vs center-greedy）を
     **実際の Claude または Codex vs `product-cpu:cpu-v4:level_N` の run に
     差し替える**（main 上。生ログの正本は main のまま）
   - 差し替え後の run から bootstrap 用の `STANDINGS.md` と
     `standings.json` を生成し、**orphan `standings` ブランチへ配置する**
     （ブランチの初回作成もここで1回だけ手動で行う）
   - **main 上の `community/STANDINGS.md` と `community/standings.json` は
     削除する**。正準の置き場を `standings` ブランチ1箇所に確定し、
     2箇所所有を残さない
6. **Tests**: golden シリアライズ（プロパティ順・インデント・末尾改行）、
   ペア正準化（先後入れ替えが同一行に集まる）、見出しの畳み
   （**`claude-cli:opus@high` / `anthropic:opus` / `claude-cli-learn:opus@high`
   がすべて同一見出し**になること = ハーネス例外が無いことの回帰。
   **負例として `anthropic-api:opus` は spec ではないので free-form 扱いに
   なり、この見出しに畳まれないことを固定する**）、
   公開条件（baseline 同士が除外される / 片側 LLM は含まれる /
   **自己対戦が除外され、かつ `game_count` には算入される**）、
   `parseAgentSpec` の全 published spec round-trip、
   **決定論（2回呼び出しバイト一致 + `runDirs` を並べ替えてもバイト一致）**、
   **内訳の全順序（games と最終対局が同値の内訳が raw spec 順で安定すること）**、
   ゼロ run（`matchups: []`）、
   **全対戦が除外された場合（`matchups: []` かつ `game_count > 0`）**。
   既存 `productcpu.test.ts` / `repetition.test.ts` の standings 利用を
   新 API へ追従。

### Phase 2 — 集計生成の CI 移管と自動マージゲート

7. **`.github/workflows/community-gate.yml`（新規、`pull_request_target`）**
   — 判定とマージの単一の正本。**PR のコードを一切実行しない。**

   **権限は2 job に分離する**（強い権限を持つ範囲を最小化）:
   - `verify` job: `permissions: contents: read, pull-requests: read`。
     changed-file 取得・allowlist 判定・データ取得・リプレイ検証まで。
     **write を一切持たない**
   - `decide` job: `permissions: contents: write, pull-requests: write,
     issues: write, actions: write`。マージ・ラベル付与・後続 dispatch のみ

   **job 間の制御（plan review 指摘）**: `needs: verify` だけだと、
   allowlist 違反や検証失敗で verify が fail した瞬間 `decide` が skip され、
   **hold ラベルを付ける動作自体が実行できない**。したがって:
   - `verify` job は**失敗で終了しない**。判定結果を**構造化 output** として
     必ず返す: `verdict`（`pass` / `hold`）、`reason`（hold の分類）、
     `verified_sha`、`submission_dir`、`author`
   - `decide` job は `needs: verify` かつ **`if: always() &&
     needs.verify.result != 'cancelled'`**。cancel された古い run は
     **何も書かない**（ラベルも付けない。新しい run が正本）
   - `decide` の分岐は3つだけ:
     - `verdict == pass` → `community-submission` ラベル付与 → head SHA
       再確認 → マージ → dispatch
     - `verdict == hold` → 該当ラベル（`needs-human` / `rate-limited`）のみ
       付与。マージも dispatch もしない
     - `verify` が想定外に crash（`result == 'failure'`） → `needs-human`
       ラベルのみ付与。**マージしない**（fail-closed）
   - `issues: write` は PR ラベル付与に必要（PR は issue として扱われる）、
     `actions: write` は `workflow_dispatch` の発火に必要。いずれも
     前ラウンドで追加した連鎖と hold ラベルの前提

   **head SHA の固定（plan review critical 指摘）**: 検証した内容と
   マージする内容が必ず同一であることを、SHA で結ぶ。
   - 起動直後に `pull_request.head.sha` を **`VERIFIED_SHA` として1回だけ
     確定**し、以降の changed-file 取得・データ取得・検証をすべてこの
     immutable SHA に対して行う（ブランチ名や `HEAD` を参照しない）
   - `concurrency: group: community-gate-${{ github.event.pull_request.number }},
     cancel-in-progress: true` で、同一 PR の古い run を打ち切る
   - マージ直前に PR の現在の head SHA を再取得し、`VERIFIED_SHA` と
     **一致しなければマージせず hold**（検証中に push された新 head を
     未検証のままマージしない）
   - マージ API には `sha: VERIFIED_SHA` を**必須条件として渡す**
     （GitHub 側でも二重に不一致を弾く）

   判定手順:
   1. `VERIFIED_SHA` を確定
   2. GitHub API から `VERIFIED_SHA` の changed-file リストを取得
   3. **allowlist（全 changed file が4条件を満たすことを必須とする）**。
      1件でも外れたら**即座に中断**（以降の処理を一切しない）:
      - **status が `added` であること**。`modified` / `removed` / `renamed`
        / `copied` はすべて hold（既存 run の書き換えと削除を禁止）
      - パスが `community/runs/<単一の新規ディレクトリ>/**` 配下であること
      - **拡張子が `.json` または `.jsonl` であること**（検証されない
        ファイルが混入する経路を塞ぐ）
      - **通常 blob であること**（mode `100644` / `100755`。symlink =
        mode `120000` と submodule = `160000` は hold）
      検証で読む集合と allowlist が許す集合を**一致させる**のが要件
      （前者だけ絞ると未検証ファイルがマージされる）
   4. ディレクトリ接頭辞が PR 作成者の GitHub ログインと一致するか検証
   5. レート制限（下記 7a）
   6. `actions/checkout` は **base ref のみ**。PR 側からは
      `VERIFIED_SHA` の `community/runs/<dir>/**` のデータファイルだけを
      API 経由で取得する（3 の allowlist によりこれが changed file の全体と
      一致している）。`package.json` / lock / `.github` は取り込まない
      （`npm ci` が PR のコードを実行する経路を塞ぐ）
   7. base 側のエンジンで**追加分のみ**リプレイ検証
   8. head SHA 再確認 → 一致すればマージ API を `sha: VERIFIED_SHA` で呼ぶ
   9. マージ成功後、**明示的に後続を発火**（下記 8）
   - どこかで落ちたら `needs-human` ラベルを付けて人間キューへ（reject では
     なく hold。PR は開いたまま残す）

   **7a. レート制限（本プランで確定）**
   - 上限: **同一 PR 作成者につき直近24時間でマージ済みの community 提出
     10 件**
   - **数える対象を一意にするため専用ラベルを使う**: allowlist と接頭辞
     検証を通過した時点で `decide` job が **`community-submission`
     ラベルを必ず付与**する。コードや文書の PR にはこのラベルが付かない
   - 集計クエリ: `repo:<repo> is:pr is:merged label:community-submission
     author:<login> merged:>=<now-24h>` の件数。**ラベルなしの merged PR は
     数えない**（契約と集計手段を一致させる）
   - 超過時: **自動マージせず `rate-limited` ラベルを付けて hold**。
     PR は閉じない
   - hold 解除主体: **リポジトリオーナーの手動マージ**（機械は再試行しない）
   - テスト: 境界値 9 / 10 / 11 件、および同一作成者の無関係な merged PR
     （コード PR）が計数に混入しないこと

8. **マージ後の連鎖を明示的に発火する（plan review major 指摘）**
   — `GITHUB_TOKEN` による push は**新しい workflow run を起動しない**
   （GitHub の再帰防止仕様）。したがって `community-gate.yml` がマージした
   結果を `push: branches: [main]` のトリガに頼ると、生成も全件監査も動かない。
   - `community-gate.yml` は**マージ成功後に `workflow_dispatch` を明示的に
     発火**し、マージ済み SHA を `inputs.merged_sha` として渡す
     （`workflow_dispatch` / `repository_dispatch` は `GITHUB_TOKEN` からでも
     起動できる例外）
   - 発火に失敗した場合はゲート run を fail させる（黙って publish されない
     状態を残さない）
9. **`.github/workflows/community-publish.yml`（新規）**
   — トリガは `workflow_dispatch`（`merged_sha` 入力）**および** `push:
   branches: [main]`（人間の直接 push を拾うため。`GITHUB_TOKEN` 由来では
   起動しないので二重実行にはならない）。
   `permissions: contents: write`。
   - **`SOURCE_SHA` をイベント別に定義する**:
     `workflow_dispatch` なら `inputs.merged_sha`、`push` なら `github.sha`。
     どちらの経路でも **`SOURCE_SHA` を checkout し、その SHA に対して
     全件検証と生成を行う**（イベントによって対象が曖昧にならないようにする）
   - `SOURCE_SHA` を checkout し `matchupData` を再生成、**`standings`
     ブランチへ push**
   - **`standings` ブランチの bootstrap（plan review major 指摘）**:
     - ブランチは**孤立ブランチ（orphan）として初回に作る**。履歴もコードも
       持たず、`STANDINGS.md` と `standings.json` の**2ファイルだけ**を置く
     - 初回作成は**実装時に1回だけ手動で行い**、以降ワークフローは
       「存在する前提で fetch → 上書き → push」に単純化する
       （ワークフロー内に「無ければ作る」分岐を持たせない）
     - 更新の直列化: `concurrency: group: community-publish,
       cancel-in-progress: false`（打ち切らずキューイング）。
       push が non-fast-forward で落ちたら **fetch し直して再生成・再 push を
       1回だけ再試行**し、それでも落ちたら fail
   - 生成物が前回と同一なら push しない（空コミットを積まない）
   - **Phase 1 の成果物は main にコミットしない**。`community/STANDINGS.md`
     と `community/standings.json` は main から**削除**し、正準の置き場を
     `standings` ブランチ1箇所に確定する（2箇所所有を残さない）
   - **全件リプレイ再検証もこの run が担う**（下記 10 の理由）。集計生成の
     前に `verify community/runs/*/` を走らせ、**落ちたら publish しない**。
     ゲートの差分検証は「新規提出が正しいか」、こちらは「main 全体が
     依然として整合しているか」の事後監査
10. **`.github/workflows/community-verify.yml` は削除する**。
    役割が2つに分割吸収されるため、3本目を残すと所有者が増えるだけになる:
    - PR 上の差分リプレイ検証 → `community-gate.yml`
    - main の全件リプレイ検証 → `community-publish.yml`（上記 9）
    - standings 整合ゲート → **概念ごと消滅**（成果物が PR に含まれなくなる）
    - build / test は `ci.yml`（`push: main` + `pull_request`）が既に担って
      おり、そちらは変更しない
11. **文書の追従**:
    - `community/README.md`: 提出手順から再生成ステップを削除。消費契約の
      記述を **`standings` ブランチの新 raw URL** へ更新し、**laplace-main
      側の fetch 先切り替えが必要**である旨を明記
    - `packages/cli/README.md:119`（"cause in summaries and standings"）:
      standings が対戦記録へ変わったことに合わせて文言を追従
    - `packages/cli/src/cli.ts` の usage 文字列から、提出者向け導線としての
      `standings` の説明を外す

### Phase 3 — `submit` と自動提出

12. **`laplacebench submit <runDir>`（新規）**:
    - ローカルで `verify` を実行し、落ちたら提出しない（fail-closed）
    - `gh` CLI の認証状態を検出。未認証なら**手順を案内して終了**
      （トークンを自分で受け取らない）
    - push 権限があれば **main へ直接 push**（PR を経由しない）。
      無ければ fork → ブランチ → push → PR 作成
    - ターミナルに**リプレイ URL（PR head / commit を指す）と PR URL**を出力
13. **`play` ウィザード**: 対局セットアップ時に「終了後に自動提出するか」を
    1回だけ確認し、終了時に `submit` を呼ぶ。`submissionGuidance` は
    自動提出を選ばなかった場合の案内に縮小する。
14. **Tests**: `submit` の verify 失敗で提出しない、未認証時に案内して
    非ゼロ終了しない（正常系として扱う）、オーナー経路と fork 経路の分岐、
    wizard の確認プロンプトと自動提出呼び出し、`submissionGuidance` の更新。

## 依存と順序（重要）

`laplace-main` の `CommunityStandings.tsx` は schema を厳格検証し
fail-soft で非表示にするため、**製品側スライスを先に**進める必要がある:

1. 製品側を **v1 / v2 両対応 + fetch 先 URL の切り替え**に対応させて deploy
2. 本スライス Phase 1・2 を投入
3. 製品側から v1 対応を落とす（任意）

順序を誤ると /bench の community セクションが数時間消える（白画面には
ならない）。

## Out of scope

- laplace-main 側の表示 UI・リプレイの外部ソース許可・fetch 先切り替え
- official（✓公式）レーンの実体
- product CPU のコミットピン更新（v5 / lv6 は別エージェントとして後日追加）
- リポジトリ肥大への保存戦略（数千 run オーダーの問題）
- `packages/cli/src/agents/takeshi.ts` の削除
- **汎用ハーネスの概念設計とハーネス比較の露出**（correction `363555d9`）。
  学習ハーネス専用コードの整理、laplace-main 側で学習ハーネスが単体
  フィーチャーされている状態の是正を含む。本スライスでは新たな専用分岐を
  作らないことだけを守る

## Verification

**Phase 1（ローカルで完結）**
- 全 workspace typecheck + test green
- 生成した `standings.json` が2回実行でバイト一致（決定論）
- 差し替えた example run が `verify` を通る
- **headline 向きの回帰**: 異なるハーネスが同一 headline に畳まれ、かつ
  raw spec の序数順が headline 順と逆になる組み合わせで、`left_wins` /
  `right_wins` が正しく合算されること
- **spec 文法の round-trip**: `catalog.ts` の全 published provider について
  `buildSpec` の出力を `parseAgentSpec` に通し、期待した
  `{harness, model, effort}` に戻ること（`anthropic:<model>`、
  `codex-cli:@effort`、3セグメント product-cpu、裸の baseline を含む）

**Phase 2（実測が必要 — green な dry-run で代替しない）**
- **allowlist の4条件を、拒否境界ごとに最低1回ずつ実 PR で通す**
  （まとめて1 PR にせず、どの条件で落ちたかを判別できる形にする）:
  1. パス条件: `community/runs` 外のファイルを含む PR
  2. status 条件: 許可ディレクトリ**内**で既存ファイルを `modified` する PR /
     `removed` する PR / `renamed` する PR（3ケース）
  3. 拡張子条件: 許可ディレクトリ内に `.json` / `.jsonl` 以外
     （例 `.md` / `.txt`）を追加する PR
  4. blob 条件: 許可ディレクトリ内に **symlink** を追加する PR /
     **submodule** を追加する PR（2ケース）
  いずれも**マージされず、`needs-human` ラベルが付く**ことを確認する
- **ワークフロー差し替え PR**: PR 側で `.github/workflows/` を書き換え、
  同名で pass する check を生成する PR を立て、**判定に影響しないこと**
- **接頭辞不一致 PR**: 他人のログイン名でディレクトリを作った PR が
  hold されること
- **head SHA 競合**: 検証中に追加 push した PR が、未検証 head のまま
  マージされないこと（hold されること）
- **連鎖の発火**: ゲートのマージ後に `community-publish.yml` が実際に
  起動すること（`GITHUB_TOKEN` 由来の push でトリガされない仕様を、
  明示 dispatch が回避できていることの実測）
- **job 制御（3分岐すべてを実測する）**:
  - `hold`: verify が hold を返した PR で `decide` が skip されず
    ラベルだけ付くこと
  - `cancelled`: cancel された古い run が何も書かないこと
  - **`verify` の想定外 crash（fail-closed の要）**: verify job を意図的に
    failure へ倒し、**outputs が欠損した状態でも `decide` が起動して
    `needs-human` のみを付け、マージも dispatch も実行しないこと**。
    これが最も重要な分岐なので、他とまとめず単独で実測する
- **レート制限**: 境界 9 / 10 / 11 件、および同一作成者のコード PR が
  計数に混入しないこと
- `standings` ブランチへの push が成功し、**raw URL で実 fetch できること**

**Phase 3**
- `submit` が verify 失敗時に提出しないこと（実 run で確認）
- オーナー経路（直接 push）と fork 経路（PR）の両方を実際に通すこと

## 未決（実装時に既定を置く）

- example run の差し替えに使う実対局の組み合わせ
- `laplace-main` 側の `commentary-demo` 削除に伴う commentary 機能の
  サンプル欠落（本スライス外だが、製品側スライスへ引き継ぐ）
