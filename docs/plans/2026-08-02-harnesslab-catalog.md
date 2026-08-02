---
status: implemented
direction: direction-harnesslab-catalog
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# Harness Lab 蓄積面カタログ(laplace-bench-harnesslab-catalog-v1)

## Direction Brief

1. **Purpose** — 運営者のハーネス実験が「モデル×ハーネスに試合が溜まっていく」
   アリーナ同型の面として見えるようにするデータ artifact。将来の laplace-main
   Harness Lab タブの入力であり、G3(上限なし3つ巴)が初期コンテンツ。

2. **Concept owner** — 新規 `packages/cli/src/harnesslab.ts` が
   `laplace-bench-harnesslab-catalog-v1` の schema・builder・fail-loud 検証子の
   canonical owner。収載の**選択子**はリポジトリ内 curated list
   `community/harnesslab-experiments.json`
   (`laplace-harnesslab-experiments-v1`: entries {run(台帳ディレクトリ名),
   description(1行), plan(事前登録 plan パス)})。`publicarena.ts` の
   `writeArenaArtifacts` が第2出力として `harnesslab.json` を同じ出力ディレクトリ
   へ原子的に書く(CI 経路は1本のまま)。

3. **Adopted direction** —
   - **選択は curation・検証は機械**(direction 対話で確定): budget 撤廃後は
     「budget null」が curation の代理として壊れている(全 run が既定 null)ため、
     curated list だけが収載の選択子。次の3条件は**検証子**で、list に載った run
     が満たさなければカタログ生成を **fail-loud** に落とす(黙る除外は裁定を
     静かに侵食する): (a) `output_token_budget_per_team_per_game === null`、
     (b) `matchup_kind !== "model-arena"`、(c) `isolation.mode === "clean-room"`。
     list に載った run が runDirs に見つからない場合も fail。
   - **器はアリーナ同型**: contender = フル spec 文字列(harness:model@effort、
     v1 の表示ラベルは spec そのまま — headline 折り畳みは使わない)。
     contender-pair 毎の matchup record に試合が溜まる。**rating・順位・run 横断
     の合算主張は作らない**(matchup record の事実のみ)。
   - **v1 schema(正確な形)**: top-level
     `{schema: "laplace-bench-harnesslab-catalog-v1", source_sha, generated_at,
     experiment_count, game_count, experiments[], matchups[]}`。
     `experiments[]` = curated list のエントリをそのまま
     `{run(台帳ディレクトリ名 = canonical id。run.json 内の run_id は
     informational として併記), description, plan}`。
     `matchups[]` は `{id: "<left_spec> vs <right_spec>", left_spec,
     right_spec(specs の ordinal 順で left < right), matchup_kind,
     harness_conditions: {left, right}, wins_left, wins_right, draws
     (games から再計算可能な派生値。rating・順位・cross-run 合算 field は
     存在しない), games[]}` を matchup id の ordinal 順で並べ、games は
     (run, game_id) の ordinal 順(決定論的出力)。game =
     `{run, game_id, first_side("left"|"right"), winner("left"|"right"|null),
     reason, plies, replay(digest), per_side: {left, right}}`。
     per_side = `{output_tokens(usage 集計の outputTotalTokens 合計。
     未報告 side は null), avg_latency_ms(既存 sideLatency 意味論を再利用。
     未計測 side は null), illegal_rate_per_turn(legality failures / turns、
     turns=0 なら null、丸めは小数3桁), failed_turns,
     compaction: {count, status} | null}`。
     上限: matchups ≤ 500・games/matchup ≤ 1,000(超過は fail-loud)。
   - **replay 同梱**: 既存 `buildPublicReplay(runDir, gameId)` を harness lane の
     全 game に適用し、arena と同じ `replays/<digest>.json` 名前空間へ出力
     (digest キーのため衝突なし。公開境界は既存 replay と同一)。
   - **compaction 列の正直さ**: `context-telemetry-<team>.json` が存在し
     `status === "ok"` かつ `complete === true` のときのみ
     `{count: compaction_count, status: "ok"}` を出す。file はあるが
     ok/complete でない場合は `{count: null, status: <その status>}`、
     file 自体が無ければ `null`。検証済みでない数値を正確な値として
     公開しない。
   - curated list の初期内容は **空**(G3 完走・台帳収載時に3 run を追記するのが
     最初の掲載)。将来の PR 受付は「このlistへの追記」に一本化される。
   - 実装は Opus 5 サブエージェントへ委譲(参照: publicarena.ts /
     publicarena-contract.ts / publicarena.test.ts)。レビュー・コミットは
     orchestrator。

4. **Value hierarchy** — 裁定の忠実な機械化(curation 選択子+fail-loud 検証子)
   > アリーナとの構造同型性 > 列の正直さ(telemetry null、rating なし) >
   実装の再利用(既存 replay/artifact 機構) > 網羅性(capped 時代の実験は
   載らない)。

5. **What disappears / is not protected** — budget null を curation の代理に
   使うこと(しない)。黙る除外(しない — 検証子違反は生成 fail)。rating・
   順位・合算勝率の主張。capped 時代(Run 9-11)の収載。laplace-main UI。
   投稿受付そのもの。headline 折り畳みによる contender 集約。

## Tier: standard

新しい公開 artifact(schema)と CI 出力の追加。既存 arena artifact・公開境界・
金銭・認可・不可逆は不変。

## Source-of-truth inventory

Search terms: `harnesslab`, `harnesslab-experiments`, `writeArenaArtifacts`,
`buildPublicReplay`, `matchup_kind`, `context-telemetry`, `public-arena`。

| Occurrence | Classification | Target |
|---|---|---|
| `src/harnesslab.ts`(新) | canonical(schema・builder・検証子) | 新設 |
| `community/harnesslab-experiments.json`(新) | curated list(選択子) | 空 experiments で新設 |
| `src/publicarena.ts writeArenaArtifacts` | 出力統合 | harnesslab.json を第2出力として原子的に書く(list が空でも空カタログを書く) |
| `src/publicreplay.ts buildPublicReplay` | 再利用 | 変更なし(harness game へ適用) |
| `src/cli.ts public-arena` | CI 入口 | `--harness-experiments <path>` 引数の追加(workflow が明示指定。省略時は空カタログ)+ 完了メッセージへ harness 件数 |
| `test/harnesslab.test.ts`(新) | 新規テスト | 下記 |
| `test/publicarena.test.ts` | 回帰 | arena artifact 不変の確認 |
| `.github/workflows/community-publish.yml` | 公開経路 | `harnesslab.json` を standings ブランチへコピーする1行を追加(現行は arena.json と replays のみコピーし、第2出力は捨てられる — 実測確認済み line 134-136) |
| `community/README.md` | derived doc | curated list の1段落(掲載=list 追記)+ 公開 artifact 一覧へ harnesslab.json を追記 |
| `docs/harness-lab-direction-ja.md` §2 | derived doc | カタログ実装済みの1行 |

## Concept model and invariants

- **選択子と検証子の分離**: list が唯一の収載経路。検証子は縮小方向にしか
  働かず、違反は fail-loud(exit 非0)で CI を止める。
- **artifact は事実のみ**: 集計は record 内 games から再計算可能な W-D-L まで。
  解釈(強い/弱い)は載せない。
- **既存 arena 出力は byte 不変**(harnesslab.json の追加のみ)。
- list に載る run は台帳(community/runs/<name>--<id>)に存在し replay 検証済み
  であることを前提とし、生成時に存在を検証する。

## Implementation

1. `src/harnesslab.ts`: schema 定数・型、`readExperimentsList(path)`(schema
   検証、missing file は「list が無い」として理由つき throw)、
   `buildHarnesslabCatalog(list, runDirs, sourceSha, generatedAt)`
   (run 解決 → 検証子 → matchup 集約 → replay bytes は publicreplay を利用)、
   検証子違反は理由つき throw。**list のパスは CLI 引数で明示**:
   `public-arena` に `--harness-experiments <path>` を追加し、workflow が
   `community/harnesslab-experiments.json` を渡す(暗黙の repo-root 解決を
   しない。ローカル再現コマンドを community/README に記載)。引数省略時は
   harnesslab 生成をスキップせず、**空カタログを書く**(第2 artifact の
   存在は常に保証し、収載ゼロと未生成を区別可能にする)。wrong-path は throw。
2. `publicarena.ts`: **prepare-all-then-swap** — arena カタログ・harnesslab
   カタログ・統合 replay map(digest 衝突検査含む)を**すべてメモリ上で構築し
   終えてから** temp ディレクトリへ書き、最後に1回の rename で target を
   入れ替える。builder / 検証子の throw は target に触れる前に起きる。
   戻り値に harness 件数を追加。
3. `community/harnesslab-experiments.json` 新設(空)+ community/README 1段落。
4. `cli.ts` public-arena の完了メッセージへ harness 件数。docs 1行。
5. plan status・裁定ログは orchestrator。

## Tests and verification

- `test/harnesslab.test.ts`(publicarena.test.ts の fixture 手法を雛形に):
  - 空 list → 空カタログ(fail しない)。
  - 収載: 合成 run(budget null・非 arena・clean-room)が matchup へ集約され、
    W-D-L・per_side 列・replay digest が正しい。同一ペアの複数 run で試合が
    **溜まる**こと(蓄積の検証)。
  - fail-loud 検証子: (a) budget 非 null、(b) matchup_kind = model-arena、
    (c) isolation が ambient / null、(d) list の run が runDirs に無い —
    それぞれ理由を含む throw。黙る除外が起きないこと。
  - compaction 列の status 正直さ: telemetry が ok+complete → {count, "ok"}、
    file ありで非 ok/complete → {count: null, status}、file なし → null の
    3ケース。
  - list schema 検証: 不正 shape の拒否。
- **writer 原子性の regression(writer-level)**: 既存の出力ディレクトリ
  (旧 arena.json / harnesslab.json / replays 一式)がある状態で、curated run の
  検証子違反を起こして `writeArenaArtifacts` を呼び、throw 後に旧3点が
  **byte 同一で残り**、部分生成(temp 残骸・target の書き換え)が一切露出しない
  ことを assert する。
- **arena byte 不変の oracle**: 実装**前**に、固定 fixture(固定 source_sha /
  generated_at)で現行実装の arena.json バイト列の SHA-256 を採取して
  テストへ焼き込み(golden)、実装後の出力が golden と一致することを assert
  する(決定論の自己比較ではなく現行実装に対する不変性)。既存
  publicarena.test.ts も回帰として維持。
- 全体回帰 `npm test`。
- 実機確認(orchestrator、G3 台帳収載後): 3 run を list に追記して
  `public-arena` を実行し、harnesslab.json の中身を確認(これが G3 コミットと
  合流する)。

## Failure and rollback

- artifact 追加のみ。ロールバックは第2出力の除去(arena 経路不変)。
- 検証子違反はカタログ未生成で CI が止まる(部分出力なし — 原子的 rename)。

## Completion criteria

- 新テスト+全体回帰 green(arena 出力 byte 不変含む)。
- codex-impl-review APPROVED(実機確認は G3 収載後の follow-up)。
