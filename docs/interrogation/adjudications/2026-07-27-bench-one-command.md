# work item: bench-one-command — tier: standard

Slice: 対局の入口を `play` 一本にする。`play` がフラグを受けて非対話でも動き、
`arena` は既定値を適用してから委譲する非推奨 alias になる。非対話でも提出は明示
`--submit` が要り、終了時に提出状態を必ず出力する。プラン:
`docs/plans/2026-07-27-bench-one-command.md`。

Requirement source: ユーザー対話 2026-07-27。「基本的にはplayが使われるということね。」
→ ルート README が `arena` しか見せていない drift を報告 →「arenaは無くす可能性も
ありかも。」→ 削除は anchor-ladder の再現手順を壊すと実測報告 →
「１コマンドに寄せるほうがわかりやすいかな」。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "7a1c6291-7113-412d-a795-707a6cfc3b30",
      "work_item_id": "bench-one-command",
      "session_key": "direction-bench-one-command",
      "occurred_at": "2026-07-26T20:00:12.298Z",
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
            "time-scope",
            "external-reality"
          ],
          "question": "How should the published `arena` command be retired: immediate removal, temporary deprecated alias, or permanent alias — given anchor-ladder docs record `arena` invocations as the reproduction commands for public baselines and the package is published on npm?",
          "context_refs": [
            "docs/anchor-ladder-v1.md",
            "docs/anchor-ladder-v2.md",
            "npm laplacebench 0.1.1",
            "README Quickstart"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "simplified",
          "requested_evidence": null
        },
        {
          "id": "T002",
          "families": [
            "concept",
            "external-reality"
          ],
          "question": "Did the 'thought it would auto-submit' misunderstanding actually occur on the `arena` path (which never mentions submission)? If it occurred on the `play` path, merging commands would not address the real cause.",
          "context_refs": [
            "proposal rationale section"
          ],
          "author_position": "REVISE",
          "outcome": "evidence-found",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 77241,
      "input_tokens": 41798,
      "cached_input_tokens": 0,
      "output_tokens": 4081,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 19069,
            "cached_input_tokens": 0,
            "output_tokens": 2541
          },
          "normalized_delta": {
            "input_tokens": 19069,
            "cached_input_tokens": 0,
            "output_tokens": 2541
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 22729,
            "cached_input_tokens": 0,
            "output_tokens": 1540
          },
          "normalized_delta": {
            "input_tokens": 22729,
            "cached_input_tokens": 0,
            "output_tokens": 1540
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
    "transcript_hash": "6b11d9d0d5dad8562c87485af603dc49ce8b854af68905f43d574c74980f301e",
    "decision_context_hash": "5f73a1608fbb83c9d0aa059efc6ab2047aac7bd012659266b60525827cbc7bb6",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Plan review (codex-plan-review, session plan-bench-one-command)

- Q(review/alias-vs-strictness): 「既存 `arena` スクリプトは動き続ける」と
  「厳格な非対話 `play` へ委譲」が矛盾。現行 `arena` は `--team-a` 等の省略を既定で
  受けるが厳格 `play` は拒否する → 受理、**alias は委譲前に現行既定を適用**する形へ。
  厳格化は `play` にのみ入る。引数ゼロ / 個別省略の回帰テストを追加(revise, class: A)。
- Q(review/complete-undefined): 「フラグが揃う」の定義と headless の認証挙動が未定義。
  現行 `authGate` は CLI 不在でループし product-cpu の値を対話で聞く → 受理、必須
  (`--team-a`/`--team-b`)・任意既定・条件付きをフラグ単位で明文化し、headless は
  **prompt せず不足を全列挙して即失敗**と規定(revise, class: A)。
- Q(review/submission-output-untested): 本スライスの本体である「提出状態を必ず言う」
  が、`submitRun` 呼び出しの確認だけで出力を固定していない → 受理、未提出／提出成功／
  提出失敗の3状態すべてを出力アサーションで固定(revise, class: B)。
- Q(review/community-readme-missed): `submissionGuidance` だけ直すと、リンク先の
  `community/README.md`（手動手順のみ）と食い違う → 受理、インベントリへ追加し
  `laplacebench submit` を第一手に(revise, class: C)。
- Q(review/removal-event-vague): alias 撤去条件「次に再測定したとき」が判定不能 →
  受理、**v1 と v2 の両方**が `play` で実行したコマンドとその測定値へ更新された
  ことを条件とし、alias 横のコメントに両文書を名指しで記載(revise, class: C)。
- Q(review/product-flags-not-allowlisted): `--product-repo` / `--product-commit` が
  認可フラグ一覧に無く、「未知フラグはエラー」と衝突して認証契約が要求する引数を
  拒否する → 受理、条件付き入力として環境変数フォールバックごと明記(revise, class: A)。
- Q(review/flag-syntax-undefined): 現行パーサでは `--team-a`（値なし）が真偽値 true に、
  **`--submit false` が真値文字列**になる。後者は「既定では提出しない」を明示的に
  false と書いたユーザーが提出されるという実害 → 受理、値必須フラグと presence-only
  真偽フラグを分け、値付き `--submit` / `--swap` はエラー。検証は認証・対局開始より
  前に行う。事故の回帰テストを追加(revise, class: A)。
- Q(review/seed-default-contradiction): 「既定は arena と同一」と書きながら
  `--seed` だけ乱数としており自己矛盾 → 受理、alias は 42 維持・`play` は乱数を選び
  採用値を出力、という意図的な差として明記(revise, class: B)。
- ラウンド 3・指摘計 8 件で APPROVED（confidence 0.98）
