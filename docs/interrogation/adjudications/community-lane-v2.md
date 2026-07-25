# work item: community-lane-v2 — tier: heavy

Slice: community レーンの再設計（laplacebench 側のみ）。エージェント単位の
ランキングを廃止し対戦（matchup）単位の記録へ置換（schema v2）、集計生成を
提出者からマージ後 CI へ移管、自動マージの機械ゲート、`submit` / `play` の
自動提出とリプレイ URL 表示。laplace-main 側の表示・リプレイ URL 許可は
別スライス。

Requirement source: ユーザー対話 2026-07-25。「もうランキングで見せんのやめ
よっかな。シンプルに対決が見れればいい気がする」「Codex対Fableみたいに
最先端のモデル同士で戦わせたい、その結果を見たい」「自動マージは受け入れる
想定で」「official は一旦置いておいていい」「見出しは畳もう」。前提と調査
結果は `docs/community-lane-v2-context-ja.md` に保全。

Tier defense（plan review R-6 により standard → heavy へ昇格）: 公開データ契約（standings JSON スキーマ）の版上げと CI 機構の
再編（標準）。エンジン・マッチ規則・凍結ルールセットは無変更。金銭計算・
認可 enforcement・legacy data semantics・不可逆 migration なし。生ログ
（`community/runs/*`）は追加のみで既存データを書き換えない。CI に
contents/pull-requests write を与える点は direction で明示的に裁定済み
（自動マージ受諾の帰結、専用ブランチへ封じ込め）。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "358445d2-088a-4112-a0a5-8f53c088dbf0",
      "work_item_id": "community-lane-v2",
      "session_key": "direction-community-lane-v2",
      "occurred_at": "2026-07-25T08:45:13.591Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "process",
            "value-cost"
          ],
          "question": "B は昨日の standings-json direction が棄却した bot 事後コミットの復活であり、価値序列にあった「常設 write 権限を持たない」を覆す。これを意図的な覆しとして brief の『消えるもの』に明示するか。また branch 保護下の main へ CI が push する経路は実際に成立するか。",
          "context_refs": [
            "docs/plans/2026-07-25-standings-json.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "simplified",
          "requested_evidence": null
        },
        {
          "id": "T002",
          "families": [
            "external-reality",
            "process"
          ],
          "question": "fork PR は pull_request イベントでワークフロー定義を差し替えられるため、同名の pass する check を攻撃者が偽造できる。自動マージの機械ゲートが信頼できるコード（base 側定義）で評価されることをどう保証するか。閉じられなければ「機械ゲートが人間マージを置換できる」前提が崩れる。",
          "context_refs": [],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 78342,
      "input_tokens": 46509,
      "cached_input_tokens": 0,
      "output_tokens": 4382,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 20388,
            "cached_input_tokens": 0,
            "output_tokens": 2997
          },
          "normalized_delta": {
            "input_tokens": 20388,
            "cached_input_tokens": 0,
            "output_tokens": 2997
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 26121,
            "cached_input_tokens": 0,
            "output_tokens": 1385
          },
          "normalized_delta": {
            "input_tokens": 26121,
            "cached_input_tokens": 0,
            "output_tokens": 1385
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
    "transcript_hash": "c5578ac4daa31f85fe1807e5742482ea69b5b8a429b09d1c5c4b1dc9c9cbac38",
    "decision_context_hash": "be4ceee9557267f66e4c999a41b5f0bfb83fead5ea96b8ee1fcfee6398ecafd4",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```


```json
{
  "direction_correction_v1": {
    "correction_id": "363555d9-c22c-4fa3-9508-2efaed8ce939",
    "related_direction_event_id": "358445d2-088a-4112-a0a5-8f53c088dbf0",
    "occurred_at": "2026-07-25T08:49:44.974Z",
    "source": "human",
    "missed_families": [
      "concept",
      "non-entity",
      "time-scope"
    ],
    "summary": "学習ハーネスを別エージェントとして見出しに立てる採用方向を撤回する。学習ハーネスは単体の存在ではなくハーネスの一部であり、主たる表示のベースラインはハーネスなしのモデル。学習ハーネス専用の分岐コード（STATEFUL_HARNESSES 相当）を本スライスで持ち込まず、汎用ハーネスを扱えるようにする後続スライスへ繰り延べる。見出しは全ハーネスを一律にモデル単位へ畳み、同一見出しに畳まれる自己対戦は公開一覧から除外する。",
    "effect": "removed-work",
    "high_risk": false
  }
}
```

## Plan review (codex-plan-review)

### Q(review/tier) — tier defense と実装内容の不一致

指摘: 本スライスは提出ディレクトリ接頭辞 = PR 作成者という identity trust
判定を新設し、「誰がマージしてよいか」の authorization enforcement を人間から
機械へ移し、判定主体に write 権限を与える。「認可 enforcement なし」という
standard の tier defense と実装内容が一致しない。

弁明: 当初は「公開データ契約の版上げと CI 機構の再編」として standard と
判定した。しかし機械ゲートは人間マージの置換であり、enforcement の主体交代
そのものである。

裁定: **revise（class: A）**。standard → **heavy** へ昇格。frontmatter の
`risk_tier` と裁定ログ見出しを更新し、検証構成に `/interrogation`
（impl checkpoint）を追加した。CLAUDE.md の「迷ったら上の階層に倒す」に従う。

### Q(review/premise) — GITHUB_TOKEN 由来 push が後続 workflow を起動しない

指摘: `community-gate.yml` が `GITHUB_TOKEN` でマージした結果の `push: main`
は、GitHub の再帰防止仕様により新しい workflow run を作らない。集計生成と
全件監査の経路が設計上動かない。

弁明: `push: branches: [main]` をトリガにすれば連鎖すると仮定していたが、
これは誤った前提だった。

裁定: **revise（class: A）**。マージ成功後に `workflow_dispatch` を明示発火
する設計へ変更（`GITHUB_TOKEN` からでも起動できる例外）。発火失敗はゲート run
を fail させる。あわせて `community-verify.yml` を削除し、差分検証をゲート、
全件検証を publish に吸収して所有者を増やさない構成にした。

### Q(review/premise) — 検証した SHA とマージする SHA が結び付いていない

指摘: 検証中の追加 push や古い `synchronize` run との競合により、ワークフローが
検証していない新しい head をマージできる。

弁明: `pull_request_target` の信頼境界（base 側定義・PR コード不実行）には
注意を払ったが、**時間軸の競合**を見落としていた。

裁定: **revise（class: A）**。`VERIFIED_SHA` を起動直後に1回確定して全処理を
その immutable SHA に対して行い、PR 単位 concurrency、マージ直前の head 再確認、
merge API への `sha` 必須指定、不一致時 hold を追加した。

### Q(review/concept) — 識別子文法がカタログ実装と食い違っていた

指摘: 実際の spec は `anthropic:<model>`（`anthropic-api` は spec 接頭辞では
なく usage source ラベル）、codex の model 省略 + effort 指定は
`codex-cli:@medium`、baseline は接頭辞なしの裸の名前。プランの例示のままでは
正規の Anthropic run が公開対象から落ち、parser も一意に決まらない。

弁明: `catalog.ts` の `buildSpec` を精読せず、対話中の表記をそのまま持ち込んだ。

裁定: **revise（class: B）**。文法表を `buildSpec` から導出し直し、
`LLM_HARNESSES` を spec 接頭辞へ修正。さらにパース対象を形ではなく
**認識済みハーネスの allowlist** で決める規則に一意化し
（`claude-cli-learn:...` は分解、`takeshi:d2` は raw fallback）、対照テストを
追加した。

---

- ラウンド5・指摘計 19 件で APPROVED（confidence 0.98）
