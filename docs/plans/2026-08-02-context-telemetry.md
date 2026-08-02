---
status: implemented
direction: direction-context-telemetry
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# Persistent 対局の context telemetry(compaction 観測装置)

## Direction Brief

1. **Purpose** — provider の自動 compaction(codex: `context_compacted`、claude:
   `compact_boundary`)が我々の対局でいつ・何回発火したかを観測可能にする。
   ARC-AGI-3 記事の設定2の観測装置。現行 telemetry は1手内の複数内部コールを
   合算するためスレッド実サイズを導けず、rollout/転写は cleanup で消えるため、
   上限なしの長期戦で圧縮が起きても記録に残らない。

2. **Concept owner** — 新規 `packages/cli/src/contexttelemetry.ts` が
   `laplace-context-telemetry-v1` の canonical owner: 両 provider のマーカー
   解析、セッション成果物の所在解決、`games/<id>/context-telemetry-<team>.json`
   の形。adapter(agents/cli.ts)は endGame で収穫を呼ぶだけ。

3. **Lifecycle and scope** — 対象は clean-room 対局の persistent 系 adapter
   (codex-cli / claude-cli / claude-cli-learn)。endGame 時に隔離ホーム内の
   自スレッド rollout / 自セッション転写を解析し、抽出値だけを run artifact に
   書く。**生 rollout / 生転写は run へ保存しない**(全プロンプト+暗号化
   reasoning を含み、公開境界の provider-payload 除外と整合しないため)。
   reset / memo(毎手 fresh、単発コール内圧縮は実運用上想定外)と ambient 対局
   (ホーム位置を制御していない)は対象外。過去 run への遡及なし。UI 表示なし。

4. **Value hierarchy** — 観測の正直さ(取得失敗・形式不明を "not-found" /
   "marker-format-unknown" として記録し、対局は止めない — telemetry は追加観測
   であり対局契約ではない) > 公開境界(抽出値のみ) > 実装の軽さ > 網羅性
   (reset/memo/ambient は対象外で良い)。

5. **Adopted direction** —
   - **実物で確認済みのマーカー形式**(2026-08-02 検証)を解析する:
     - codex rollout(`$CODEX_HOME/sessions/**/rollout-*<threadId>.jsonl`):
       `payload.type == "context_compacted"`(回数・位置)と
       `payload.type == "token_count"` の `info.model_context_window` +
       `info.last_token_usage`(コール毎の input/cached/output/reasoning 系列
       — これで1手内の内部コール数とスレッド実サイズが初めて分離できる)。
     - claude 転写(`$CLAUDE_CONFIG_DIR/projects/*/<sessionId>.jsonl`):
       `type=="system" && subtype=="compact_boundary"` の
       `compactMetadata`(trigger: auto|manual、preTokens、postTokens)。
       あわせて転写バイト数を記録。
   - adapter は対局中に**観測できた全** threadId / sessionId を追跡し(timeout
     再開で複数になり得る)、endGame(info) の eventsPath から gameDir を導いて
     `context-telemetry-<team>.json` を書く。
   - **id 追跡の実装規則**: codex は timeout 分岐で return する**前に** stdout を
     解析して thread.started を記録する(kill 済み呼び出しでも部分 stdout に
     現れることが多い)。id が観測できなかった timeout は `unobserved_timeouts`
     カウンタとして正直に記録する(その呼び出しの rollout は home に存在し得るが
     並列 game・canary の rollout と区別できないため推測で拾わない)。claude の
     sessionId は**こちらが生成**するため構造上すべて既知(この非対称も設計事実
     として記す)。
   - **schema と status 意味論**: artifact は per-source の records を持つ —
     `sources[]: {id, file, status, skipped_lines, ...抽出値}`。
     - `ok`: ファイルを読み解析できた(壊れた個別行は読み飛ばし、
       `skipped_lines` に計上 — 行スキップは status を変えない)。
     - `not-found`: その id のファイルが所在しない。
     - `parse-error`: ファイル IO / 全体読解の失敗。
     - `marker-format-unknown`: **既知マーカーの構造劣化を検出したときのみ**
       (codex: token_count はあるが全イベントで `info.model_context_window`
       欠落、または context_compacted の payload 形状不一致。claude:
       compact_boundary はあるが `compactMetadata` 欠落/形状不一致)。
       マーカー名ごと変わる全面改名は検出不能で、compaction 0 と区別が
       つかない — これは schema の文書化された限界とする(発見手段は将来の
       実地照合)。
     - top-level `status` は sources の最悪値
       (parse-error > marker-format-unknown > not-found > ok)、
       `complete: boolean` は全 source ok のとき true。
     top-level には集計値
     `{schema, provider, harness, ids, unobserved_timeouts,
     model_context_window, compaction_count, compactions[],
     token_counts[](codex), transcript_bytes(claude)}` を持つ。
   - **compaction 発火は観測であって identity ではない**(proxy 裁定 CHANGE 込み
     ACCEPT): HARNESS_CONDITIONS は当初から compaction を provider-managed
     (opaque) と宣言しており、persistent 条件の定義に provider 圧縮の可能性が
     含まれる。発火の有無で harness を分裂させると provider が制御する事象で
     対戦者 identity が変わる不安定な契約になる。
   - claudeCliAgent にも codex 同様の injectable runner(テスト seam)を追加。
6. **What disappears / is not protected** — 生 rollout / 生転写の保全。
   reset / memo / ambient / anthropic-API 対局の context telemetry。過去 run への
   遡及。UI 表示。マーカー形式の将来互換 — 検出できるのは**既知マーカーの
   構造劣化のみ**で、マーカー名ごと変わる全面改名は compaction 0 と区別できない
   (文書化された限界)。**compaction 発火は公開 matchup
   適格性・harness_conditions・対戦者 identity の何にも影響しない(設計判断)。
   発火済み対局が persistent の成績に含まれるのは意図であり、分離が必要な分析は
   per-game telemetry で事後に行う。**

## Tier: standard

新しい run artifact(schema)と adapter の endGame 挙動を追加するため standard。
対局結果・公開境界・金銭・認可・不可逆操作の変更なし。

## Source-of-truth and removal inventory

Search terms: `context-telemetry`, `context_compacted`, `compact_boundary`,
`token_count`, `model_context_window`, `endGame`, `threadId`, `sessionId`,
`rollout`, `dispose`。

| Occurrence | Classification | Target |
|---|---|---|
| `contexttelemetry.ts`(新) | canonical(schema・解析・所在解決) | 新設 |
| `agents/cli.ts` codex/claude agent | 適用側 | id 追跡と endGame 収穫。claude に injectable runner 追加 |
| `agents/learning.ts` | derived(base 経由) | base.endGame が収穫(変更なしを確認) |
| `cleanroom.ts` | 前提(ホームは run 終了まで生存) | 変更なし — endGame は cleanup より前(runner が endGame→dispose→run 終了後 cleanup) |
| `test/context-telemetry.test.ts`(新) | 新規テスト | 解析・所在解決・endGame 統合(fake home/runner) |
| `docs/harness-lab-direction-ja.md` §3 | derived doc | 圧縮イベント記録の実装済み注記 1 行 |
| 過去 run | snapshot/history | 不変(telemetry なし=旧計測期) |

## Concept model and invariants

- **telemetry は追加観測**: 収穫失敗は status に正直に記録され、対局結果・
  exit code・公開適格性に影響しない。
- **抽出値のみ**: プロンプト本文・reasoning 本文・暗号化 blob は telemetry に
  含めない(数値・種別・タイムスタンプ・トークン数のみ)。
- **観測できた id は全て保持**: timeout 再開で生じた複数スレッド/セッションの
  うち観測可能なものを全て解析・列挙する。id が観測できなかった codex timeout は
  `unobserved_timeouts` として数えるだけで、推測での収穫はしない(claude は
  client 生成のため常に全数既知)。
- **収穫のタイミング**: endGame(runner が全 exit path で dispose より前に呼ぶ
  のは endGame ではなく… endGame は正常終了時のみ)— 収穫は endGame で行い、
  異常終了した game の telemetry は残らないことを許容する(観測装置の限界として
  文書化)。隔離ホームは run 終了後まで生存するため endGame 時点で必ず読める。

## Implementation

1. **`contexttelemetry.ts`(新規)** — `CONTEXT_TELEMETRY_SCHEMA =
   "laplace-context-telemetry-v1"`、`parseCodexRollout(lines)`、
   `parseClaudeTranscript(lines)`、`locateCodexRollouts(home, threadIds)`、
   `locateClaudeTranscripts(configDir, sessionIds)`、
   `harvestContextTelemetry(opts)`(所在→解析→JSON 組み立て、fail-soft)、
   `writeContextTelemetry(gameDir, team, data)`。
2. **`agents/cli.ts`** — codexCliAgent: threadIds 配列を追跡(thread.started
   毎に push)。claudeCliAgent: sessionIds 配列を追跡(startGame とtimeout 再開の
   uuid() 毎に push)+ injectable runner 追加。両者の endGame(info) で
   isolation があり persistent 系のときのみ harvest→write。
3. **docs** — harness-lab-direction §3 の結果面リストに実装済み注記。
4. 本 plan の status 更新、裁定ログ追記。

## Tests and verification

- `test/context-telemetry.test.ts`(新規):
  - parseCodexRollout: 実形式の合成 fixture(token_count / context_compacted /
    無関係イベント混在)→ window・compaction 数・系列。マーカー欠落 → count 0 と
    status ok、壊れ JSON 行 → 読み飛ばし、ファイル無し → not-found。
  - parseClaudeTranscript: compact_boundary(auto/manual)fixture →
    trigger/preTokens/postTokens 抽出。マーカーなし → 0。
  - locate: fake home に rollout/転写を置き、threadId/sessionId で解決。
    複数 id、見つからない id の混在。
  - **status 意味論の全ケース**: ok / not-found / parse-error /
    marker-format-unknown(構造劣化 fixture)それぞれ、および **mixed
    multi-id**(1つ ok + 1つ not-found → top-level status=not-found・
    complete=false、skipped_lines>0 でも status=ok)を個別に検証。
  - endGame 統合(injectable runner・実 CLI なし): codex agent が fake
    thread.started で threadIds を溜め、fake home の rollout を endGame で
    解析して gameDir へ JSON を書くこと。claude agent 同様(fake 転写)。
    isolation 無し(ambient)や reset/memo では書かないこと。
  - **timeout→再開の id 保全**: codex fake runner が「thread.started を含む
    stdout + timedOut=true」を返すケースで、timed-out id が retained され、
    次 act の新 thread id と両方 telemetry に載ること。thread.started が
    stdout に無い timeout では `unobserved_timeouts` が増えること。claude は
    timeout 後の session 回転で新旧両 uuid が ids に載ること。
- 既存回帰: `npm test` 全体。
- 実機 smoke: clean-room の bounded 対局(codex@low vs random、2手)で
  `context-telemetry-A.json` が生成され、window 値が入り compaction_count=0 で
  あることを確認。
## Failure and rollback

- 収穫は try/catch で対局結果に影響しない。ロールバックは adapter の
  endGame フック除去のみ(artifact は additive)。
- provider 形式変化のうち既知マーカーの構造劣化は "marker-format-unknown"、
  ファイル読解不能は "parse-error" として顕在化する。全面改名は検出不能
  (compaction 0 と同じに見える)— 将来の実地照合で発見する文書化された限界。

## Completion criteria

- 新テスト+全体回帰 green、実機 smoke で telemetry JSON 確認。
- codex-impl-review APPROVED。
