# work item: bench-speed-visibility — tier: standard

Slice: マルチゲーム run の並列実行デフォルト化、実行中ライブ進捗表示、
公開 bench page への所要時間・トークン使用量の表示(arena artifact への
additive フィールド追加 + laplace-main UI)、「見出し左は Team A」文言の
言い直し。

Requirement source: ユーザー(kei)指示 2026-07-27「複数試合ある場合は
基本並列実行にしよう。…outputは簡潔に短くするようにしたい。ライブ表示も
行おう。あとlaplace main側のbench pageで今見せてる情報は少なすぎるな。
時間とかトークン使用量とかも有益な情報だから表示するようにしよう。」+
「見出し左は〜とかよく分からないね。」実測背景: 2局直列で104分
(73〜91秒/手)、進捗表示なし。

Tier defense: CLI 実行系の挙動変更(直列→並列デフォルト)と公開 arena
contract への additive 追加(標準)。ゲーム内公平性規則・エンジンコア・
金銭・権限・不可逆 migration なし(重量ではない)。表示のみの変更に
とどまらないため軽量でもない。

## Direction dialogue (human-direction-proxy)

決定: CHANGE — 元提案4点のうち「output 簡潔化(prompt_rev 変更)」を
削除。実測(可視 narration は output tokens の 6.1%/7.8%、92〜94% が
hidden reasoning)により「短くすれば速くなる」前提が崩れ、観戦チャネル
(p3-move-note)の価値だけを失うため。時間対策は並列化が、トークン不安
対策はライブ表示と公開ページ表示が担う。arena schema は前例
(effort-identity)に従い additive・v1 維持で確定。

人間への差し戻し事項(proxy 指示): narration 削減は速度に効かず観戦価値
とトレードオフである事実を kei に報告し、可読性目的で別途やるかは人間の
再判断に委ねる(本スライス成果物には含めない)。

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "58462c03-54c2-4c60-ae40-695198a35d52",
      "work_item_id": "bench-speed-visibility",
      "session_key": "direction-bench-speed-visibility",
      "occurred_at": "2026-07-27T13:29:33.674Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "CHANGE",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "external-reality",
            "concept"
          ],
          "question": "簡潔化で時間が縮むという前提は正しいか — 6.3k output tokens/手のうち可視 narration の占める割合はどれだけか（隠れ reasoning が支配項なら削っても時間は縮まない）",
          "context_refs": [
            "docs/plans/2026-07-24-token-budget.md"
          ],
          "author_position": "REVISE",
          "outcome": "evidence-found",
          "effect": "premise-corrected",
          "requested_evidence": "summary.json の usage 内訳: 可視出力は opus 6.1% / fable 7.8%、hidden reasoning が92〔94%を占めることを確認済み"
        },
        {
          "id": "T002",
          "families": [
            "value-cost",
            "concept"
          ],
          "question": "「長い narration を書かない」prompt_rev は、直前に固めた観戦チャネル（着手ノートを応答契約にする）の価値を痩せさせないか — 簡潔化とコメンタリー価値の両立方針は何か",
          "context_refs": [
            "docs/plans/2026-07-27-bench-thinking-channel.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "removed-work",
          "requested_evidence": null
        },
        {
          "id": "T003",
          "families": [
            "concept",
            "time-scope"
          ],
          "question": "arena schema は additive で v1 維持か v2 か — 前例（effort-identity スライス）は v1 維持 additive であり、それで確定してよいか",
          "context_refs": [
            "docs/plans/2026-07-27-bench-effort-identity.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "simplified",
          "requested_evidence": null
        }
      ],
      "duration_ms": 72472,
      "input_tokens": 41626,
      "cached_input_tokens": 3107,
      "output_tokens": 4006,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 18778,
            "cached_input_tokens": 1434,
            "output_tokens": 2422
          },
          "normalized_delta": {
            "input_tokens": 18778,
            "cached_input_tokens": 1434,
            "output_tokens": 2422
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 22848,
            "cached_input_tokens": 1673,
            "output_tokens": 1584
          },
          "normalized_delta": {
            "input_tokens": 22848,
            "cached_input_tokens": 1673,
            "output_tokens": 1584
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
    "transcript_hash": "b8a88118f36c21f97c3bbb71303a6df8553e5b2345195bf413b1d6432f88abe1",
    "decision_context_hash": "0f560fd9c9c789862152ee36af20f69b93b038ed605bfd4e01506306e55dd2d1",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Direction dialogue (human-direction-proxy) — note language follow-up

決定: HUMAN_DECISION — kei の追加要望「思考の言語も英語と日本語ユーザーが
選べるように」について、proxy が「run 生成条件(--note-lang)か閲覧時の
表示側翻訳か」の層の確認を要求。kei 本人へ確認した回答原文:
「ごめんイメージはrun時指定だったけどモデルの勝敗の公平性保てないから
一旦英語のままでいいや」。

明示的 absence: 着手ノートの言語オプション(run 時指定)は、言語条件が
モデル間比較の公平性を割るという理由で人間が明示的に見送った。却下された
のは run 時指定であって閲覧側の解決策ではない — 表示側翻訳(生成条件に
触れない案)は未検討のまま残っている。将来「日本語で読みたい」が再浮上
した場合はそちらから検討する。

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "c89f661c-93f9-42f2-bc54-02d5a03ca29e",
      "work_item_id": "bench-note-language",
      "session_key": "direction-bench-note-language",
      "occurred_at": "2026-07-27T13:34:50.375Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "HUMAN_DECISION",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "concept",
            "external-reality"
          ],
          "question": "kei の要求は閲覧者が言語を選べることか、run を日本語ノートで走らせることか。--note-lang は run 実行者が固定する仕組みで、閲覧時選択を実現しない。修正すべき層は生成(ベンチ条件)か表示(laplace-main)か。",
          "context_refs": [
            "ユーザー発言 2026-07-27「英語と日本語ユーザーが選べるように」",
            "docs/plans/2026-07-27-bench-thinking-channel.md"
          ],
          "author_position": "HUMAN_RESIDUAL",
          "outcome": "evidence-found",
          "effect": "removed-work",
          "requested_evidence": "kei 回答原文:「ごめんイメージはrun時指定だったけどモデルの勝敗の公平性保てないから一旦英語のままでいいや」"
        },
        {
          "id": "T002",
          "families": [
            "value-cost"
          ],
          "question": "note_lang を labeled condition にすると正準比較が言語軸で割れる。ja run が増えたときリーダーボードは en 限定か混合か。混合なら「言語がプレイ品質に影響しうる」という著者自身の懸念と、数字の正直さ最上位という community-lane の価値序列に反しないか。",
          "context_refs": [
            "docs/plans/2026-07-25-community-lane-v2.md value hierarchy"
          ],
          "author_position": "HUMAN_RESIDUAL",
          "outcome": "changed",
          "effect": "removed-work",
          "requested_evidence": null
        }
      ],
      "duration_ms": 62343,
      "input_tokens": 39534,
      "cached_input_tokens": 3107,
      "output_tokens": 3578,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17892,
            "cached_input_tokens": 1434,
            "output_tokens": 2283
          },
          "normalized_delta": {
            "input_tokens": 17892,
            "cached_input_tokens": 1434,
            "output_tokens": 2283
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 21642,
            "cached_input_tokens": 1673,
            "output_tokens": 1295
          },
          "normalized_delta": {
            "input_tokens": 21642,
            "cached_input_tokens": 1673,
            "output_tokens": 1295
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
    "transcript_hash": "554c9c7d0bb00097fb3c673c10382c591a000dce26a0341445dee4342659ceb2",
    "decision_context_hash": "44a4b26d7e615c8cd3edae38635583c37a1d716d0dec27e389e42438776e37ff",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review)（tier: standard）

- Q(review/duration-null-rule): 「timestamp 欠損なら duration_ms=null」
  という規則は到達可能か? — 弁明: events を直接読む想定で nullable に
  していた。 — 裁定: revise (class: B)。buildPublicReplay が
  game_start/game_end の ts を必須検証しており publishable run では
  欠損は到達不能。duration_ms は必須・非 null とし、検証済み timestamp
  と同一解釈経路から算出する。
- Q(review/partial-run-submit): 並列で一部ゲームが失敗した run を
  `--submit` はどう扱うか? — 弁明: 当初未定義(非ゼロ exit のみ)。 —
  裁定: revise (class: B)。部分 run の公開台帳提出は抑止する。arena()
  が failedGames を返し、runPlay が exit 1 + submit 抑止。
- Q(review/learning-spec-identity): 直列フォールバック対象の spec は
  何か? — 弁明: `claude-learn:` と誤記していた。 — 裁定: revise
  (class: C)。正しくは `claude-cli-learn`。判定は cli.ts の spec 解析と
  同源の正規表現に固定し、A/B 両配置と `claude-cli:opus` 非マッチを
  テストで固定。
- Q(review/progress-budget-semantics): 進捗行のトークン表示は予算と
  正しく対応しているか? — 弁明: 例示が合算使用量/単一予算だった。 —
  裁定: revise (class: C)。per-team usage を per-team budget に対応
  させ、telemetry の無い run ではトークン部分を省略。
- ほか機械的指摘(wizard フラグ経路・parseArenaCatalog 厳格キー・
  team_tokens 取得元定義)はプランへ反映済み。brief を覆す指摘なし
  (direction correction 不要)。
- ラウンド 3・指摘計 7 件で APPROVED（confidence 0.98）

## Implementation review (codex-impl-review)（tier: standard）

- Q(review/tokens-fail-closed): 公開する team_tokens は corrupt な
  final.json usage に対して fail-closed か?
  - 弁明: 初版 sideTokens は非数値フィールドを 0 に defaulting しており、
    計測済み side の壊れた usage が「0 tokens」として公開されうる。
  - 裁定: revise（impl-review; class: A）。usage が存在する場合は 4 カウンタ
    (reportedCalls / legacyUnversionedCalls / inputTotalTokens /
    outputTotalTokens) を非負 safe integer として厳格検証し、malformed は
    throw で run ごと拒否。`usage: null` も「present な非オブジェクト」と
    して拒否（absent = undefined のみ null 側）。負例テストで固定。
  - by: auto / prediction: none
- Q(review/zero-duration-truth): duration_ms=0 を「1 sec」と表示していた
  — 裁定: revise（impl-review; class: B）。0 は「0秒」、0<ms<1000 は
  「1秒未満 / <1 sec」。UI テストで固定。
- ラウンド 3・指摘計 3 件で APPROVED（confidence 0.99）
