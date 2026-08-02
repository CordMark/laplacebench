---
status: implemented
direction: direction-notes-guided
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# notes-guided: 目的+引き継ぎを明示させる notes 変種

## Direction Brief

1. **Purpose** — ユーザー仮説: 「引き継ぐべき情報をゲームの性質から明示すれば
   結果が変わる。毎手この手の目的と次に引き継ぐべきものを明示的に引き継がせる
   notes 形式が一番強いかも」。無指示の notes-v1 と、内容方向づけを持つ
   notes-guided を並べ、指示の純効果と実用システム比較を測る。

2. **Concept owner** — `agents/notes.ts` に guided 用の告知文定数を追加
   (機構 — NotesSession・recordedNote 等式・採用ノートのみ・無界件数 — は
   **完全共有**)。spec: `codex-cli-notes-guided`。

3. **Adopted direction**(direction 対話で確定済み) —
   - 告知の差分のみ: 「ノートには (a) この手の目的、(b) 次の手番の自分が
     知っておくべきこと、を書け」。LAPLACE 固有の戦術示唆(center 等)は
     含めない。**書式・見出し・長さ指示はゼロ維持**(既存 denylist を guided
     告知にも適用 —「目的・引き継ぎ」は内容方向づけであって書式ではない)。
   - **比較ラベル**: guided vs v1 = 指示の純効果(同機構・告知のみ差)。
     guided vs persistent = **システム比較**(要因分解を主張しない)。
     対称比較の完成形 **guided-notes vs primed-persistent は次セット本命**
     (今回は実装しない)。
   - 登録: RECOGNIZED / LLM_HARNESSES / HARNESS_CONDITIONS / classify
     (codex-cli より先)/ makeAgent / assertTurnScopedCleanRoom。
     PUBLIC_MATCHUP_HARNESSES には載せない(fail-closed 自動)。
   - 実験(事前登録、実装後・**この固定順で直列**):
     ```
     laplacebench play --team-a codex-cli-notes-guided:gpt-5.6-sol@medium \
       --team-b codex-cli-notes:gpt-5.6-sol@medium \
       --games 4 --swap --seed 42 --run-id harnesslab-sol56m-guided-vs-notes-20260802
     laplacebench play --team-a codex-cli-notes-guided:gpt-5.6-sol@medium \
       --team-b codex-cli:gpt-5.6-sol@medium \
       --games 4 --swap --seed 42 --run-id harnesslab-sol56m-guided-vs-persistent-20260802
     ```
     上限なし・clean-room・max-plies 100・打ち切りなし・再抽選なし。全滅時のみ
     別 run-id で1度再実行し、**元 run は availability 記録として残し、両 run の
     局を pool しない**。verify→台帳→curated list→FINDINGS Run 17/18
     (n=4 規律・seat 支配時は W-L 無信号と明記)。
   - 実装は Opus 5 サブエージェント(worktree)。

4. **What disappears** — guided と v1 の同時指定(排他)。ゲーム固有戦術注入。
   persistent+primer(次セットへ順序付け)。claude 側変種。

## Tier: standard

新 spec・告知定数・登録の追加のみ。機構・境界・公開契約は不変。

## Inventory

| 対象 | 変更 |
|---|---|
| `agents/notes.ts` | **不変の variant 設定オブジェクト** `NotesVariant = { announcement, revision, specHead }` を導入し、`NOTES_V1` / `NOTES_GUIDED` の2定数を export。`notesTurnPrelude(entries, variant = NOTES_V1)` と `NotesSession(variant = NOTES_V1)` — **variant は省略可の既定引数**で、既存呼び出し(`new NotesSession()` / `notesTurnPrelude(entries)`)は無変更で動く。`NOTES_ANNOUNCEMENT` / `NOTES_HARNESS_REVISION` は `NOTES_V1` のフィールドへの**後方互換 alias として残す**(stage/resolve/recordedNote 等式・lifecycle は一切分岐しない)。v1 の挙動は byte 不変で、`test/notes-carry.test.ts` は**無編集のまま green**(それ自体が不変性の証明 — inventory に検証項目として明記) |
| `agents/cli.ts` | `opts.notes?: NotesSession` は不変のまま、specHead を `notes.variant.specHead` から取得(codexCliAgent 側の分岐追加なし)。memo との排他は既存のまま |
| `catalog.ts` / `publicgames.ts` / `cli.ts` | 登録3点 + ambient ガード |
| `test/notes-carry.test.ts` | **無編集**(既存 v1 assertions が green のままであることを不変性の証拠とする) |
| `test/notes-guided.test.ts`(新) | 告知 denylist(既存リスト全 token)+「目的」「次の手番」を含む positive・spec 受理・act() 経路で guided 告知が毎手注入・v1 と guided の排他・boundary/conditions drift guard 自動カバー確認 |
| `docs/harness-lab-direction-ja.md` §0.6 | guided 変種の1行(実装後) |
| `README.md` variants 文 | guided の併記1行 |
| `packages/cli/FINDINGS.md` | Run 17/18(実験後) |
| `community/runs/keisuke70--harnesslab-sol56m-guided-vs-notes-20260802/`・`…-guided-vs-persistent-20260802/`+`community/harnesslab-experiments.json` | verify 後コピー+2件追記 |

## Tests / verification

上記新テスト+全体回帰 green。実機 smoke(guided:@low vs random 4手)で告知注入
確認は orchestrator。

## Failure / rollback

追加のみ。登録とフックの除去で戻る。

## Completion criteria

新テスト+回帰 green・smoke・実験2 run の完走と FINDINGS・impl review APPROVED。
