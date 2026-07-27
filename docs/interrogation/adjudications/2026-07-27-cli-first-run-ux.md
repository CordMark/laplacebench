# work item: cli-first-run-ux — tier: heavy

Slice: public first-run CLI を矢印選択中心へ作り直し、seed/internal・script/replay contractを
維持した `0.2.1` を公開する。プラン: `docs/plans/2026-07-27-cli-first-run-ux.md`。

Requirement source: ユーザー対話 2026-07-27。public runで seed confusion と全角 `１` の
連続拒否を実測後、「てか全体的にもっとcliよくしたい」「選択肢とかもできるんじゃなかったっけ？」
「お願い」。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "537e8b52-eb76-4fc2-8802-bc9cc51a8378",
      "work_item_id": "cli-first-run-ux",
      "session_key": "direction-cli-first-run-ux",
      "occurred_at": "2026-07-27T10:12:12.946Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": ["external-reality", "value-cost"],
          "question": "Is prompts@2.4.2 (unmaintained since ~2021, exactly pinned) actually verified to render arrow-select and handle cancel correctly under Node 22, and is the frozen-dependency risk acceptable at the TTY rendering boundary?",
          "context_refs": ["proposal item 2", "value hierarchy: dependency minimalism"],
          "author_position": "DEFEND",
          "outcome": "evidence-found",
          "effect": "no-change",
          "requested_evidence": null
        },
        {
          "id": "T002",
          "families": ["absence", "process"],
          "question": "What is the non-TTY behavior of `laplacebench play` without flags after the arrow-key UI replaces readline — clean refusal pointing at headless flags, or a silent hang this proposal must own?",
          "context_refs": ["proposal items 1, 6", "headless flags preserved"],
          "author_position": "DEFEND",
          "outcome": "evidence-found",
          "effect": "no-change",
          "requested_evidence": null
        },
        {
          "id": "T003",
          "families": ["process", "non-entity"],
          "question": "Is the superseded internal-wizard-seed heavy-tier plan actually closed (frontmatter status updated alongside the direction correction), so seed behavior has a single owner under this broader direction?",
          "context_refs": ["docs/plans/2026-07-27-internal-wizard-seed.md", "known_active_work roster"],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "removed-work",
          "requested_evidence": null
        }
      ],
      "duration_ms": 58757,
      "input_tokens": 42286,
      "cached_input_tokens": 3107,
      "output_tokens": 4013,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {"input_tokens": 19064, "cached_input_tokens": 1434, "output_tokens": 3234},
          "normalized_delta": {"input_tokens": 19064, "cached_input_tokens": 1434, "output_tokens": 3234},
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {"input_tokens": 23222, "cached_input_tokens": 1673, "output_tokens": 779},
          "normalized_delta": {"input_tokens": 23222, "cached_input_tokens": 1673, "output_tokens": 779},
          "reason": null
        }
      ],
      "active_provider": "claude",
      "providers_used": ["claude"],
      "fallback_count": 0
    },
    "transcript_hash": "d573b1dfdf1decac8d51ad621eece97d8840ec38eee77f479db709f49cec77de",
    "decision_context_hash": "798d115649ad4fa56d69021d05eaa73cc8359be998397aae098a8183c6e7bb22",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-cli-first-run-ux)

- Q(review/scripted-inventory): scriptedIO は余ったanswerでfailせず、seed回答削除後にwrong
  journeyでもgreenになりうる。normalizationのnegative boundaryも不足 → 受理。helperへ
  kind/title transcript + remainingを持たせ、全 scripted flowでconsumed-all、ordinary flowで
  exact orderをassert。model/path/commit不変とfullwidth flag拒否を追加(revise, class: B)。
- Q(review/cancel-owner): cancel representation/catch ownerが曖昧で、message/close/no-arenaを
  end-to-endで証明できない → 受理。adapterは`WizardCancelledError`だけを返し、`runPlay`が
  catch、finallyがcloseを所有。select/input cancel別にmessage 1/close 1/return 1/no calls/no
  propagationを固定し、real PTY cursor checksも維持(revise, class: A)。
- Q(review/final-repack): final packとdirectory publishのtoolchain/same-input/clean-tree条件が
  0.2.0 analogueより弱い → 受理。Node v26.5.0/npm11.17.0、same clean pushed directory、
  no-scripts、two-pack identity、exact tgz acceptance、post-smoke unchanged treeをprecondition化。
  directory publish理由（gitHead）とregistry digest equalityを明記(revise, class: A)。
- ラウンド 2・指摘計 3 件で APPROVED（confidence 0.98）

## 2026-07-27 cli-first-run-ux [impl]（tier: heavy）

- 実装プラン外artifact、前提崩壊、runtime-only consequenceを、approved brief、scoped diff、
  Node 22 PTY、clean tgz install/replay evidenceと突合。新規の問い・修正要求なし。
- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.92。stdin EOFもfail-closedで
  return 1 / no arena / no submissionとなることを確認）

## Implementation review (codex-impl-review, session impl-cli-first-run-ux)

- Q(review/wording-regression): approved replacement wordingのoption labelsがtest transcriptに
  保存されず、旧wordingへ戻ってもgreenにならないか？
  - 弁明: prompt kind/titleとanswer inventoryは固定済みだったが、option本文は未固定で指摘どおり。
  - 裁定: revise(fixed overturned-wording check; class: B)。`scriptedIO`へselect optionsを記録し、
    preset / 詳細設定の先後 / submissionのexact labelsとretired labels不在をassert。
  - by: auto
  - prediction: hit
- ラウンド 2・指摘計 1 件で APPROVED（confidence 0.99）
