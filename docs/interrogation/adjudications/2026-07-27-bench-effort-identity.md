# work item: bench-effort-identity — tier: heavy

Slice: 公開アリーナの見出し identity を model 単位から model + effort 単位へ
変える（laplacebench 側のみ）。ハーネスの畳み込みは維持。ラベルを合成にして
effort を見出しに出す。プラン: `docs/plans/2026-07-27-bench-effort-identity.md`。

Requirement source: ユーザー対話 2026-07-27。「effort も含めて一つのモデルだからね。
だから違う effort の戦いは、同じモデル配下に集約されないべき」。ハーネスの扱いは
追加確認で「model + effort まで」と裁定。

この裁定は完了済み Direction Brief `direction-community-lane-v2`
（event `358445d2-088a-4112-a0a5-8f53c088dbf0`）の採用方向「見出しは全ハーネスを
一律にモデル単位へ畳む」を覆すため、correction `d1ff0bf8` を同 work item へ
`--source human` で追記済み。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "a5ae6f6c-d3e7-4a4d-a584-08b30eae792e",
      "work_item_id": "bench-effort-identity",
      "session_key": "direction-bench-effort-identity",
      "occurred_at": "2026-07-26T16:38:50.735Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "concept",
            "absence"
          ],
          "question": "effort 未指定 spec（@ なし）を別 identity として扱い、ラベルに『effort 未指定』と明示するか。公開データに実在するか。",
          "context_refs": [
            "catalog.ts headlineKey",
            "community/runs/*"
          ],
          "author_position": "NEED_EVIDENCE",
          "outcome": "evidence-found",
          "effect": "removed-work",
          "requested_evidence": "community/runs/* の実在 spec 一覧 — effort 未指定 spec は存在しないと確認"
        },
        {
          "id": "T002",
          "families": [
            "concept",
            "absence"
          ],
          "question": "モデル名未記録 spec（codex-cli:default@medium）を新方針下でどの粒度・ラベルで出すか。公開データに実在するか。",
          "context_refs": [
            "catalog.ts headlineKey コメント",
            "community/runs/*"
          ],
          "author_position": "NEED_EVIDENCE",
          "outcome": "evidence-found",
          "effect": "removed-work",
          "requested_evidence": "community/runs/* の実在 spec 一覧 — モデル名未記録 spec は存在しないと確認"
        },
        {
          "id": "T003",
          "families": [
            "external-reality",
            "process",
            "value-cost"
          ],
          "question": "schema 名 v1 のまま id/label/public_agent_count の意味（粒度）を変えてよいか。製品側が粒度に依存する消費をしていないかの実確認と、v2 + 製品側先行の順序が必要かの判定。",
          "context_refs": [
            "laplace-bench-arena-v1",
            "community-lane-v2 の『製品側の受け入れ準備が先』順序",
            "laplace-main の id/label/public_agent_count 使用箇所"
          ],
          "author_position": "NEED_EVIDENCE",
          "outcome": "evidence-found",
          "effect": "removed-work",
          "requested_evidence": "laplace-main の全消費箇所確認 — バリデータは @ を許可済み、消費はすべて粒度非依存の自己整合チェック。v1 維持・製品側変更不要"
        },
        {
          "id": "T004",
          "families": [
            "concept"
          ],
          "question": "effort 違い同士の対局（opus@high vs opus@low）が公開一覧に出るのは、裁定の意図された帰結か副作用か。",
          "context_refs": [
            "human correction d1ff0bf8",
            "自己対戦除外ルール"
          ],
          "author_position": "REVISE",
          "outcome": "defended-and-clarified",
          "effect": "no-change",
          "requested_evidence": null
        }
      ],
      "duration_ms": 78210,
      "input_tokens": 44697,
      "cached_input_tokens": 0,
      "output_tokens": 4337,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 19799,
            "cached_input_tokens": 0,
            "output_tokens": 2715
          },
          "normalized_delta": {
            "input_tokens": 19799,
            "cached_input_tokens": 0,
            "output_tokens": 2715
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 24898,
            "cached_input_tokens": 0,
            "output_tokens": 1622
          },
          "normalized_delta": {
            "input_tokens": 24898,
            "cached_input_tokens": 0,
            "output_tokens": 1622
          },
          "reason": null
        }
      ],
      "active_provider": "claude",
      "providers_used": [
        "claude"
      ],
      "fallback_count": 0
    },
    "transcript_hash": "40cfc2b32713230b70ea052a3c4a4d5dcfbaa73a3f14c899f02055c9325b1c81",
    "decision_context_hash": "0b7651e92f3f1cc6a36d76a23b2c43e81f21eac0fdcf30f7b719162049a9e306",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-bench-effort-identity)

- Q(review/tier-understated): 公開成果物 `laplace-bench-arena-v1` の
  `id` / `label` / `public_agent_count` / matchup id の意味を版を上げずに変える
  のは外部契約の変更であり、standard 弁明の根拠（消費者に粒度依存なし）は
  この checkout から検証不能 → 受理、**heavy へ昇格**し impl checkpoint の
  尋問を追加、消費者受け入れを再現可能な実測手順へ格上げ(revise, class: A)。
- Q(review/test-inventory-incomplete): `headlineKey` 変更が波及する既存
  アサーションの棚卸しが不足（`publicarena.test.ts` 未計上、`matchups.test.ts`
  の 164-167 / 170-191 / 257-283、`publicarena.test.ts:103-110`）→ 受理、
  範囲ごとに現状と変更後を明記した表を追加(revise, class: B)。特に total-order
  テストは畳まれる前提のフィクスチャが崩れるため effort を揃えて目的を保存し、
  「3ハーネス1見出し」の主張は実記録形を維持したまま2つの主張へ分割した。
- Q(review/consumer-verification-not-reproducible): 検証 3 が sibling の現 HEAD
  を記録するだけで pin を強制せず、コマンドも未指定 → 受理、裁定済み
  リビジョンを `git show` で取り出して検証し、HEAD 差分は drift として併走
  確認、手順を常設スクリプト
  `packages/cli/scripts/verify-product-acceptance.mjs` 化(revise, class: B)。
- ラウンド 3・指摘計 5 件で APPROVED(confidence 0.98)

## 2026-07-27 bench-effort-identity [impl]（tier: heavy）

- Q(label-length-boundary): ラベル合成は「grammar 上有効な見出しは必ず公開できる」
  という publisher 自身の不変条件を破らないか。id は最大128 scalar まで有効な一方、
  合成ラベルは ` (high)` / ` (effort not recorded)` を足すため、122文字モデル +
  `@high`（127 scalar の有効な id）で 129 scalar のラベルになり
  `assertText(…, 128)` が publish 全体を落とす。従来はラベルが id そのものだった
  ため起こり得なかった。
  - 弁明: 実在データの最長 id は17文字で影響なし。ただし既存テスト
    「every grammar-valid unknown headline remains publishable and verbatim」が
    まさにこの不変条件を名指ししており、100文字モデルしか通っていないため
    suite green が境界を証明していないのは事実。回帰として受理。
  - 裁定: revise（publisher 自身の不変条件; class: B）→ **round 2 で覆る**
  - by: auto
  - prediction: none
- Q(label-cap-moved-across-the-repo-boundary): round 2 の修正
  （`MAX_PARTICIPANT_LABEL` を 192 へ緩和）は、修正ではなく失敗を製品側へ
  移して不可視にしただけではないか。pin した消費者 `3a1d474` の
  `parseParticipant` は `isText(value.label, 128)` を満たさない participant で
  **カタログ全体を null** にする。よって 129 scalar のラベルは publish に成功し、
  製品は黙って何も表示しなくなる — round 1 の「大きな音で落ちる」より悪い。
  - 弁明: 反証できず。消費者ソースを実際に読んで確認（`git show
    3a1d474:web/src/lib/bench/parseArenaCatalog.ts`）。外部の実体が producer 側の
    都合に優先する。round 2 の裁定を破棄。
  - 裁定: revise(consumer contract（pin 済みリビジョンの validator 実測）;
    class: A) — `MAX_PARTICIPANT_LABEL` を 128 へ戻し「これは消費者との契約で
    あって局所的なつまみではない」ことを doc 化。`headlineLabel` は合成が cap を
    超える場合に **identity へフォールバック**し、`label <= identity <= 128` を
    構造的に回復（本スライス以前に成立していた性質の復元であり、限界を文書化して
    済ませる縮小ではない）。境界テストは publish 成功と 128 以内の両方を主張。
    さらに `verify-product-acceptance.mjs` が消費者ソースから
    `isText(value.label, N)` の N を読み出して `MAX_PARTICIPANT_LABEL` との一致を
    機械検証し、将来の drift が「後で静かに空になる」ではなくこのゲートで落ちる
    ようにした。
  - by: auto
  - prediction: none
- ラウンド 3・指摘計 2 件で APPROVED（confidence 0.94）
  - 受容した残余（方向と整合）: 極端に長いモデル名では effort 節が落ちて素の
    identity になる。identity は記録されていない条件を主張しないため、
    「正直さ > 可読性」の価値序列は保たれる。

## Impl review (codex-impl-review, session impl-bench-effort-identity)

- Q(review/gate-verifies-stale-artifact): 外部契約ゲートである
  `verify-product-acceptance.mjs` が `dist/*.js` を import しており、ソース変更後に
  ビルドせず走らせると**古いコンパイル結果に対して PASS を印字**しうる。build 前提を
  コメントで書いているだけで強制していない → 受理、tsx で走る利点を活かして
  `src/*.ts` を直接 import し、ビルド工程をゲートから排除(revise, class: B)。
- Q(review/conflict-guard-unpinned): 同一 identity に畳まれる2 spec が label/kind で
  食い違ったとき publication が止まるという arena 側の不変条件をテストが固定して
  いない → 受理、`cpu-v6:level_3` を LLM ハーネス経由と product-cpu 経由の両方で
  作って `conflicting participant metadata` の送出を主張する回帰テストを追加
  (revise, class: B)。初回は run ディレクトリ名衝突で duplicate raw_ref が先に
  発火して別のエラーを掴んでいたため、コピーをリネームして意図した失敗を捉える
  ように修正した。
- ラウンド 2・指摘計 3 件で APPROVED（confidence 0.97）

# work item: ledger-count-coupling — tier: light（bounded corrective）

Slice: `publicarena.test.ts` の「現行台帳」テストが `verified_run_count === 2` 等の
件数をハードコードしており、**community 提出が1件増えるたびに CI が赤くなる**構造
だった。提出フロー（`laplacebench submit` / 自動マージ）は台帳を append-only で
増やす設計なので、リテラルは提出契約と矛盾する。

Requirement source: main の CI 赤（run a8f3df1）
`not ok 57 - current ledger publishes deterministic content-addressed public
games` / `expected: 2, actual: 3`。`keisuke70--20260727-sol-high-vs-medium` の
提出で顕在化した。

Tier defense: テストのみ。schema/migration・認可・identity trust・金銭・legacy
data semantics・外部契約・cutover・不可逆操作・新概念のいずれも変えない。blast
radius は1ファイル1テスト。失敗再現は上記 CI run とローカル再現。

## Impl review (codex-impl-review, session impl-ledger-count-coupling)

- Q(review/assertions-weakened-to-tautology): 件数を台帳から導出した結果
  `public_game_count <= gamesInLedger` になり、**公開漏れ（極端には0件公開）でも
  通ってしまう**。内容アドレス検証は「出力されたゲーム」しか見ないので未出力を
  検出できない → 受理、各 final.json の agent spec から `publicPair` で
  **公開されるべき集合を独立に算出**し、カタログの raw_ref 集合と deepEqual、
  `public_game_count` と `replays.size` を突合、参加者 id 集合も同様に厳密一致へ
  (revise, class: B)。
- ラウンド 2・指摘計 2 件で APPROVED（confidence 0.99）
  - 副次的な強化: 内容アドレス検証を先頭 matchup だけでなく**全 matchup の全ゲーム**
    へ拡張。flagship は index ではなく identity で引く（新しい提出が recency 順で
    index 0 を取るため、旧コードは別の matchup を検証していた）。
