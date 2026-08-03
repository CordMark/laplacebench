# work item: npm-cli-0-3-1-release — tier: heavy

Slice: npm `laplacebench@0.2.6` 以降の current `main` を、既定契約変更を正直に示す
recovery version `0.3.1` として clean Git source から検証・公開する。未発行 `0.3.0` は
一回だけのEOTP failure後にregistry absentを確認済みで、永久に再試行しない。プラン:
`docs/plans/2026-08-03-npm-cli-0-3-1-release.md`。

Requirement source: ユーザー対話 2026-08-03。「では最新版までを反映しようか認証は
こっちでやるよ」。

## Direction dialogue (human-direction-proxy)

```json
{
  "direction_trace_v1": {
    "event": {
      "event_id": "61ad5053-ca8b-4128-ac4e-6491793d6b7a",
      "work_item_id": "npm-cli-0-2-7",
      "session_key": "direction-npm-cli-0-2-7",
      "occurred_at": "2026-08-03T14:43:30.436Z",
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
            "value-cost"
          ],
          "question": "patch (0.2.7) は ^0.2.x 利用者へ自動配布される。35 commits の中に CLI 外部契約（コマンド・フラグ・デフォルト・出力・ファイル形式）の変更が実際に無いことを diff/ログで確認したか。追加のみなら patch で良いが、既存挙動の意味が変わるなら minor が正直。",
          "context_refs": [
            "docs/plans/2026-07-27-npm-cli-release.md"
          ],
          "author_position": "REVISE",
          "outcome": "changed",
          "effect": "premise-corrected",
          "requested_evidence": null
        }
      ],
      "duration_ms": 40229,
      "input_tokens": 36003,
      "cached_input_tokens": 3107,
      "output_tokens": 1990,
      "tool_calls": 0,
      "accounting_records": [
        {
          "turn": 1,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 16616,
            "cached_input_tokens": 1434,
            "output_tokens": 1291
          },
          "normalized_delta": {
            "input_tokens": 16616,
            "cached_input_tokens": 1434,
            "output_tokens": 1291
          },
          "reason": null
        },
        {
          "turn": 2,
          "provider": "claude",
          "mode": "per_turn",
          "prior_raw_total": null,
          "current_raw_total": {
            "input_tokens": 19387,
            "cached_input_tokens": 1673,
            "output_tokens": 699
          },
          "normalized_delta": {
            "input_tokens": 19387,
            "cached_input_tokens": 1673,
            "output_tokens": 699
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
    "transcript_hash": "b07b9b2b331d81f705b9e26db352c412153300d058480da7946e52536c1ec6a6",
    "decision_context_hash": "6d57180d1e8c25c16ae7d4d15d68b94be02e7210b8f24606edb31e5ebcaf445f",
    "method_version": "skill:57065644ef2aaebacb2b3a90de7c880b29efcee9066aa29ce4aba8af99b72c25;runner-prompt:36ae571bb41025d0b95c7eabe2326d8d4cc552d35e4d060cf2991bd990e5ede2;schema:fbcf01d4a0fee3d9fecdf88782a9e9f04512c0505e1797843f4fcbe7dce0aa3f;providers:claude;model:claude-fable-5;retrieval:ce7971d6242529f40b6ae48c108d897201caae653b1657cea77522f6b121ae2d",
    "turns": 2
  }
}
```

## Runtime publication reconciliation / plan revisit

- Q(author/write-time-webauth): `npm whoami === ykei` のbrowser login後も、piped stdoutで実行した
  one-shot `npm publish` はEOTPとwrite-time `authUrl`を返して終了し、registryに `0.3.0` は
  作られなかった。同versionを再試行してよいか。
  - 弁明: approved planはsuccess/failureを問わず同versionを再試行しない。npm 11.17.0
    `lib/utils/auth.js#otplease` の実コードはstdin/stdout両方がTTYのときだけweb authを開いて
    同一command内部でOTP付きrequestへ進む。前回は `tee` pipeがstdoutのTTY性を失わせた。
  - 裁定: plan-revisit。`0.3.0`を永久に未発行のまま再利用せず、`0.3.1` recoveryへ進める。
    publish commandはpipe/redirectなしのlive TTYで一度だけ実行し、同じinvocation内のbrowser
    challenge完了を待つ。
  - by: auto
  - prediction: none

## Plan review (codex-plan-review, session plan-npm-cli-0-3-0-release)

- Q(review/package-lock-boundary): default `npm pack` が checkout に tarball を書き、
  `--ignore-scripts` が product-CPU concurrency lock を迂回するため、clean tree / immutable
  payload gate が実装不能 → 受理。external `--pack-destination` を使い、canonical lock を
  final two-pack、verification、one-shot publish 全体で明示保持し、tracked diff・allowlisted
  lock sentinel・payload digest を publish 直前まで fail-closed に再確認する
  (revise, class: A)。
- Q(review/publisher-identity): `npm whoami` の「expected owner」が未定義で、任意の認証済み
  account を不可逆 publish 前に受理できる → 受理。registry owner/maintainer の sole account
  `ykei` を allowlist とし、公開直前の owner drift は停止、`whoami === ykei` を必須にする
  (revise, class: A)。
- Q(review/help-version-smoke): 現CLIの `--help` は exit 1 で version を出さないため、計画した
  success/version smoke は通らない → 受理。version は installed package manifest と registryで
  検証し、usage は既存 contract の exit 1 と current content を明示 assertする。help/version
  runtime変更は本releaseへ混ぜない(revise, class: B)。
- ラウンド 2・指摘計 3 件で APPROVED（confidence 0.98）

## 2026-08-03 npm CLI 0.3.0 release [impl]（tier: heavy）

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.95。残る clean release commit後の
  final two-pack、digest再確認、one-shot publishはapproved planの不可逆境界gateとして維持）

## Impl review (codex-impl-review, session impl-npm-cli-0-3-0-release)

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.98。metadata diff、immutable 0.2.6、
  owner/auth、canonical lock、inventory/leak、one-shot publish境界を確認。final two-pack、push、
  auth、publish、external acceptanceはapproved planどおりpost-commitで実行）

## Recovery plan review (codex-plan-review, same session plan-npm-cli-0-3-0-release)

- Q(review/stale-slice-summary): current work-item要約だけが correction後も `0.3.0` publishを
  主張していた → 受理。current要約を `0.3.1` recoveryと未発行 `0.3.0` の永久no-retryへ
  更新し、historical trace/review entryは変更しない(revise, class: C)。
- ラウンド 2・指摘計 1 件で APPROVED（confidence 0.99。live-TTY single-invocation webauth、
  canonical lock、exact artifact、owner allowlist、no-retry/no-overwrite境界を確認）

## 2026-08-03 npm CLI 0.3.1 recovery [impl]（tier: heavy）

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.95。recovery delta、direction correction、
  npm 11.17.0 live-TTY webauth premise、0.3.0/0.3.1 symmetric no-retryを確認。browser challengeと
  publicationはapproved planどおりpost-commitの単一invocationで実行）

## Recovery impl review (codex-impl-review, same session impl-npm-cli-0-3-0-release)

- ラウンド 1・指摘計 0 件で APPROVED（confidence 0.99。manifest/lockの0.3.1整合、historical
  0.3.0 evidence、high-risk correction、live-TTY webauth、owner/source/digest/lock境界、immutable
  0.2.6、symmetric no-retryを確認）

## Publication evidence

- unissued recovery boundary: `0.3.0` one-shot commandはknown EOTP failure、registry E404を確認し
  retryなし
- clean source / registry `gitHead`:
  `e36694196eafde5183251f18887f920122ed05ce`
- final two-pack: 97 files / 36 safe source maps / version `0.3.1` / byte-identical /
  inventory・secret scan・isolated install・usage・baseline・verify・ambient fail-closed smoke pass
- expected and registry integrity:
  `sha512-xUV+5MPDO4kS9p+xCoYPBty1qnZmr5/UK+Sji8kH/Ggo68N5PW807S9bf5odA1vaRhVC8gwlj1HtiB/r5QDxYA==`
- expected and registry shasum: `15378dcd8125f37e507bfeac0aff33a87d59f1b3`
- npm `latest=0.3.1`; published `2026-08-03T15:09:40.116Z`
- GitHub source commit checks: CI success、Publish community arena success
- isolated external acceptance: public `laplacebench@latest` manifest `0.3.1`、current usage、baseline
  game、1/1 verify、未提出を確認。interactive `play` は Team A provider menuまで到達しEscで中止、
  モデル未選択・対局未開始
- canonical package lock released、working tree clean


```json
{
  "direction_correction_v1": {
    "correction_id": "f83b3da5-bc65-4293-8b2a-5318e9884418",
    "related_direction_event_id": "61ad5053-ca8b-4128-ac4e-6491793d6b7a",
    "occurred_at": "2026-08-03T15:00:35.201Z",
    "source": "author-runtime",
    "missed_families": [
      "external-reality",
      "process",
      "time-scope"
    ],
    "summary": "The one allowed 0.3.0 publish attempt failed before issuance because npm required a write-time web authentication challenge. Registry reconciliation confirms 0.3.0 is absent; the approved no-retry rule therefore requires a reviewed 0.3.1 recovery release.",
    "effect": "premise-corrected",
    "high_risk": true
  }
}
```
