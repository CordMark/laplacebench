# work item: bundled-product-cpu — tier: standard

Slice: `npx laplacebench play` の一般利用者が、別の製品 checkout と commit pin を
用意せず、同梱された LaPlace CPU を選んで対局できるようにする。公開・version 更新は
ユーザーが別途所有し、この slice では実行しない。

Requirement source: ユーザー対話 2026-07-28。「これ一般向けに含めたい」「おっけいでは
これを進めて」。方向確定後、「これヘビーにしなくていいよ。公開は自分がやるし
バージョンも戻せる」と公開を明示的に scope 外へ変更。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "41f2bfa8-71e5-48fe-a24e-6f5f16962bb2",
      "work_item_id": "bundled-product-cpu",
      "session_key": "direction-bundled-product-cpu",
      "occurred_at": "2026-07-27T17:20:27.912Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "ACCEPT",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "value-cost",
            "external-reality"
          ],
          "question": "Does the 'ordinary user can just play' purpose survive the Python 3.11+ prerequisite, given default macOS/Windows machines lack it — is a preflight install-Python message the accepted v1 experience, decided explicitly rather than inherited?",
          "context_refs": [
            "proposal point 3",
            "tradeoff: Python remains required / TS port deferred"
          ],
          "author_position": "DEFEND",
          "outcome": "defended-and-clarified",
          "effect": "no-change",
          "requested_evidence": null
        }
      ],
      "duration_ms": 38797,
      "input_tokens": 37256,
      "cached_input_tokens": 0,
      "output_tokens": 2221,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 17474,
            "cached_input_tokens": 0,
            "output_tokens": 1524
          },
          "normalized_delta": {
            "input_tokens": 17474,
            "cached_input_tokens": 0,
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
            "input_tokens": 19782,
            "cached_input_tokens": 0,
            "output_tokens": 697
          },
          "normalized_delta": {
            "input_tokens": 19782,
            "cached_input_tokens": 0,
            "output_tokens": 697
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
    "transcript_hash": "d9e2485950d16a7b6b1f2f39829314b4da17b7a0989a48772a3626d53befc7b5",
    "decision_context_hash": "3660c23e9d9ab51a5433cd69b47f0402be8e422341182ca6cd1a1d7cf494d27b",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Publish-ready correction plan review (session plan-publish-ready-0-2-5)

- 0.2.5のversion/lockfile更新を全検証・impl reviewより前へ移し、publish/push/tag作成をscope外と明記。
- ラウンド 2・指摘計 2 件で APPROVED（confidence 0.99）


```json
{
  "direction_correction_v1": {
    "correction_id": "e0efdc4a-d96f-4926-bcd6-4cc0088b0aae",
    "related_direction_event_id": "41f2bfa8-71e5-48fe-a24e-6f5f16962bb2",
    "occurred_at": "2026-07-27T17:21:04.370Z",
    "source": "human",
    "missed_families": [
      "time-scope",
      "value-cost"
    ],
    "summary": "Public npm release and package version changes are removed from this slice; the user owns any later publication, so implementation and local artifact verification remain standard tier.",
    "effect": "removed-work",
    "high_risk": false
  }
}
```

## Plan review (codex-plan-review, session plan-bundled-product-cpu)

- Q(review/integrity-anchor): vendor manifest自身がcommit/file hashの唯一のownerだと、manifestとfileを
  同時改変してもadvertised commitを偽ったまま通らないか？
  - 弁明: npm integrityが配布rootだが、planのmanifest-tamper promiseにはvendor外anchorが必要。
  - 裁定: revise(class: A)。trusted policy indexをvendor外に置き、role/full commit/manifest digestを
    固定。bridgeはindex→manifest→fileの順で検証し、manifest+file同時改変negativeを追加。
- Q(review/policy-role): cpu-v6 playとfrozen cpu-v4 regretという目的に対し、arbitrary/mixed policy playを
  許すとsingular provenanceとcommand eligibilityが曖昧にならないか？
  - 弁明: current menuはv6だけで、v4はregret oracle。external checkout compatibilityは要求されていない。
  - 裁定: revise(class: A)。play=v6、regret=v4をfail-closedで固定し、cross-role/mixed policyをrun前拒否。
- Q(review/active-doc-inventory): adapter specとroot READMEなどcurrent-facing owner/consumerがinventoryから
  抜け、checkout/cpu-v4-only claimがstaleに残らないか？
  - 弁明: broad historical bucketではactive claimを分類できないため指摘を受理。
  - 裁定: revise(class: B)。adapter spec/root READMEをupdate対象、public identity consumers/testsを
    verified unchanged、実験/過去planをhistorical snapshotとして明示分類。
- Q(review/v4-source-symbol): frozen cpu-v4 sourceは`CPU_VISIBLE_TIERS`を公開せず
  `CPU_V4_VISIBLE_TIERS`だけなので、byte-exact snapshotのままbridgeが解決できるか？
  - 弁明: source-version固有symbolをtrusted indexへ固定すればvendor編集なしで解決できる。
  - 裁定: revise(class: B)。cpu-v4/v6のvisible-tier/resolver symbolをindexへ束縛し、`getattr`で
    fail-closed検証する。
- ラウンド 3・指摘計 4 件で APPROVED（confidence 0.99。公開/version変更はscope外）

## Implementation review (codex-impl-review, session impl-bundled-product-cpu)

- Q(review/verified-import-race): file hash検証後、通常importがpathを再読込すると、同期・改変との競合で
  未検証bytesをtrusted commitとして実行し得ないか？
  - 弁明: hash一致だけでは検証対象と実行対象の同一性を保証できず、指摘は正しい。
  - 裁定: revise(class: A)。検証済みbytesをimmutable memory snapshotへ保持し、そのbytesだけをcompileする
    custom importerへ変更。検証後のdisk file差替えでもsnapshotだけが実行されるnegative regressionを追加。
- Q(review/atomic-generation): syncがlive vendor treeを削除・順次再生成すると、bridgeやpackが欠落・部分生成を
  観測しないか？
  - 弁明: planのtemporary generation + atomic replacementを実装しておらず、指摘は正しい。
  - 裁定: revise(class: A)。content-addressed immutable generationをstagingで完成・検証後にrenameし、trusted
    indexを最後にatomic switch。index切替前の中断でも旧index/treeが有効なregressionを追加。
- Q(review/package-inventory-race): immutable generationを先に置いても、npm packが旧inventory取得後に新indexを
  読むと、tar内に参照generationが欠け得ないか？
  - 弁明: runtime readerは安全になったが、package inventory/read区間は別途直列化が必要で、指摘は正しい。
  - 裁定: revise(class: A)。syncとnpm prepack〜postpackが共有lockを取得し、生成・index切替とtar作成を直列化。
    concurrent publisherの待機とreal tar内の全index参照を検証するregressionを追加。
- ラウンド 3・指摘計 3 件で APPROVED（confidence 0.96。公開/version変更はscope外）


```json
{
  "direction_correction_v1": {
    "correction_id": "c7dcd723-b888-4019-9d1d-bcccc0ee07dc",
    "related_direction_event_id": "41f2bfa8-71e5-48fe-a24e-6f5f16962bb2",
    "occurred_at": "2026-07-27T18:10:44.255Z",
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
