# work item: publishable-note — tier: standard

Slice: 公開 commentary の「recorded ⇒ publishable」を構成的に成立させる。
記録時の冪等な導出 `publishableNote`(`->`→`→`・`<-`→`←`、残る `<`→`‹`・
`>`→`›`)+ URI パターンは記録時に note を空へ抑制(`note_suppressed: "uri"` を
イベントへ記録、reliability 指標化)。publish 側は同一導出を適用して既存 run
(矢印 note の Run 12-14・memo run)も救済し、validator は全クラス不変のまま
backstop へ降格。**laplace-main の変更・鏡像 validator の協調・deploy 順序制約は
丸ごと不要になる**(公開バイトに `<>` が現れないため)。

Requirement source: G4 実装で発見(memo run の 3/4 局が公開不能)+ ユーザー
裁定 2026-08-02(laplace-main は今触ってよい)→ direction 対話で proxy が
パターン狭め案の確率的破れを指摘し、構成的保証(導出+抑制)へ CHANGE。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "b90a53fb-fef5-4aa4-b93d-5febb9517915",
      "work_item_id": "commentary-arrows",
      "session_key": "direction-commentary-arrows",
      "occurred_at": "2026-08-02T08:11:26.705Z",
      "phase": "direction",
      "method": "human_direction_proxy",
      "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
      "decision": "CHANGE",
      "dialogue_status": "completed",
      "tensions": [
        {
          "id": "T001",
          "families": [
            "concept",
            "absence"
          ],
          "question": "狭めたパターンでも `<a` 型の散文で「recordedなのにpublish不能」が再発し得る。不変条件「recordedは常にpublishable」は記録時に同一validatorが効く構成的保証なのか、publish時のみの確率的な守りなのか。後者なら真の選択は record時拒否 vs publish時エスケープ。",
          "context_refs": [
            "publicarena-contract.ts UNSAFE_COMMENTARY",
            "recordedNote",
            "MAX_COMMENTARY_SCALARS前例"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        },
        {
          "id": "T002",
          "families": [
            "concept",
            "absence"
          ],
          "question": "URIスキーム拒否をpublish時のみに残すと、URLを含むnoteで「recordedなのにpublish不能」がURIクラスにだけ確率的に再発する。記録時にも同一validator(URI含む)をfail-loudに適用して構成的保証を完成させるのか、意図的な残余とするのか。",
          "context_refs": [
            "assertCommentaryText URIスキーム拒否",
            "recordedNote記録経路"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 122278,
      "input_tokens": 94183,
      "cached_input_tokens": 46353,
      "output_tokens": 7262,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 40696,
            "cached_input_tokens": 19610,
            "output_tokens": 2943
          },
          "normalized_delta": {
            "input_tokens": 40696,
            "cached_input_tokens": 19610,
            "output_tokens": 2943
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 25072,
            "cached_input_tokens": 1673,
            "output_tokens": 2690
          },
          "normalized_delta": {
            "input_tokens": 25072,
            "cached_input_tokens": 1673,
            "output_tokens": 2690
          },
          "reason": null
        },
        {
          "turn": 3,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 28415,
            "cached_input_tokens": 25070,
            "output_tokens": 1629
          },
          "normalized_delta": {
            "input_tokens": 28415,
            "cached_input_tokens": 25070,
            "output_tokens": 1629
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
    "transcript_hash": "67fce27d2d77bb43784f278b3bf5046e8f8529f21f573b65c3b5cca590ba7890",
    "decision_context_hash": "af110bc3bdfb9e7d2f0d55152ec5fbe87bb30aac2e6143124508b1b417d20def",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 3
  }
}
```
