# work item: internal-wizard-seed — tier: heavy

Slice: interactive seed を完全に内部化し、explicit scripted seed / log provenance を維持した
CLI `0.2.1` を公開する。プラン:
`docs/plans/2026-07-27-internal-wizard-seed.md`。

Requirement source: ユーザー対話 2026-07-27。public `0.2.0` 実行中の
`seed: [90694]` に対して「これ見せなくていい。たとえrandomが使われたとしても内部で
決めればいい」。続いて auto-submit の選択で全角 `１` を3回拒否され、
「あとこれが連続して進めない」。

Status: superseded before plan approval / implementation by the user's broader
request to improve the whole CLI with arrow-key choices. Direction correction
`137ebf19-7290-41c3-8a16-135fd771088b` records the scope change; follow-up work
item is `cli-first-run-ux`.

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "e64f5caa-5b90-44b4-b231-4bbeffccfbe1",
      "work_item_id": "internal-wizard-seed",
      "session_key": "direction-internal-wizard-seed",
      "occurred_at": "2026-07-27T10:04:29.426Z",
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
            "value-cost"
          ],
          "question": "When an interactive session was started with an explicit --seed, does the visible summary still omit the seed, or does explicit supply make it visible? The user objection targeted an unrequested random number, not deliberately supplied input; hiding the caller's own value could read as it being ignored.",
          "context_refs": [
            "Proposal item 2 (interactive summary omits seed; --seed honored if explicitly supplied)",
            "Proposal item 3 (noninteractive summary shows seed)",
            "User quote 2026-07-27: これ見せなくていい"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 39612,
      "input_tokens": 36280,
      "cached_input_tokens": 3107,
      "output_tokens": 2296,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17055,
            "cached_input_tokens": 1434,
            "output_tokens": 1524
          },
          "normalized_delta": {
            "input_tokens": 17055,
            "cached_input_tokens": 1434,
            "output_tokens": 1524
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 19225,
            "cached_input_tokens": 1673,
            "output_tokens": 772
          },
          "normalized_delta": {
            "input_tokens": 19225,
            "cached_input_tokens": 1673,
            "output_tokens": 772
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
    "transcript_hash": "5d35f1a382ab0e7d7d26c84396d58cfc3e1a2029d37867b1efbf76910ef34226",
    "decision_context_hash": "f4cec385b26aa2f810f3fa3e4ab08fc8b1faf4ee1d8abd9ffd441205cf69f70d",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## 2026-07-27 internal wizard seed [impl]（tier: heavy）

- Q(author/fullwidth-menu): public `0.2.0` で日本語 IME の全角 `１` が menu selection と
  して認識されず同じ質問を繰り返した。seed-only scope の外として残すか。
  - 弁明: 同じ first-user wizard journey の実測 blocker で、ユーザー原文が正しい挙動を
    一意に示す。numeric prompt boundary だけで `０-９` を ASCII digit へ写像すれば、model
    ID/path の意味や CLI flag contract を変えずに直せる。
  - 裁定: revise(user runtime evidence; class: A)。current plan review 前に scope/inventory/test
    へ追加し、menu と integer prompt を共通の targeted normalization で受理。junk は拒否。
  - by: auto
  - prediction: none


```json
{
  "direction_correction_v1": {
    "correction_id": "137ebf19-7290-41c3-8a16-135fd771088b",
    "related_direction_event_id": "e64f5caa-5b90-44b4-b231-4bbeffccfbe1",
    "occurred_at": "2026-07-27T10:08:13.251Z",
    "source": "human",
    "missed_families": [
      "concept",
      "value-cost",
      "time-scope"
    ],
    "summary": "User broadened the accepted seed-only wizard cleanup into an overall first-run CLI redesign centered on arrow-key selection and Enter confirmation; the narrow draft is superseded before implementation.",
    "effect": "complexity-exposed",
    "high_risk": true
  }
}
```
