# work item: wizard-navigation-and-explicit-effort — tier: standard

Slice: interactive `laplacebench play` から意味のない effort `default` 選択を除き、
前の項目へ戻って安く修正できるようにし、終了後の提出選択を上=提出・下=今回は提出しない
へ並べ替える。公開・version変更・commit/pushは行わない。

Requirement source: ユーザー対話 2026-07-28。
「effort でdefaultが選べるのは意味側から消して。」
「cliで各項目一度選択したら戻れないのが体験悪い。」
「終了後は上の選択肢が提出で下が今回は提出しないにして」

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "c3fd1f05-ad46-4e50-bee7-cf23554d8310",
      "work_item_id": "wizard-navigation-and-explicit-effort",
      "session_key": "direction-wizard-navigation-and-explicit-effort",
      "occurred_at": "2026-07-27T17:48:06.486Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "CHANGE",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "value-cost"
          ],
          "question": "Does invalidating all downstream selections on back-navigation undercut the user's actual need (cheaply fixing an early mistake), when only dependent steps (e.g., provider→model) truly require invalidation and independent values could be preserved or re-offered as defaults?",
          "context_refs": [],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 49182,
      "input_tokens": 37937,
      "cached_input_tokens": 3107,
      "output_tokens": 2817,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17607,
            "cached_input_tokens": 1434,
            "output_tokens": 1903
          },
          "normalized_delta": {
            "input_tokens": 17607,
            "cached_input_tokens": 1434,
            "output_tokens": 1903
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 20330,
            "cached_input_tokens": 1673,
            "output_tokens": 914
          },
          "normalized_delta": {
            "input_tokens": 20330,
            "cached_input_tokens": 1673,
            "output_tokens": 914
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
    "transcript_hash": "db5233757459f1a8561620383e8652a9d6b845961b3f477b06037065e4e1c585",
    "decision_context_hash": "e369b6c07bb930078eaf1bcf10df25f1c00b4e1c50f768527e8e0178a31e9bf1",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Publish-ready correction plan review (session plan-publish-ready-0-2-5)

- 0.2.5のversion/lockfile更新を全検証・impl reviewより前へ移し、publish/push/tag作成をscope外と明記。
- ラウンド 2・指摘計 2 件で APPROVED（confidence 0.99）

## Plan review (codex-plan-review, session plan-wizard-navigation-and-explicit-effort)

- Q(review/text-step-back): custom model/custom gamesのtext promptでvalid値を完成させるまで戻れないなら、
  「各editable selectionから安く戻れる」というdirectionを破らないか？
  - 弁明: 後続selectまで進ませる案ではinvalid integer loopから戻れず、指摘は正しい。
  - 裁定: revise(class: B)。previous editable stepがあればempty Enterをbackにし、invalid後も戻れる。
    Esc/Ctrl+Cはwhole-wizard cancellationのまま分離する。
- Q(review/auth-no-editable-target): 全設定がflags所有のauth failureで「設定へ戻る」を出すと、存在しない
  editable stepへ戻るかflag値を編集させないか？
  - 弁明: zero-editable stateのabsenceを未定義にしており、指摘は正しい。
  - 裁定: revise(class: B)。editable stepが0なら設定へ戻るchoiceを抑止し、再チェック/中止だけを出す。
    partial flagsは最後のeditable stepへ戻し、headlessはprompt-free single passを維持。
- Q(review/first-editable-text): partial flagsでcustom games textが最初のeditable stepなら、empty-backの
  targetが存在しないのではないか？
  - 弁明: empty-backの成立条件をprevious editable stepの存在へ限定する必要があり、指摘は正しい。
  - 裁定: revise(class: B)。この境界ではemptyをinvalidとしてvalid入力かwhole-wizard cancelだけを受ける。
- ラウンド 3・指摘計 3 件で APPROVED（confidence 0.97）

## Implementation review (codex-impl-review, session impl-wizard-navigation-and-explicit-effort)

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.98）

## 2026-07-28 codex-model-menu corrective（tier: light）

- 要求: Codex選択後に実モデルが出ず、unnamed defaultだけが表示される回帰を修正する。
- tier defense: menu/catalogとfocused testだけを変更し、schema・外部契約・実行経路・legacy解釈は変更しない。
- Implementation review（session impl-codex-model-menu）: ラウンド 2・指摘計 1 件で APPROVED（confidence 0.98。既承認stackを確認）


```json
{
  "direction_correction_v1": {
    "correction_id": "488fc541-9a2a-4736-a8c4-e4cf03321b81",
    "related_direction_event_id": "c3fd1f05-ad46-4e50-bee7-cf23554d8310",
    "occurred_at": "2026-07-27T18:10:44.290Z",
    "source": "human",
    "missed_families": [
      "time-scope",
      "value-cost"
    ],
    "summary": "The user now requests a publish-ready commit; package version preparation is added while the irreversible npm publish remains user-owned.",
    "effect": "premise-corrected",
    "high_risk": false
  }
}
```
