---
status: implemented
direction: direction-bounded-memo-harness
owner: bench
risk_tier: standard
last_updated: 2026-07-31
---

# 有界メモ持ち越し harness(codex-cli-memo)と memo vs persistent ablation

## Direction Brief

1. **Purpose** — persistent 条件の後半トークン膨張(Run 9 実測: 出力の95-96%が
   不可視 reasoning で、スレッド長にほぼ比例して毎手成長する「再導出税」。可視
   返答は毎手200-400バイトで一定)を、ハーネス側の仕組みで抑える。「見えない・
   無界の持ち越し」を「見える・有界の持ち越し」(最低限のフォーマットとルールを
   こちらから渡すメモ)に置き換え、コスト曲線を構造的に平坦化し、持ち越しの
   中身を初めて観測・監査可能な run artifact にする。

2. **Concept owner** — 新規 `packages/cli/src/agents/memo.ts` がメモ契約の
   canonical owner: メモの固定フォーマット指示文、キャップ(初期値1500字、実測で
   改訂する前提の宣言値)、注入位置、返答からの抽出構文(```` ```memo ```` fenced
   block)、不履行ポリシー、per-ply artifact 保存。`agents/cli.ts` の codex
   adapter は turn-reset 機構を再利用してメモの load/save フックを受けるだけ。
   HARNESS_CONDITIONS の宣言は catalog が持つ。メモ履歴の artifact は
   community 提出規則(.json/.jsonl のみ受理)に適合する **JSONL**
   (`memo/<gameId>/<team>.jsonl`、append-only、1 adapter 呼び出し = 1 レコード
   {ply, attempt, status, memo, revision})とし、Markdown は run 内に置かない。

3. **Lifecycle and scope** — メモは**1対局内**の手から手への持ち越しのみ
   (対局間持ち越しは learning 系の別概念で、今回作らない)。startGame(team,
   gameId) で空にリセットし、毎呼び出し fresh exec のプロンプトへ注入、返答から
   更新版を抽出、`runDir/memo/<gameId>/<team>.jsonl` へ append-only で全履歴を
   保存する。**attempt 意味論を事前登録する**: adapter の全呼び出し(修復
   attempt・timeout 含む)を1遷移とし、メモは毎返答で前進する(失敗 attempt の
   返答に含まれたメモも次呼び出しへ持ち越される — メモは model 自身の公開ノート
   であり、その正確性は記録对象であって referee 承認を待たない)。timeout /
   欠落は missing として前回維持。レコードは attempt 付きで追記され、上書きは
   起きない。実験1本
   (memo vs persistent)を事前登録・実測し FINDINGS Run 10 と community 台帳へ。
   claude 側 memo 変種、persistent 側へのプロンプト介入、per-turn ハードキャップ、
   メモ内容の質の採点、UI表示は作らない。

4. **Value hierarchy** — 出す数字がデータより強い主張をしない(H0+H1複合の宣言、
   run間比較の観察ラベル、n=4規律) > 持ち越しの観測可能性(メモは public
   artifact) > コスト曲線の平坦性 > メモ表現力(キャップは意図的に小さく始める)
   > 実験の実時間。封筒350kは据え置く — 上限の実証は今回の目的ではない
   (ユーザー明示。将来のpersistent系実験での500k引き上げは別判断として残す)。

5. **Adopted direction** —
   - **`codex-cli-memo`**(H1: prompt & memory): 毎手 fresh `codex exec`
     (コンテキスト = rulebook + 有界メモ + 全状態観測)。モデルは着手JSON +
     note + 更新済みメモ(````memo```` fenced block)を1返答で返す。
   - **メモの最低限ルール**(Run 7 の失敗モードから): seat不変語彙
     (「we / the opponent」、色・チーム文字への依存禁止)、固定4セクション
     (Position read / Our plan / Opponent tendencies / Lessons)、キャップ
     1500字。
   - **不履行ポリシー**(design-v0.1 §5 の note 方針と同型): メモ欠落・キャップ
     超過で**着手を失わせない**。当該呼び出しは「前回メモを維持」し、
     `memo_status`(updated / missing / over-cap-kept-previous)を **全 adapter
     呼び出し分** memo JSONL に記録し、採用された着手の分は move event の meta
     にも載せる。失敗 attempt の status も JSONL に残るため監査可能。
   - **境界は自動**: `codex-cli-memo` は RECOGNIZED / LLM_HARNESSES へ追加し、
     PUBLIC_MATCHUP_HARNESSES へは**追加しない** — 先日の fail-closed allowlist
     により追加作業ゼロで公開 matchup から外れ、既存の drift-guard ループテスト
     が自動的に本 harness を検証対象に含む。HARNESS_CONDITIONS へ宣言を追加
     (turn-scoped + bounded public memo carryover)。
   - **事前登録実験(主読み)**: `laplacebench play --team-a
     codex-cli:gpt-5.6-sol@medium --team-b codex-cli-memo:gpt-5.6-sol@medium
     --games 4 --swap --seed 42 --run-id
     harnesslab-sol56m-persistent-vs-memo-20260731`。Run 9 と同一プロトコル
     (4局・seed 42/1042/2042/3042・seat交互・max-plies 100・350k/team/game・
     timeout 1,200,000ms・並列・clean-room 既定)。停止規則 = 固定4局・途中打ち
     切りなし・再抽選なし。全滅時のみ別 run-id で1度再実行し別報告の
     availability 記録とする。直接対局の差は **H0+H1 複合**(コンテキスト寿命+
     メモ)として宣言し、個別要因に分解しない。
   - **事前登録の副次読み(Run 9 reset 腕との三角測量)**: (a) memo のコスト
     曲線を Run 9 の reset 曲線(平坦2-4k/手)と突合し、メモ生成コストの上乗せを
     測る。(b) memo vs persistent の勝敗・失敗署名を、同じ相手(persistent)・
     同じ seed 群に対する Run 9 の reset 成績(3-1、0.036 illegal/手)と並置する。
     (c) illegal 率(盤面ドリフトがメモで減るか)。これらは**run間の観察比較で
     あって直接対戦の主張ではない**とラベルする(persistent の実手は run 間で
     分岐する)。
   - 結果は verify 通過後に
     `community/runs/keisuke70--harnesslab-sol56m-persistent-vs-memo-20260731/`
     へコピーしてコミットし、FINDINGS Run 10 として n=4 規律で記録する。

6. **What disappears / is not protected** — persistent 側への「reasoning を
   控えめに」等の介入(条件定義の汚染を避け、別 revision 候補として残す)。
   対局間メモ持ち越し。claude 側 memo 変種。メモ内容の質の採点・自動評価。
   キャップ1500字の最適性(宣言値であり実測で改訂)。memo 条件の公開 matchup
   掲載。reasoning retention / compaction の直接制御。

## Tier: standard

新しい harness 挙動・spec・宣言(HARNESS_CONDITIONS)・artifact 形式を導入する
ため standard。公開境界は既存 allowlist の fail-closed 挙動に乗るだけで変更なし。
金銭・認可・不可逆操作・過去記録の再解釈なし。

## Source-of-truth and removal inventory

Search terms: `codex-cli-memo`, `memo`, `contextPolicy`, `turn-reset`,
`codexSessionPlan`, `HARNESS_CONDITIONS`, `RECOGNIZED_HARNESSES`,
`classifyRunnableAgentSpec`, `preludeProvider`, `note_omission`。

| Occurrence | Classification | Target |
|---|---|---|
| `agents/memo.ts`(新) | canonical(メモ契約) | フォーマット指示文・キャップ・抽出・不履行ポリシー・JSONL保存(attempt付き) |
| `agents/cli.ts codexCliAgent` | canonical(適用側) | turn-reset 機構を再利用する memo フック(prelude/onReply)+ **注入可能な runner dep**(テスト seam)+ pure な userText 合成関数の抽出 |
| `catalog.ts` | canonical(識別・宣言) | RECOGNIZED / LLM_HARNESSES に `codex-cli-memo`、HARNESS_CONDITIONS 追加。PUBLIC_MATCHUP_HARNESSES は不変 |
| `publicgames.ts classifyRunnableAgentSpec` | canonical(実行可否) | `codex-cli-memo` 追加(codex-cli より先にマッチ) |
| `cli.ts makeAgent` | 組み立て側 | memo case(runDir から MemoStore を構成) |
| `test/harness-boundary.test.ts` | 既存テスト | fail-closed ループが自動で memo を検証(追記不要なことを確認)。HARNESS_CONDITIONS drift guard も自動 |
| `test/memo-harness.test.ts`(新) | 新規テスト | 抽出・キャップ・不履行・注入・保存・spec 受理 |
| `packages/cli/FINDINGS.md` | 記録 | Run 10(実験後) |
| `community/runs/keisuke70--harnesslab-sol56m-persistent-vs-memo-20260731/` | 実測 artifact | verify 通過後にコピーしてコミット |
| `docs/harness-lab-direction-ja.md` §10 | derived doc | memo 変種を1行追記 |
| README scope 節 | derived doc | memo 変種の併記 |

## Concept model and invariants

- **メモは唯一の持ち越し**: memo 条件の各手のコンテキストは rulebook + 観測 +
  直前メモのみ。スレッド resume は決して行わない(codexSessionPlan の turn-reset
  経路を共有)。
- **メモは public**: 全手のメモが artifact に残り、隠れた持ち越しを作らない。
  private reasoning は今まで通り要求も表示もしない。
- **不履行は結果であって例外ではない**: メモ欠落・超過は着手を失わせず、
  記録される(note 方針と同型)。fail-closed が必要なのは境界(公開集計)で
  あって、対局内のメモ品質ではない。
- **キャップは宣言値**: manifest(HARNESS_CONDITIONS.mechanism)へ記録し、
  変更は harness revision の変更として扱う。
- **既存不変条件の継承**: rulebook / observation / action protocol / referee /
  envelope / timeout は他条件と共通。clean-room 既定もそのまま適用される。

## Implementation

1. **`agents/memo.ts`(新規)** — `MEMO_CHAR_CAP = 1500`、
   `MEMO_HARNESS_REVISION = "memo-v1"`、メモ指示文(固定4セクション・seat不変
   語彙・キャップ・fenced block 出力指定)、`extractMemo(text)`、
   `memoTurnPrelude(current)`(注入ブロック生成)、
   `applyMemoReply(prev, reply)` → {memo, status}(missing / over-cap は前回
   維持)、`MemoSession`(startGame リセット、現在メモ保持、
   `runDir/memo/<gameId>/<team>.jsonl` への attempt 付き append-only 記録)。
2. **`agents/cli.ts`** — `codexCliAgent` opts に `memo?: MemoSession` フックを
   追加。memo 指定時は contextPolicy を turn-reset として動かし、毎呼び出し
   instructions の後に memo prelude を注入、返答受領後(timeout 含む)に遷移を
   記録する。agent 名は `codex-cli-memo:...`。`memo_status` は AgentReply.meta
   へ載せ、既存の meta→move event 経路で記録する。あわせて (a) userText 合成を
   pure 関数へ抽出し、(b) subprocess 実行を opts で注入可能にする
   (既定は現行 run)— 実 CLI 起動なしで act() 全経路をテスト可能にする。
3. **`catalog.ts` / `publicgames.ts` / `cli.ts`** — spec 追加(識別・宣言・
   実行)。makeAgent の memo case が FileMemoStore を runDir から構成。
4. **docs** — harness-lab-direction §10 と README へ1-2行追記。
5. **実験(コード外)** — Brief §5 の事前登録コマンドを実行。verify →
   community 台帳コピー → FINDINGS Run 10。

## Tests and verification

- `test/memo-harness.test.ts`(新規):
  - extractMemo: fenced block 抽出(複数ブロック時は最後)、欠落 → missing。
  - applyMemoReply: キャップ内更新 / 欠落で前回維持 / 超過で前回維持 + status。
  - memoTurnPrelude: 初手(メモ無し)と2手目以降の注入形。
  - 指示文にキャップ値・4セクション・seat不変ルールが含まれる(drift guard)。
  - MemoSession: attempt 付き append-only JSONL(修復 attempt・timeout・
    double failure を含む遷移列で上書きが起きない)、startGame(team, gameId)
    リセット、失敗 attempt の status も残ること。
  - spec: `classifyRunnableAgentSpec("codex-cli-memo:gpt-5.6-sol@medium")` 受理、
    `parseAgentSpec` の harness 分解、`codex-cli` への誤マッチ無し。
  - **act() 経路(注入 runner・実 CLI なし)**: fake codex JSONL 応答で
    (i) resume 引数が決して現れない、(ii) 毎呼び出し instructions + memo
    prelude が userText に含まれる(pure 合成関数で検証)、(iii) メモ更新が
    次呼び出しの prelude に反映、(iv) memo_status が reply.meta に載る、
    (v) timeout 遷移で前回維持。
  - memo JSONL が community gate の許容拡張子(.jsonl)であることの整合
    (gate-rules に対する適合テストまたは既存 gate テストでの確認)。
- 既存回帰: `npm test` 全体。harness-boundary の fail-closed ループと
  HARNESS_CONDITIONS drift guard が memo を自動カバーすることを確認(テスト
  追記が不要である、が期待結果)。
- 実機: (a) bounded smoke `play --team-a codex-cli-memo:@low --team-b random
  --games 1 --max-plies 4` でメモの生成・注入・JSONL 保存・meta 記録を確認。
  (b) 事前登録実験 run 本体(memo JSONL が community コピーに含まれ gate に
  適合することも確認)。

## Failure and rollback

- 新 harness は追加のみで既存条件・公開境界に影響しない(allowlist 不変)。
- メモ抽出失敗は不履行として記録され対局は続く。実験 run の provider 失敗は
  availability failure として報告(Run 9 と同じ)。
- 実験全滅時のみ同条件・別 run-id で1度再実行(別報告)。

## Completion criteria

- memo-harness テスト + 全体回帰 green、bounded smoke でメモ artifact を確認。
- 事前登録実験が完走し、verify 通過・community 台帳収載・FINDINGS Run 10
  (主読み + reset 三角測量の副次読み、n=4 規律)。
- codex-impl-review APPROVED。
