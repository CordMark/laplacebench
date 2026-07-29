---
status: implemented
direction: direction-token-budget-350k
owner: bench
risk_tier: standard
last_updated: 2026-07-29
---

# Raise the canonical LLM output-token envelope to 350k

## Direction Brief

1. **Purpose** — 新規LLM対局が25万トークン到達後の自動パスで終局を
   歪められやすい状態を減らし、将来のハーネス対局にも現実的な余白を
   持たせる。
2. **Concept owner** — チーム/局ごとの出力トークン封筒の正準値は
   `packages/cli/src/runner.ts` が所有し、`packages/cli/src/cli.ts` はその値を
   default resolutionとhelpへ導出する。現行契約の説明は
   `docs/match-conduct-laplace-8x8-v1.md` と `docs/usage-semantics.md` が所有する。
3. **Lifecycle and scope** — 2026-07-29以後に既定値で開始するLLM含有対局
   だけを35万へ変更する。過去runは記録済みの予算値を保持し、明示的な
   `--output-token-budget`、baseline-only対局、1200秒timeout、100 plies、
   admission/overshoot/pass機構は変えない。
4. **Value hierarchy** — 予算枯渇による勝敗歪みの低減 > 将来ハーネスへの
   一手分以上の余白 > 有限な公平性・利用量境界の維持 > 予算値を無視した
   過去runとの見かけ上の比較互換。
5. **Adopted direction** — 正準既定値を350,000 output tokens/チーム/局へ
   上げる。公開台帳の長いGPT-5.6 Sol high 4例は254,272 / 258,356 /
   282,156 / 283,682、次点のOpus 5 highは159,038 / 183,502、全LLM側
   中央値は144,770。単純な5万刻みのうち、全観測値を上回り、かつ最大値
   より観測上の最大級1手分（約41k）以上を残す最小値として350kを採る
   （300kは後者を満たさない）。runに記録された予算を比較境界とする。
6. **What disappears / is not protected** — 将来LLM対局における250k既定値。
   あらゆる100-ply heavy-harness対局の完走保証、無制限の思考量、過去runの
   再ラベル、予算値を無視した同条件扱いは保護しない。

## Implementation

### 1. Canonical default

- `packages/cli/src/runner.ts` の
  `CANONICAL_OUTPUT_TOKEN_BUDGET` を `350_000` に変更する。
- `resolveMatchResources`、runnerのadmission判定、run/event記録、モデルへの
  開示は既存の定数・値スレッドをそのまま使う。新しい分岐や互換shimは
  追加しない。
- プロンプト構造と記録フィールドは不変で、具体値はrunごとに既に開示・
  記録されるため `PROMPT_REV` は変更しない。

### 2. Current-contract documentation

- `packages/cli/src/cli.ts` のhelpを350000へ更新する。
- `docs/match-conduct-laplace-8x8-v1.md` は250kの2026-07-24/25判断を
  履歴として残し、2026-07-29の350k採用、根拠分布、選択規則、過去run
  不変を追記する。見出しの「暫定確定」は現在値が分かる表現へ改める。
- `docs/usage-semantics.md` の現行既定値を350,000へ更新し、予算値がrun条件
  であることを明示する。
- `packages/cli/README.md` のresource controlsに現行既定値を明記し、現在の
  一般的なprogress例 `out .../250k` も `.../350k` へ更新する。
- 実装済み旧plan、pilot結果、旧対局の250k表示、任意fixtureとしての250k
  は歴史的・局所的事実なので書き換えない。

### 3. Tests

- `packages/cli/test/token-budget.test.ts` に正準定数が350,000である明示assert
  を置き、LLM既定値がその定数へ解決される既存assertを維持する。
- 明示override、baseline-onlyの予算なし、admission overshoot、任意予算の
  prompt/observation fixtureは既存回帰として維持する。
- stale-current-default回帰として、CLI help、現行契約文書、READMEの一般的な
  progress例に250000/250kを現在の既定値として示す表現が残らないことを
  対象確認する。歴史文書と明示的な局所fixtureは検索除外する。

## Verification

- `npm run typecheck`
- Node 22で `npm test`
- CLI helpに `default 350000` が出ること。
- focused default-resolution testでLLM=350k、baseline=undefined、明示値優先。
- 実対局の再走は行わない。定数変更の機構はテストで検証し、値の採用根拠は
  既存公開台帳の実測を使う。
- `/codex-impl-review` APPROVED後にコミットする。

## Rollback

定数・現行help/doc・正準値assertを250kへ同時に戻す。過去run、schema、
公開artifactのmigrationや再生成は不要。

## Out of scope

- token budget機構、usage semantics、prompt generation、timeout、max plies、
  公開schemaの変更。
- プロバイダ側のmid-generation hard cap。
- 35万を保証値とする自動調整やモデル別予算。
- 過去対局の再実行・再分類。
