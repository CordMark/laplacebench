---
status: draft
direction: direction-bench-thinking-channel
owner: bench
risk_tier: heavy
last_updated: 2026-07-27
---

# 着手ノートを応答契約にする — モデル非依存の思考チャネル

## Tier: heavy（暫定判定・plan review で確定）

応答プロトコル（`agent-response-v1` → v2）を変え、**測定条件そのもの**を変える。
過去ランと新条件のランは集計上分離する必要があり、外部契約（公開リプレイ payload
と製品の観戦UI）にも及ぶ。「外部契約を変更する」「新しい概念を導入する」に該当。

検証構成: 方向づけ対話（完了・ACCEPT、event `7e0a30ce`）→ 本プラン →
`/codex-plan-review` → `/interrogation`（impl checkpoint）→ `/codex-impl-review`。

## Direction Brief

1. **Purpose** — 「この手で考えたこと」を、**どのモデルでも同じ形で拾える**
   ようにする。今は Claude が観測チャネルに散文を書き、Codex は素の JSON だけを
   返すため、観戦UIの同じ枠が片側だけ埋まる。モデルを足すたびにアダプタ工事が
   発生する形ではなく、契約側で一度決めれば増えるモデルに自動的に効く基盤にする。

2. **Concept owner** — 「モデルが何を返すか」の正本は
   `schemas/agent-response.schema.json` と `packages/cli/src/prompt.ts` の
   `buildInstructions`。捕捉配管の正本は `AgentReply.raw`（既存）で、これは
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
     「短いノートを返す」へ変え、`agent-response` schema を **v2** に上げる。
     全モデルが同じチャネルで同じ問いに答えるので、構造上プロバイダ非依存になり、
     モデル追加時のアダプタ工事がゼロになる。既存の `raw` 配管をそのまま使う。
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

## 未着手（このプランの残り）

変更インベントリ・検証手順・ロールバックは未記入。`status: draft` のまま実装に
入らない。
