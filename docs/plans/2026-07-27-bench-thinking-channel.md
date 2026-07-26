---
status: approved
direction: direction-bench-thinking-channel
owner: bench
risk_tier: standard
last_updated: 2026-07-27
---

# 着手ノートを応答契約にする — モデル非依存の観戦チャネル

## Tier: standard

当初 heavy と暫定判定したが、plan review の指摘で **standard へ下げる**。実際の
delta は「新しい通常挙動（応答契約と測定条件）の導入」であって、重量基準の
どれにも当たらない:

- ゲームルール・レフェリー・凍結ルールセット `laplace-8x8-v1` は無変更
- 認可 enforcement / identity trust / 金銭 / 不可逆 migration / cutover なし
- **公開 payload の形は不変**。`commentary[].text` の型も意味（その手の前に
  モデルが書いたテキスト）も同じで、消費者側に受け入れ作業が発生しない
- 条件分離は既存の `prompt_rev` を上げるだけで、新しい概念を作らない
- 変更する schema ファイルは実行時に誰も参照していない記述文書

検証構成: 方向づけ対話（完了・ACCEPT、event `7e0a30ce`）→ 本プラン →
`/codex-plan-review` → `/codex-impl-review`（6項目弁明同梱）。

## Direction Brief

1. **Purpose** — 「この手で考えたこと」を、**どのモデルでも同じ形で拾える**
   ようにする。今は Claude が観測チャネルに散文を書き、Codex は素の JSON だけを
   返すため、観戦UIの同じ枠が片側だけ埋まる。モデルを足すたびにアダプタ工事が
   発生する形ではなく、契約側で一度決めれば増えるモデルに自動的に効く基盤にする。

2. **Concept owner** — 「モデルが何を返すか」の**実行時の**正本は
   `packages/cli/src/prompt.ts`（`buildInstructions` の文面と `PROMPT_REV`）
   ただ一つ。`schemas/agent-response.schema.json` は実行時に誰も参照しない
   設計記述文書であり、既に現行 CLI とずれている（`request_id`・座標形）ので、
   契約の所在ではない（後述「契約の正本は schema ファイルではない」）。
   捕捉配管の正本は `AgentReply.raw`（既存）で、これは
   runner の `move` イベント → `exportweb` の `commentary[]` → 公開リプレイ →
   製品の `BenchCommentary` まで既に一本で通っている。**新しい配管は作らない。**

3. **Lifecycle and scope** — laplacebench 側でプロトコル・アダプタ・エクスポート。
   製品側は既存の `commentary` を描くだけなので、表示の是正（後述）以外の
   受け入れ作業は発生しない見込み。ただし条件表示は製品側スライスになりうる。
   `laplace-8x8-v1`（ゲームルールの凍結ID）は**変えない** — レフェリーも
   ルールブックも無変更で、変わるのは応答プロトコルだけ。

4. **Value hierarchy** — モデル非依存であること > 観戦の面白さ > トークンコスト。
   ただし最上位は既存の「出す数字の正直さ」で、**新条件の対局を旧条件と混ぜない**
   ことがそれに当たる。

5. **Adopted direction** —
   - **着手ノートを応答契約の必須フィールドにする。** 「書いてもよい」を
     「着手ノートを返す」へ変える。全モデルが同じチャネルで同じ問いに答えるので、
     構造上プロバイダ非依存になり、モデル追加時のアダプタ工事がゼロになる。
     既存の `raw` 配管をそのまま使う。
   - **ノートの定義（plan review の指摘を受けて明確化）**: 求めるのは
     **観測可能な「その手を選んだ理由」**であって、隠れた逐次推論の書き出しでは
     ない。design-v0.1 §5 の「private chain-of-thought を要求も採点もしない」は
     維持され、要求するのはモデルが公開チャネルへ書く所見である。
     **この区別は「短さ」の要求ではない**: 現在 Claude が実際に書いている
     「局面の読み＋この手の狙い」（数百字規模）はそのまま望ましい形であり、
     文字数上限で切り詰めることはしない。除外するのは「思考を全部垂れ流せ」と
     いう指示であって、内容の厚みではない。
   - **遵守率を信頼性メトリクスにする。** ノートを返さないことは format failure と
     同じ形の観測値として記録する。
   - **新条件は記録に見え、集計で混ざらない。** effort を見出しに出したのと同じ
     理屈で、v2 プロトコルで走った対局は過去ランと別条件として識別できるように
     する。
   - **棄却した代案: プロバイダ固有 reasoning の正規化。** 実測で棄却した。
     現実的な盤面プロンプト（6手目の観測JSON）に対し
     `codex exec --json -c model_reasoning_effort=medium -c model_reasoning_summary=detailed`
     が返した reasoning は 86 文字、内容は
     `**Assessing blue team rook move options**` /
     `**Analyzing capture opportunities for Blue**` の**見出し2本のみ**で、
     選択理由は一文字も含まれない（単純プロンプトでも 37 文字の見出し1本）。
     一方 Claude が観測チャネルに書いていたのは局面読みと具体的な挟撃計画。
     これを同じ枠に流し込むと、空欄が伝えていた正しい情報（このモデルは説明を
     返さなかった）を壊して、**中身のないものを中身があるように見せる**。
     「比較不能なものをラベル付きで見せる」既存パターンは実質があるものにしか
     適用できない。
     なお Anthropic の thinking ブロックは要約ではなく実体があるため、将来
     「比較不能なおまけ」としては意味を持ちうるが、プロバイダ間で実質の有無が
     揃わない以上**共通基盤にはならない**。

6. **What disappears / is not protected** —
   - **ノートを対戦相手には渡さない（明示的 absence）。** 相手に見せると
     説得・シグナリングを測る別種目 `public-dialogue`（design-v0.1 §3.4）に
     なってしまう。レフェリーは相手に運ばない。観戦記録専用。
   - **「素のJSONだけ返す寡黙さ」が観戦上の個性として見えていた状態。**
     FINDINGS Run 8 はそれを spectator-visible personality difference と
     記録しているが、必須化すると失われる。**代わりに遵守率として残す**。
   - **旧条件との出力比較可能性。** v2 は別条件であり、旧ランの数字は旧条件の
     ものとして据え置く（遡って作り直さない）。
   - **トークンコストの最小性**（守らない）。全手ぶん出力が増える。
   - **測定汚染がゼロであること**（守らない）。説明を書かせること自体が着手の
     質を変えうる。ただし現状も「書いてよい」と誘って Claude だけが応じており
     条件は既に非対称に汚れている。必須化は全モデルへ同一に掛かるため、
     model-vs-model 比較という本題に対しては対称であると判断した。

## 形の決定: JSON フィールドではなく「JSON の前の散文」

「必須フィールド」を `{"note": "...", "move": {...}}` の形で要求する案は採らない。
長い分析を JSON 文字列へ押し込ませると改行・引用符のエスケープ事故が増え、
**遵守率を測るために新しい format failure 面を作る**という自己矛盾になる。

採るのは「JSON の前に散文を書く」を必須化する形。利点:

- `extractMove` の契約（**最後**の有効な JSON オブジェクトが着手）が無変更で通る。
  新しい失敗面をゼロにできる
- 遵守は機械的に判定できる（返答から末尾 JSON を除いた残りが非空か）
- 今 Claude が実際にやっている形そのものなので、遵守側の挙動は変わらない

### 契約の正本は schema ファイルではない（plan review の指摘）

`schemas/agent-response.schema.json` は**実行時コードから一切参照されていない
記述文書**で、しかも既に現行 CLI とずれている: schema は `request_id` 必須・座標を
配列で定義しているが、実際のプロンプトは `request_id` を要求せず座標をオブジェクトで
受け取る。この drift は本スライスより前から存在する。

したがって「schema を v2 にすれば契約が変わる」という書き方は誤りだった。訂正:

- **CLI が実際にモデルへ要求する契約の正本は `packages/cli/src/prompt.ts`**
  （`buildInstructions` の文面と `PROMPT_REV`）。ノート必須化はここで起きる。
- schema ファイルには `note` を追記して `$id` を v2 へ上げるが、これは
  **設計上のプロトコル記述の更新**であって強制力の所在ではない。混同しないよう
  ファイル先頭に「実行時 validator ではない」旨と、上記 drift を既知の未解決事項
  として明記する。
- **drift 自体の解消（request_id・座標形の統一、実 validator の導入）は本スライスの
  範囲外。** ここで巻き取ると応答契約の作り直しになり、ユーザー要求から離れる。

### 条件の分離は既存の仕組みで足りる

`run.json` は既に `prompt_rev`（現在
`"p2-token-budget"`）を記録しており、`packages/cli/src/prompt.ts` の
`PROMPT_REV` が正本。ここを **`p3-move-note`** へ上げれば、新条件のランは
記録上そのまま識別できる。**新しい概念は作らない。**

## 変更インベントリ

| ファイル | 変更 |
|---|---|
| `packages/cli/src/prompt.ts` | `PROMPT_REV` → `p3-move-note`。`buildInstructions` の「書いてもよい」を必須化し、**観測可能な着手理由**であること・**観戦記録用で対戦相手には見せない**ことを明記。`extractMove` を、最後に成立した着手 JSON とその**文字範囲**を返す共有パーサへ拡張し、`extractNote(text)` はその範囲を除いた残りを返す（走査ロジックの所有者を1つに保つ。現行 `extractMove` は `Move` しか返さないので範囲を取れず、そのままでは再利用できない） |
| `packages/cli/src/runner.ts` | `move` イベントに `note` を追加（`raw` は監査用に据え置き）。`TeamStats`（このファイルが所有）に `noteOmissions` を追加し計上 |
| `packages/cli/src/metrics.ts` | `noteOmissions` を集計し、**`moves` を分母**とする `note_omission_rate` として報告する。`formatFailures` は turn 分母なので、既存の率と同じ計算に巻き込まない（後述「遵守の定義」） |
| `packages/cli/src/exportweb.ts` | commentary の text を後述の**世代を取り違えない規則**で決める |
| `packages/cli/src/publicreplay.ts` | 同上。commentary を独自に組み直しているので同じ規則を適用 |
| `schemas/agent-response.schema.json` | `note` を追記、`$id` を v2 へ。あわせて「実行時 validator ではない」旨と既知 drift（`request_id`・座標形）を明記 |
| `docs/match-conduct-laplace-8x8-v1.md` | 正準ラン比較の基準として `p2-token-budget` を名指ししている箇所（:63）を p3 へ更新。p2 の記述は履歴として残す |
| `docs/usage-semantics.md` | 同じく `p2-token-budget` を canonical と書いている箇所（:114）を更新。過去の測定値が p2 条件のものであることは残す |
| `docs/design-v0.1.md` §5 | プロトコル記述を更新。**§5 の「private chain-of-thought を要求も採点もしない」は維持**し、ノートがそれに当たらない理由（観測チャネルの公開記録であって private reasoning ではない）を明記する。曖昧なままだと doc が自己矛盾に読める |
| `packages/cli/FINDINGS.md` | Run 8 の「寡黙さは spectator-visible personality difference」は `p2` 条件下の観測であることを注記（記録は書き換えない） |
| テスト | 下記 |

**製品（laplace-main）は変更しない。** commentary の型も意味も同じ（「その手の
前にモデルが書いたテキスト」）で、bench 側が先に JSON を剥がして渡すぶん
`presentCommentary` の剥がし処理が空振りするだけ。表示は改善方向にしか動かない。

### commentary をどう決めるか（世代を取り違えない規則）

素朴な `note ?? raw` は**誤り**。p3 でモデルがノートを書かなかった場合、
`extractNote` は空を返し、そのまま raw へ落ちると着手 JSON が commentary として
公開されてしまう（「p3 の commentary は着手 JSON を含まない」という不変条件と
矛盾する）。

判定は世代文字列ではなく **`note` フィールドの有無**で行う。これなら
エクスポータが `prompt_rev` を読む必要がない:

| move イベントの状態 | commentary |
|---|---|
| `note` フィールドが**無い**（p2 以前のログ） | 従来どおり `raw` を使う |
| `note` が**在って非空** | その `note` を使う |
| `note` が**在って空**（p3 でモデルが書かなかった） | **その手の commentary を出さない** |

3行目が「モデルは説明を返さなかった」を正しく表現する形で、UI は既存の
「この手には記録がありません」を出す。空文字を commentary として載せない。

`note` 無しログへの raw フォールバックは「念のため」ではなく要件:
`community/runs/*` は**追記のみの実在対局の台帳**で、p2 条件で記録済みのログは
`note` を持たない。落とすと過去の公開対局がエクスポート・再生できなくなる。

## 遵守の定義（分子と分母）

曖昧なまま「遵守率」と書かない。定義:

- **分母 = 着手として採用された返答の数**（＝ per-team `moves`）。repair 再試行や
  format/legality 失敗で捨てられた返答、timeout、token budget skip、forced pass は
  **数えない**。それらは既存の失敗メトリクスが担当する軸で、ノート遵守とは別問題。
- **分子 = そのうち `extractNote` が空文字（空白のみを含む）を返したもの**
  = `noteOmissions`。
- **ノート未記載は着手を落とさない。** 手は通し、観測値として記録する。ここで
  turn を潰すと、観戦のための要求がゲーム結果を変えてしまう。

## 生対局での受け入れ基準（曖昧にしない）

検証 4 の live ラン結果の扱いを事前に決める。閾値は
**codex-cli 側の `noteOmissions / moves` ≤ 0.2**（＝ 8 割以上の手でノートが入る）。

- **満たす**: 本スライスは目的を達成。完了。
- **満たさない**: **遵守率が記録されたから成功、とは扱わない。** まず remediation を
  1 回試みる（プロンプト文面の是正: 要求位置・語調・例示の追加。アダプタ側の
  ハック追加ではない）。それでも閾値に届かなければ、
  **「観測チャネルの必須化だけでは全モデルに効かない」という前提の反証**として
  direction へ差し戻し、brief を更新して plan review からやり直す。
  実装をそのまま通して指標だけ残す道は取らない。

## テスト

- 共有パーサ: 散文＋JSON → 散文のみ／JSON のみ → 空／**JSON が複数ある**
  （最後の成立分だけを除去し、その前の JSON はノートに残す）／**JSON の後ろに
  散文がある**（末尾散文もノートに含める）／空白のみ／コードフェンス混じり
- 遵守カウント: ノート無しの返答が `noteOmissions` を増やし、**着手は成功する**。
  失敗して捨てられた返答が分母にも分子にも入らないこと
- `PROMPT_REV` が `p3-move-note` として run.json と game log の両方に載る
- p2 の既存ログ（`community/runs/*` の実データ）を再エクスポートして
  commentary が従来どおり出ること（`note` 無しログの回帰）
- p3 のログで commentary text が着手 JSON を含まないこと
- **p3 でノート未記載の手**は commentary エントリ自体が出ないこと（空文字が
  載らない・raw へ落ちない）。上表3行目の回帰

## 検証

1. `npm run build && npm test`
2. 実台帳の再エクスポート（p2 ログ）で commentary が壊れないこと
3. `npx tsx packages/cli/scripts/verify-product-acceptance.mjs` — 公開 payload の
   形は変えないが、commentary を触るので受け入れゲートを再走させる
4. **実対局 1 ペア**（`claude-cli` × `codex-cli`、低 effort・少手数）を実際に走らせ、
   **Codex 側にノートが入るか**を実測する。判定は上記「生対局での受け入れ基準」に
   従い、結果（両サイドの `noteOmissions / moves`）を実装レビューへ提出する。
   sandbox やモックでは代替しない — 未知だったのは「モデルが指示に従うか」で、
   それはコードでは確かめられない

## ロールバック

`PROMPT_REV` を `p2-token-budget` へ戻し、`buildInstructions` の文言を戻せば
条件は元に戻る。`note` を読む側はフォールバックがあるので、p3 ログも p2 ログも
どちらの版でも読める。公開済み成果物は再生成で戻せる（台帳は無変更）。
