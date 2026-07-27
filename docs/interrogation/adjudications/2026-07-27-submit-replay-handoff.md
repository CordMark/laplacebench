# work item: submit-replay-handoff — tier: heavy

Cross-repository plan:
- producer: `docs/plans/2026-07-27-submit-replay-handoff.md`
- consumer: `/Users/kei/projects/laplace-main/docs/plans/2026-07-27-bench-replay-handoff.md`

Requirement source: user dialogue 2026-07-27. 「自動提出までできたらユーザーがlaplace bench に
移動する動線」「その対局のリプレイのページ」を要望し、2局すべて終了後に一度提出、2本の
リンク、公開待機ページという方向を承認。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "ee5e6d08-f7a5-4de9-9509-5a2755f30ff9",
      "work_item_id": "submit-replay-handoff",
      "session_key": "direction-submit-replay-handoff",
      "occurred_at": "2026-07-27T10:45:08.547Z",
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
          "question": "What guarantees the CLI-printed digest and eligibility match what the publication pipeline actually commits — does the submission carry the canonical bytes, or does CI rebuild them with a possibly skewed builder version?",
          "context_refs": [
            "docs/plans/2026-07-26-public-arena-catalog.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        },
        {
          "id": "T002",
          "families": [
            "non-entity",
            "concept"
          ],
          "question": "Is the URL-visible pending=1 flag necessary, given it lets any well-formed digest display a pending state and persists in shared links, versus handling 'maybe pending' purely in the page's 404 response handling?",
          "context_refs": [],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "simplified",
          "requested_evidence": null
        }
      ],
      "duration_ms": 60845,
      "input_tokens": 61011,
      "cached_input_tokens": 24215,
      "output_tokens": 4211,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17529,
            "cached_input_tokens": 1434,
            "output_tokens": 2372
          },
          "normalized_delta": {
            "input_tokens": 17529,
            "cached_input_tokens": 1434,
            "output_tokens": 2372
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 43482,
            "cached_input_tokens": 22781,
            "output_tokens": 1839
          },
          "normalized_delta": {
            "input_tokens": 43482,
            "cached_input_tokens": 22781,
            "output_tokens": 1839
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
    "transcript_hash": "e09cc3bde3f785d6281580fd06f1575ffb20db17c62aa281e472e0e7e6c97541",
    "decision_context_hash": "2f55ec38ad7bebf59253dd03935926e594dda6494b93a3dc46ae186112733139",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-submit-replay-handoff)

- Q(review/set-submit-order): `submit.test.ts`だけでは、canonical 2局setの完了前に提出せず、
  完了後exactly once、arena reject時no submitというorchestrationを証明できない。
  - 弁明: plan本文は順序を要求したが、test inventoryのownerが不足しており指摘どおり。
  - 裁定: revise(plan completeness; class: B)。`wizard.test.ts`をinventoryへ追加し、deferred
    `runArena`でpending/resolve/rejectの順序とcall countを固定する。
  - by: auto
  - prediction: hit
- ラウンド 2・指摘計 1 件で APPROVED（confidence 0.99）

## Coordinated implementation gates（tier: heavy）

- Producer/consumerを一つのexternal handoff sliceとしてinterrogationし、ラウンド1・指摘2件で
  APPROVED（confidence 0.93）。implementation reviewはconsumer側のhung request deadlineと
  strict page query absenceの2件を受理・修正し、ラウンド2・指摘計2件でAPPROVED
  （confidence 0.99）。producerのsuccess後だけのlink表示、whole-set once-only submit、
  publisher-only digest authorityには追加修正なし。
- 全Q/Aと裁定の正本:
  `/Users/kei/projects/laplace-main/docs/interrogation/adjudications/2026-07-27-bench-replay-handoff.md`。
