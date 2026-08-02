---
status: implemented
direction: direction-commentary-arrows
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# publishableNote: 「recorded ⇒ publishable」の構成的保証

## Direction Brief

1. **Purpose** — 公開 commentary の守り(`UNSAFE_COMMENTARY`)が `->` を含む
   note を publish 時に拒否し、contract 自身が謳う「recorded は常に
   publishable」が破れている(memo run の 3/4 局で実証。G3 の curated list
   収載も塞ぐ)。拒否パターンの狭め(確率的)ではなく、**導出と抑制による
   構成的保証**へ移す。

2. **Concept owner** — `prompt.ts` の `recordedNote` が note 導出の canonical
   owner のまま、その内部に **`publishableNote(text)`**(公開整形)を組み込む。
   validator(`publicarena-contract.ts`)は不変で backstop に降格。

3. **Adopted direction** —
   - **`publishableNote(text)`(冪等・決定論)**: (1) `->` → `→`、`<-` → `←`
     (意味保存の記号正規化)、(2) 残る `<` → `‹`、`>` → `›`。出力に `<>` は
     決して現れない。
   - **記録時(構成的保証の本体)**: runner の note 記録は
     `truncate(publishableNote(extractNote(raw)))`。適用後に URI パターン
     (validator と同一の `\b(?:https?|ftp|data|javascript|mailto):|\bfile:(?=\S)`)
     が**依然マッチする場合は note を空へ抑制**し、move イベントへ
     `note_suppressed: "uri"` を記録して独立の reliability 指標に数える
     (note 方針「note の不備は手番を失わせない」との唯一の整合形 —
     fail-loud の音は対局失敗ではなく記録された抑制イベント)。verbatim は
     move イベントの `raw` に従来どおり残る(note はもともと導出フィールド)。
   - **publish 時**: buildPublicReplay の commentary 構築で同じ
     `publishableNote` を適用(冪等なので二重適用は無害)。これにより
     **記録済みの過去 run(矢印 note の Run 12-14・memo run)も公開可能**に
     なる。保存済み events は不変。URI を含む過去 note が publish 時に現れた
     場合は従来どおり validator が fail-loud(救済しない — 抑制は記録時の
     規則であり、過去 run の note を publish 側で空に書き換えるのは記録の
     改変に当たるため。現台帳に URI note は存在しないことを実装時に走査確認)。
   - **validator は全クラス不変**(`[<>]` も URI も)— 発火し得ないはずの
     backstop。発火＝導出/抑制のバグとして生成停止。
   - **notes-carry との一貫性**: 抑制を canonical 導出
     (`recordedNoteWithCause`)の内部に置き、`recordedNote` はその `.note`
     別名とする。NotesSession は変更ゼロのまま URI note を運ばない(導出が
     空を返し、空は確定しない既存規則)— 等式は byte 単位で構成的に維持。
     採用された URI note がイベントで空・持ち越しにも不在、の regression を
     置く。
   - **マージ順序の制約(pre-registration 保護)**: G3(Run 12-14)が実行中の
     ため、本スライスの実装は **worktree で行い、G3 の全 run 完走後に main へ
     マージ**する(Run 14 だけが新導出で記録される事態を防ぐ)。
   - 実装は Opus 5 サブエージェント(worktree)。レビュー・マージ・コミットは
     orchestrator。

4. **Value hierarchy** — 構成的保証(確率的な守りにしない) > note 方針
   (不備が手番を失わせない) > 記録の不改変(verbatim raw 残置・過去 events
   不変・publish 側での note 書き換えをしない) > 実装の単純さ(1関数を両境界で
   共有) > 表示の自然さ(矢印は `→` になる)。

5. **What disappears / is not protected** — laplace-main の変更・鏡像 validator
   の協調・deploy 順序制約(すべて不要化)。パターン狭め案。`[<>]` を含む note
   の原文どおりの公開(`‹›`/`→` へ導出される — verbatim は raw)。URL 入り
   note の公開と notes-carry への持ち越し(抑制規則で両方から消える、理由は
   記録される)。過去 run の URI note の publish 側救済(存在しないことを確認の
   上、しない)。

## Tier: standard

公開 commentary の導出規則(通常挙動・公開契約の実装側)を変更するため
standard。validator 契約・保存済み events・金銭・認可・不可逆は不変。

## Source-of-truth inventory

Search terms: `publishableNote`, `recordedNote`, `UNSAFE_COMMENTARY`,
`assertCommentaryText`, `note_suppressed`, `noteOmissions`, `moveCommentary`。

| Occurrence | Classification | Target |
|---|---|---|
| `prompt.ts recordedNote` | canonical(導出) | publishableNote 組み込み + URI 抑制判定の分離関数 |
| `runner.ts` note 記録 | 適用側 | 抑制時 `note_suppressed: "uri"` を move イベントへ + 独立カウンタ(metrics へ) |
| `publicreplay.ts buildPublicReplay` の commentary 再構築 | publish 側適用(唯一の適用点 — arena / harnesslab が共有) | 同一 publishableNote を適用(冪等) |
| `publicarena-contract.ts` | validator(**検証意味論は不変**) | URI サブパターンを `COMMENTARY_URI_SOURCE` として export し UNSAFE_COMMENTARY を同ソースから組み立て(定数編成のみの変更、parity テストで意味論不変を証明) |
| `metrics.ts` | 指標 | note_suppressed 数の集計(noteOmissions と区別) |
| `agents/notes.ts` | 等式の相手側 | 変更不要(recordedNote 経由で自動一貫)— 確認のみ |
| `test/publishable-note.test.ts`(新) | 新規テスト | 下記 |
| 既存 test(movenote / publicreplay-validate / notes-carry) | 回帰 | green 維持(notes-carry の等式テストが新導出でも成立) |
| 現台帳の URI note 走査 | 事前確認 | 存在しないことを実装時に確認し報告 |

## Implementation

1. `prompt.ts`: `publishableNote(text)`(冪等変換)。**canonical は
   `recordedNoteWithCause(raw): { note: string; suppressed: "uri" | null }`**:
   truncate(publishableNote(extractNote(raw))) を作り、URI パターンが依然
   マッチすれば `{ note: "", suppressed: "uri" }` を返す(抑制が導出の一部)。
   既存 `recordedNote(raw)` は `recordedNoteWithCause(raw).note` の別名として
   残す — **NotesSession は変更ゼロで URI note を運ばない**(空は stage
   されても確定しない既存規則)ことが構成的に保たれる。
   URI パターンは `publicarena-contract.ts` から **`COMMENTARY_URI_SOURCE`
   (正規表現ソース文字列)として export** し、UNSAFE_COMMENTARY は同ソース+
   角括弧選択肢から組み立てる(**検証の意味論は不変・定数の編成のみ変更**。
   scheme ごと + `file:` の lookahead 挙動の parity テストを追加)。
2. `runner.ts`: `recordedNoteWithCause` を使用。**omission と suppression は
   排他**: noteOmissions は「抑制前の導出 note が空」のときのみ、URI 抑制は
   noteSuppressed のみを増やす(両方は決して同時に増えない)。抑制時は
   move イベントへ `note_suppressed: "uri"`。
3. publish 側の適用点は **`publicreplay.ts` の buildPublicReplay における
   commentary 再構築、この1箇所**(publicarena.ts と harnesslab.ts は共に
   buildPublicReplay を共有しており、exportGame 側での適用は救済にならない)。
   buildPublicReplay を直接テストする。
4. `metrics.ts` に suppressed 集計。validator コメント追記。
5. **G3 完走後に**worktree を main へマージ(orchestrator)。

## Tests and verification

- `test/publishable-note.test.ts`:
  - publishableNote: 矢印正規化・角括弧置換・冪等性(f(f(x))=f(x))・
    `<a`/`</`/`<!` などタグ様も置換で無害化・出力に `<>` 不在。
  - 記録経路: 矢印 note が `→` で記録され assertCommentaryText を通る。
    URI note が空記録+`note_suppressed` イベント+ noteSuppressed のみ増加
    (**noteOmissions は増えない** — 排他を両カウンタで assert)。空 note は
    omission のみ。通常 note 不変。
  - URI パターン parity: 全 scheme(https/http/ftp/data/javascript/mailto)+
    `file:` lookahead(`file: 続き非空白`のみ拒否・散文 `file: if…` は通る)で
    新旧 UNSAFE_COMMENTARY の判定が一致。
  - notes-carry regression: 採用された URI note がイベントで空・NotesSession の
    持ち越しに不在。
  - publish 救済: 旧形式(矢印入り)の記録済み note から構築した commentary が
    validator を通る。URI 入り過去 note は従来どおり fail-loud。
  - notes-carry 一貫: 矢印 note の持ち越しが記録と同一バイト。
- 回帰: `npm test` 全体(movenote・publicreplay-validate・notes-carry 含む)。
- 実機確認(orchestrator、マージ後): memo run(矢印で公開不能だった実 run)を
  一時的に curated list へ入れて `public-arena` が成功すること…は memo run が
  capped で検証子に落ちるため不可。代わりに **G3 の実 run で確認**(G3 収載の
  実機確認と合流)。
- 台帳走査: 全 community run の note に URI パターンが無いことを確認・報告。

## Failure and rollback

- 導出は additive(events 不変・validator 不変)。ロールバックは
  publishableNote の除去(記録側は以後の run にのみ影響、publish 側は
  矢印 run が再び publish 不能に戻るだけで既存 artifact は不変)。

## Completion criteria

- 新テスト+全体回帰 green。台帳 URI 走査の報告。
- G3 完走後のマージと、G3 実 run での publish 成功(カタログ合流時)。
- codex-impl-review APPROVED。
