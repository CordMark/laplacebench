---
status: implemented
direction: direction-bench-speed-visibility
owner: bench
risk_tier: standard
last_updated: 2026-07-27
---

# マルチゲーム並列実行・ライブ進捗・公開ページの時間/トークン表示

## Tier: standard

CLI 実行系の既定挙動変更(直列→並列)と、公開 arena artifact への
additive フィールド追加。ゲーム内の公平性規則(トークン封筒・timeout・
draw 規則)、エンジンコア、プロンプト(prompt_rev)、金銭・権限・不可逆
migration には触れない。重量要件(legacy data semantics / cutover /
不可逆)に該当せず、表示のみでもないため標準。

## Direction Brief

1. **Purpose** — 実測で 2局直列 104分(73〜91秒/手)・進捗表示ゼロという
   体験問題を解消する。(a) 複数試合の wall time を並列化で 1/N に、
   (b) 実行中の「止まってるかも/トークン食いすぎかも」不安をライブ表示で、
   (c) 公開 bench page の情報不足(時間・トークン未表示)を additive
   フィールドで解消する。出所: kei 指示 2026-07-27。
2. **Concept owner** — 実行スケジューリングとライブ表示の正本は
   `packages/cli/src/cli.ts`(表示)と `runner.ts`(進捗コールバック口)。
   公開契約の正本は `packages/cli/src/publicarena-contract.ts`
   (`laplace-bench-arena-v1`、additive・v1 維持 — effort-identity の前例に
   従う)。閲覧 UI の正本は laplace-main
   `web/src/components/bench/`(あちらのリポジトリ規約で実装)。
3. **Lifecycle and scope** — 並列は `--games N` (N>1) の新既定。
   `--serial` で従来挙動。学習エージェント(`claude-cli-learn` 系)は
   ゲーム間で strategy notes を直列に積む前提のため**自動的に直列へ
   フォールバック**し、その旨を1行表示する。ライブ表示は表示のみで
   成果物(events.jsonl / final.json / summary.json)を変えない。
   arena には per-game の所要時間とチーム別トークンを additive に載せる。
   スコープ外: prompt_rev 変更、リーダーボード集計の変更、リプレイ
   スキーマ変更、表示側翻訳。
4. **Value hierarchy** — ゲーム内公平性の不変(並列化は対局間の資源
   干渉をベンチ規則に持ち込まない — 予算はトークン建てなので帯域競合は
   公平性を壊さない) > 実行体験(wall time・可視性) > 公開情報の充実 >
   出力の互換(additive で旧読者を壊さない)。
5. **Adopted direction** — 方向づけ対話で CHANGE 確定(trace:
   docs/interrogation/adjudications/bench-speed-visibility.md)。
   (a) 並列デフォルト + `--serial` + 実行冒頭の1行明示。
   (b) 手ごとのライブ進捗行(並列時はゲームIDプレフィックス)。累積
   output tokens / budget を含め、トークン不安に正面から答える。
   (c) arena `PublicGame` に `duration_ms` とチーム別トークンを additive
   追加(schema 名 v1 維持)。laplace-main のカードで表示。
   (d) 「見出し左は Team A/B」行は**削除**。同じ行内に
   「A · <model> vs B · <model>」の対応が既にあり、追加の対応行は
   冗長で混乱源(kei 指摘)。
6. **What disappears / is not protected** — 「複数試合=直列」の既定。
   「見出し左は…」文言。**意図的にやらないこと(人間へ差し戻し済み)**:
   output 簡潔化 prompt_rev — 可視 narration は output tokens の
   6.1%/7.8% で、削っても時間はほぼ縮まず観戦チャネル(p3-move-note)の
   価値だけ失うため本スライスから削除。可読性目的で別途やるかは kei の
   再判断待ち。着手ノートの言語オプション(run 時指定)は公平性を理由に
   kei が明示的に見送り(表示側翻訳は未検討のまま残る)。

## 変更インベントリ

### laplacebench(このリポジトリ)

1. `packages/cli/src/cli.ts` — play の game ループを並列化:
   - N>1 かつ `--serial` なし かつ 両 spec が学習エージェントでない場合、
     全ゲームの agent ペアを先に生成し `Promise.allSettled` で並列実行。
     seed 系列(`seed + g*1000`)・swap 規則・run.json の既存キーは不変
     (run.json に `execution: "parallel" | "serial"` を additive 追加。
     読者の棚卸し: run.json を読むのは `standings.ts` の tolerant reader
     のみ — 未知キーは無視され `started_at` 欠損も許容する実装のため
     影響なし。submit gate / exportweb / metrics は run.json を読まない)。
   - 冒頭に `games=N を並列実行します(--serial で直列)` を1行表示。
     学習エージェント時は `learning agent のため直列実行` を表示。
     学習エージェント判定は spec 解析と同じ正規表現
     `/^claude-cli-learn(?::|$)/`(cli.ts の `claudeLearn` match と同源)
     を使い、Team A/B のどちらに指定しても直列へ落ちる。prefix 文字列
     比較の独自実装はしない(`claude-cli` との誤マッチ防止)。
   - **失敗の伝播**: 一部ゲームが失敗しても他を完走させ、失敗一覧を
     最後に報告する。`arena()` は失敗ゲーム数を戻り値で返す(現行
     `Promise<void>` を `Promise<{failedGames: number}>` に変更)。
     `runPlay` は failedGames>0 のとき exit code 1 を返し、`--submit`
     指定でも **提出を抑止**する(部分 run を公開台帳へ出さない)。
     agent ペア生成段階での `makeAgent` 失敗時は、生成済みの全 agent を
     dispose してから throw(現行の first/second dispose 規律を全ペアへ
     拡張)。playGame 失敗ゲームの agents は playGame 自身の finally が
     dispose する(現行どおり)。summary は完走ゲームのみで生成(現行の
     summarize は存在する game dir を読む — 挙動をテストで固定)。
2. `packages/cli/src/wizard.ts` — CLI 契約の実装経路:
   - `--serial` を `BOOLEAN_FLAGS` と `PASSTHROUGH_FLAGS` に追加し、
     `runPlay` から `arena()` へ渡す。usage/help 文言(cli.ts の usage
     文字列)に `--serial` と並列デフォルトの説明を追記。
     `wizard.test.ts` の認識フラグ/透過フラグのアサーションを更新。
3. `packages/cli/src/runner.ts` — `GameConfig` に表示専用の
   `onProgress?: (p) => void` を追加。各手番解決後(move/pass/skip/
   timeout)に {gameId, ply, maxPlies, team, agent, summary,
   outputTokensUsed(チーム別), outputTokenBudget, elapsedMs} を渡す。
   コールバック例外は握りつぶす(表示が対局を壊さない)。
4. `packages/cli/src/cli.ts`(表示側)— onProgress を1行フォーマットで
   stdout に流す: `[game-000] ply 17/100 B fable d4→d6 |
   out A 82k/250k · B 61k/250k | 12m3s`。予算はチームごとの値なので
   各チームを per-team budget と対応させて表示し、合算表示はしない。
   outputTokenBudget 未設定または usage telemetry の無い run(baseline
   等)ではトークン部分を丸ごと省略する(`unmetered` 等の飾りも
   付けない — 出せる事実だけを出す)。LLM・mixed(片側のみ計測)・
   baseline の3ケースの formatter テストを追加。直列・単一ゲームでも
   プレフィックス付きで統一(実装の分岐を増やさない)。
5. `packages/cli/src/publicarena-contract.ts` — `PublicGame` に additive:
   - `duration_ms: number` — **必須・非 null**。`buildPublicReplay` が
     game_start/game_end の ts を必須検証(欠損・不正・逆転は run ごと
     拒否)しているため、publishable run では常に算出可能。値は replay
     構築と同じ `assertTimestamp` 済み start/end から end−start を取り、
     events の重複解釈を避ける(publicreplay 側で検証済み値を返すか、
     同一 assert を通した再計算のどちらかに実装を一本化)。
   - `team_tokens: { A: SideTokens | null; B: SideTokens | null }`、
     `SideTokens = { output: number; total: number }`。取得元の契約:
     `output` = final.json `teams[].usage.outputTotalTokens`
     (reasoning 込みの in-game output 総量)、`total` =
     `inputTotalTokens + outputTotalTokens`(UsageAggregate に total
     フィールドは存在しないため加算で定義)。usage が未報告の side
     (baseline agent 等、reported calls 0 かつ両値 0)は side ごとに
     null。UI 文言は「思考トークン」ではなく reasoning 込み出力である
     ことと整合する表現(例: ja「出力トークン(思考込み)」)にする。
   - 上限アサーション(非負安全整数)を既存 assert 群に追加。
     `ARENA_MAX_BYTES` は現行余裕内(2フィールド×ゲーム数)、
     テストで実測を固定。
6. `packages/cli/src/publicarena.ts` — final.json と検証済み replay
   timestamp から上記を算出して詰める。verifyRun は不変。
7. テスト —
   - 並列: fake agent 2ゲームで両 game dir・summary が直列実行と同一
     内容(seed 決定性)になること。1ゲーム失敗時に他方が完走し
     failedGames=1 が返り、runPlay が exit 1 かつ submit 抑止になる
     こと。全件失敗・部分 game directory・agent ペア生成失敗時の全
     dispose。学習 spec(`claude-cli-learn` / `claude-cli-learn:opus`)を
     Team A・Team B のどちらに置いても直列フォールバックし、
     `claude-cli:opus` は誤マッチしないこと。
   - wizard: `--serial` が認識・透過されること(wizard.test.ts)。
   - onProgress: 手ごとに発火し、コールバック例外が結果に影響しない
     こと。
   - arena: fixture run で duration_ms / team_tokens が期待値になる
     こと。usage 未報告 side が null になること。timestamp 欠損・
     不正・逆転 run は(現行どおり)replay 検証で run ごと拒否される
     ことをテストで固定。canonical bytes が上限内であること。

### laplace-main(別リポジトリ・あちらの規約で実装)

8. `web/src/lib/bench/contracts`(相当)— `PublicGame` に optional の
   `duration_ms` / `team_tokens` を追加(欠損=旧 artifact を許容)。
9. `web/src/lib/bench/parseArenaCatalog.ts` — PublicGame の
   `hasExactKeys` 検証を新フィールド対応にする: 旧 artifact では両
   フィールド欠損を許容し、新 artifact では optional 値の形状
   (duration_ms: 非負安全整数、team_tokens: A/B キーのみ・各 side は
   null または {output,total} 非負安全整数)を検証。**両フィールドを
   知らないままだと新 catalog 全体が拒否される**ため、laplace-main 側
   デプロイは laplacebench の artifact 更新より先(または同時)に行う。
   BenchPublicResolver 系テストで旧形状・新形状の双方を通す。
10. `web/src/components/bench/BenchMatchupCard.tsx` —
   - GameRow の meta 行に所要時間(例: ja「所要 51分」/ en "51 min")と
     チーム別トークン(例: ja「出力トークン(思考込み) A 241k · B 169k」/
     en "output tokens (incl. thinking) A 241k · B 169k")を追加。
     フィールド欠損・null side は非表示。
   - 84行目の「見出し左は Team A/B」行を削除。

### 更新が要る既存アサーション(棚卸し)

- `packages/cli/test/publicarena.test.ts` / `publicreplay-meta.test.ts` —
  catalog 期待値スナップショットに新フィールドが入る。
- `packages/cli/test/wizard.test.ts` — 認識/透過フラグ一覧に `--serial`。
- `packages/cli/test/gate-rules.test.ts` 等が catalog バイト数・形状に
  依存していれば追随(実装時に grep で棚卸し)。
- cli.ts の usage/help 文字列(`--serial`・並列デフォルトの記述)。
- README / docs のうち play の直列前提記述(あれば)を追随。

## 検証

- `npm test`(workspaces)+ 型チェック。
- 実機 smoke: `laplacebench play --team-a random --team-b greedy
  --games 4` で並列実行・進捗行・summary 同一性を確認(LLM 不要の
  baseline で高速に検証)。`--serial` で従来出力。
- arena: 既存 community run を入力に `public-arena` を生成し、新
  フィールドの値(今回の run なら game-000 duration ≈ 51分、opus
  output 241,033)を実データと突合。
- laplace-main: 型チェック + ローカルで bench page を開き、新行の表示と
  「見出し左は」行の消滅を確認(旧 artifact = フィールド欠損でも壊れない
  こと)。

## ロールバック

- laplacebench: コミット revert のみ。並列化は artifact 意味を変えず、
  arena フィールドは additive なので、旧 CLI で再生成すればフィールドが
  消えるだけ。データ migration なし。
- laplace-main: UI コミット revert。optional フィールドなので contract
  の先行/遅延デプロイどちらの順でも壊れない。
