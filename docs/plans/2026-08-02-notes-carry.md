---
status: implemented
direction: direction-notes-carry-accepted-only
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# notes-carry harness(codex-cli-notes): 追記専用・自己宛て・無構造の公開持ち越し

## Direction Brief

1. **Purpose** — 「私的に持ち越す(persistent) vs **公的に持ち越す(notes)** vs
   持ち越さない(reset)」の第3腕(direction doc §0.6)。アリーナが既に全手で
   生産している公開出力(p3 の着手ノート)だけを運び、外化された思考の持ち越しが
   内部推論の持ち越しにどこまで迫れるかを測る。

1.5 **Direction sessions** — 初回対話 `direction-notes-carry`(ACCEPT)+
   採用方向の1要素を新事実で正した correction
   `direction-notes-carry-accepted-only`(受理)。両 trace は同一裁定ログ
   (2026-08-02-notes-carry.md)にある。frontmatter は挙動を支配する correction
   セッションを指す。

2. **Concept owner** — 新規 `packages/cli/src/agents/notes.ts` が notes 契約の
   canonical owner: 告知文、抽出・切り詰め規則、注入形、NotesSession。codex
   adapter は memo と同型のフックで適用するだけ。宣言は catalog の
   HARNESS_CONDITIONS。

3. **Adopted direction** —
   - **介入の本体は持ち越し契約の告知**(実測根拠: 素の note は中央値200-300字
     で、告知なしでは「効かない」と「運ぶ中身が無い」を切り分け不能)。毎手の
     プロンプトに過去ノート一覧と告知を注入する。告知は
     「あなたが各手の後に書いたノートが下に示されている。今手のノートも同じ
     ように未来の自分に見せられる、唯一の記憶である。未来の自分に必要なことを
     書け」の趣旨で、**書式・セクション・長さの示唆は一語も含めない**
     (memo との対比軸「生の蓄積 vs 設計された記憶」の生命線)。
   - **腕の定義**: 追記専用・自己宛て・無構造のジャーナル。**件数キャップなし**
     (無界なのは件数)。1件の切り詰めは観客記録と同じ 2500 字 —
     「持ち越し⊆公開記録」ではなく**「持ち越し=公開記録」を等式で保つ**ための
     切り詰め位置(public チャネル宣言を検証可能な主張にする)。
   - **実装規則(direction correction 済み: 採用ノートのみ)**: 運ぶのは
     **採用された着手の note だけ**。runner の公開記録は採用 move の note を
     extractNote + Unicode スカラー 2500 切りで全文記録する一方、format 失敗
     attempt は raw 先頭 500 UTF-16 単位のみ・legality 失敗は raw 無記録のため、
     失敗 attempt を運ぶと等式が壊れる(却下手のノートは未来の自分を誤導する
     持ち越しでもある)。切り詰めは**共有関数 `recordedNote(raw)`**
     (extractNote + `[...].slice(0, MAX_COMMENTARY_SCALARS)`)へ抽出し、
     runner と NotesSession の両方が同じ関数を使うことで等式を構築的に保証する。
     受理検出は推測ではなくレフェリー由来: `TurnInput.recent` には自チームの
     move / pass イベントが含まれる(runner 実装で確認)。各返答の note は
     ply 単位で stage(同 ply の attempt 2 は上書き)し、次の act の冒頭で
     recent を解決 — 自分の move(ply 一致)が現れたら確定、pass なら破棄。
     **pass は note フィールドを持たない**(自発的 pass はプロトコルに存在せず、
     4種の強制 pass のみ)ため「採用された着手の note」=「公開記録に全文
     載った note」の同値が成立する — 将来 pass-with-note が導入されたら
     この線引きは再考を要する(根拠として明記)。最終手の staged note は
     次 act が無く未確定のまま消えるが、注入先の手も存在しないため無害。
     startGame でリセット(対局内のみ)。
   - **機構は memo と同型**: `codexCliAgent` の notes フック(turn-reset 基盤・
     fresh exec・resume なし)。memo と notes の同時指定はエラー。agent 名
     `codex-cli-notes:...`。`prelude()` は {text, count} を返し、
     `meta.notes_carried` には**この呼び出しに注入した件数**(record 前の
     確定件数)を載せる — 追記後件数と混同しない。
   - **専用 artifact は作らない**(運ぶ中身は events の採用 move イベントの
     note と同一 — recordedNote による構築的等式)。
   - **境界は自動**: RECOGNIZED / LLM_HARNESSES へ追加、PUBLIC_MATCHUP_HARNESSES
     には載せない(fail-closed)。`assertTurnScopedCleanRoom` の対象に追加
     (ambient 拒否 = clean-room 衛生)。HARNESS_CONDITIONS へ宣言:
     context_lifetime「turn-scoped + append-only public move-note carryover」、
     retention「discarded except own past move notes (public, uncapped count,
     2500 chars/note = spectator-record equality)」、compaction「n/a」。
   - **実装は Opus 5 サブエージェントへ委譲**(参照実装: agents/memo.ts と
     memo-harness.test.ts)。レビュー・コミットは orchestrator。

4. **Value hierarchy** — 対比軸の純度(書式指示ゼロ) > 等式(持ち越し=公開
   記録) > 実装の memo 同型性(新機構を作らない) > 注入コスト(無界件数は
   測定対象であり、上限撤廃方針と整合)。

5. **What disappears / is not protected** — notes への書式・構造・長さ指示。
   件数・総量キャップ。notes 専用 artifact。claude 側変種。ambient 実行。
   対局間の持ち越し(learning 系の別概念)。persistent との差の個別要因分解
   (H0+H1 複合として宣言)。

## Tier: standard

新 harness 挙動・spec・宣言の追加。公開境界は既存 allowlist の fail-closed に
乗るのみ。金銭・認可・不可逆なし。

## Source-of-truth inventory

Search terms: `codex-cli-notes`, `notes`, `extractNote`, `memo`,
`assertTurnScopedCleanRoom`, `HARNESS_CONDITIONS`, `classifyRunnableAgentSpec`。

| Occurrence | Classification | Target |
|---|---|---|
| `agents/notes.ts`(新) | canonical(notes 契約) | 告知文・抽出/切り詰め・注入形・NotesSession |
| `agents/cli.ts codexCliAgent` | 適用側 | notes フック(memo と同型・排他)・specHead 分岐・meta |
| `prompt.ts`(共有関数)+ `runner.ts`(利用側へ refactor)+ `publicarena-contract.ts`(MAX_COMMENTARY_SCALARS 源) | canonical(等式の実装) | `recordedNote(raw)` 抽出、runner の note 記録を同関数へ置換(挙動不変・既存 runner テスト green) |
| `catalog.ts` | 識別・宣言 | RECOGNIZED/LLM_HARNESSES + HARNESS_CONDITIONS 追加 |
| `publicgames.ts` | 実行可否 | classify に codex-cli-notes(codex-cli より先にマッチ) |
| `cli.ts` | 組み立て・衛生 | makeAgent case + assertTurnScopedCleanRoom へ追加 |
| `test/notes-carry.test.ts`(新) | 新規テスト | 下記 |
| `test/harness-boundary.test.ts` / HARNESS_CONDITIONS drift guard | 既存テスト | 自動カバー(追記不要が期待結果) |
| `docs/harness-lab-direction-ja.md` §0.6 | derived doc | 実装済み注記 1 行 |
| README scope 節 | derived doc | notes 変種の併記 1 行 |

## Implementation

0. `prompt.ts` に `recordedNote(raw: string): string`(extractNote +
   `[...].slice(0, MAX_COMMENTARY_SCALARS).join("")`)を新設し、`runner.ts` の
   move イベント note 記録を同関数へ置換(挙動不変 refactor。
   publicarena-contract の MAX_COMMENTARY_SCALARS が単一の切り詰め源)。
1. `agents/notes.ts`: `NOTES_HARNESS_REVISION = "notes-v1"`、告知文定数
   (denylist 検証を受ける)、`notesTurnPrelude(entries)`、
   `NotesSession { startGame(team, gameId); resolve(recent: RecentEvent[]):
   void(staged を own move で確定 / own pass で破棄); prelude(): { text,
   count }(確定済みのみ注入、count = 注入件数); stage(replyRaw, ply): void
   (同 ply の再 stage は**空でも常に置換** — 後の attempt が却下ノートを
   生き残らせないため。resolve は現在の staged が**非空のときのみ**確定する) }`。
   確定リストは追記専用。
2. `agents/cli.ts`: opts.notes?: NotesSession。memo と同時指定は throw。
   notes 指定時は policy=turn-reset・specHead=codex-cli-notes。act() の呼び出し
   順序: (a) `resolve(input.recent)` → (b) `const { text, count } = prelude()`
   で userText 組み立て(instructions + 告知込み prelude + turn)→ (c) 返答
   受領後 `stage(raw, input.ply)`(timeout / CLI_ERROR の raw も stage 経路に
   入るが、その ply は pass になるため resolve で破棄される)→ (d)
   `meta.notes_carried = count`(record 前の確定件数)。
3. `catalog.ts` / `publicgames.ts` / `cli.ts`: 登録3点 + ambient ガード追加。
4. docs 2 行。plan status 更新・裁定ログ追記(orchestrator)。

## Tests and verification

- `test/notes-carry.test.ts`(新規、memo-harness.test.ts を雛形に):
  - 告知文 drift guard: 「未来の自分に必要なことを書け」趣旨の告知を含み、
    次の**明示 denylist を1語も含まない**こと(case-insensitive で全 token を
    個別 assert): format, structure, structured, section, heading, header,
    bullet, list, template, schema, outline, length, character, characters,
    word count, concise, 書式, 形式, 構造, セクション, 見出し, 箇条書き,
    文字数, 長さ, 簡潔。
  - `recordedNote`: 非BMP(サロゲートペア)を跨ぐ over-cap でスカラー単位の
    切り詰めが runner の記録と一致すること。runner が同関数を使うことの
    source-level drift guard(help 補間 guard と同型)。
  - NotesSession: stage → recent の自分 move で確定 / pass で破棄 / 同 ply
    attempt 上書き・確定分は追記専用・**空 note は pending を置換/クリアするが
    確定・注入は決してされない**・startGame リセット。
  - spec: parse / classify / codex-cli への誤マッチなし。
  - act() 経路(注入 runner + recent を模した TurnInput): resume 引数が決して
    現れない、毎呼び出し instructions + 告知 + 過去ノートが userText に含まれる、
    1手目のノートが recent の自分 move 到着後の 2手目 prelude に現れる、
    format/legality 失敗 attempt の note は運ばれない(recent が pass のとき
    破棄される)、**非空ノートの失敗 attempt 1 → note 無しの採用 attempt 2**で
    却下ノートが運ばれない(空置換 + 非空のみ確定)、timeout raw が stage
    されても pass 解決で消える、
    meta.notes_carried が turn1=0 / turn2=1 / 空返答 / 失敗 attempt の各例で
    正しい、memo+notes 同時指定が throw。
  - ambient 拒否: assertTurnScopedCleanRoom が codex-cli-notes を拒否。
- 既存回帰 `npm test` 全体(boundary ループと HARNESS_CONDITIONS drift guard が
  自動で notes をカバーし、テスト追記不要であることを確認)。
- 実機 smoke(orchestrator 実施): `play --team-a codex-cli-notes:@low --team-b
  random --games 1 --max-plies 4` で告知注入・ノート持ち越し・meta 記録を確認。

## Failure and rollback

- 新 harness 部分は追加のみ(登録3点とフックの除去で戻る)。`recordedNote`
  refactor は runner の挙動不変置換であり、ロールバック時は runner のインライン
  切り詰めへ戻す(既存 runner テストが両方向の等価性を保証)。

## Completion criteria

- 新テスト+全体回帰 green、実機 smoke で持ち越しを確認。
- codex-impl-review APPROVED。
