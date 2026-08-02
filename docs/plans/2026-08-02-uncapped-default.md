---
status: implemented
direction: exempt
owner: bench
risk_tier: standard
last_updated: 2026-08-02
---

# 既定トークン上限の撤廃(コストはルールではなく列)

## Direction Brief

1. **Purpose** — トークン上限は測定目的ではない(ユーザー裁定)。既定の上限を
   なくし、消費・レイテンシは強さの隣の**列**として記録・表示する
   (design-v0.1 §3.3)。これにより harness 比較が「上限との相互作用」ではなく
   持ち越し設計そのものを測れるようになる(Run 9 で上限が勝敗を支配した教訓)。

2. **Direction source(exempt の根拠)** — proxy ではなく**人間の直接裁定**:
   ユーザー対話 2026-08-02「トークン上限っていう概念は本質的に自分がやりたい
   ことじゃないから、1回取り払ってもいいぐらい」+ 撤廃範囲を全新規 run とする
   推奨への明示同意「この3点に関しては全てあなたの推奨に同意する」。
   direction doc には反映済み(§4、実装待ち注記つき — 本スライスで解消)。

3. **Concept owner** — 従来どおり `packages/cli/src/runner.ts` 系の resolution が
   既定を所有する。既定は「上限なし」になるため `CANONICAL_OUTPUT_TOKEN_BUDGET`
   定数は削除し、`resolveMatchResources` は明示 `--output-token-budget` のみを
   予算にする。明示指定時の enforcement(admission check・token_budget pass・
   开示)は**不変**(道具は残る、既定が消えるだけ)。

4. **Adopted direction** —
   - `resolveMatchResources`: LLM 対局でも既定 budget = undefined。turn timeout
     (LLM 1,200,000ms / baseline 300,000ms)と max-plies 100 は不変。
   - `CANONICAL_OUTPUT_TOKEN_BUDGET` を削除し、cli help の補間を「既定なし・
     明示フラグは任意の上限」へ書き換え。help に既定値リテラルを復活させない
     (既存の drift-guard assertion を新契約に合わせて更新)。
   - docs 同期: match-conduct へ現行値エントリ「(2026-08-02〜)既定なし。
     コストは列として記録・表示。明示フラグと過去 run の記録値は不変」を追加し
     600k/350k/250k は日付つき履歴として保持。usage-semantics の系譜文を更新。
     packages/cli/README の既定記述と進行例(no-budget 時はトークン節が省略
     される実挙動に合わせる)。direction doc の「実装待ち」注記を **§2 / §4 / §7 / §9 / §9.5 の5箇所**すべて解消。
   - run.json は既存挙動のまま `output_token_budget_per_team_per_game: null` を
     記録(additive 変更なし)。
5. **What disappears / is not protected** — 既定の 600k(履歴として記録は残る)。
   `CANONICAL_OUTPUT_TOKEN_BUDGET` という概念。既定上限による暴走防止(時間と
   max-plies が引き続き上限。サブスク消費は運営者の判断)。「効率が強さになる」
   競技テーゼ(§9.5 で改訂済み)。過去 run・明示フラグ・enforcement 機構は
   守る(不変)。

## Tier: standard

既定リソース契約(通常挙動)の変更。金銭・認可・不可逆・過去 run 再解釈なし。

## Source-of-truth inventory

Search terms: `CANONICAL_OUTPUT_TOKEN_BUDGET`, `output-token-budget`, `600`,
`600000`, `budget`。

| Occurrence | Classification | Target |
|---|---|---|
| `runner.ts CANONICAL_OUTPUT_TOKEN_BUDGET` | canonical | 削除 |
| `cli.ts resolveMatchResources` / help 補間 | derived | 既定 undefined / 「既定なし」文言 |
| `test/token-budget.test.ts` | 回帰 | 既定 undefined・明示フラグ有効・help 無リテラルへ更新 |
| `docs/match-conduct-laplace-8x8-v1.md` | 契約説明 | 現行=既定なし、600k は履歴へ |
| `docs/usage-semantics.md` / `packages/cli/README.md` | derived doc | 系譜・既定記述・進行例更新 |
| `docs/harness-lab-direction-ja.md` の実装待ち注記(§2/§4/§7/§9/§9.5) | direction 正本 | 注記解消(実装済みへ) |
| 過去 run / 明示フラグ / enforcement 経路 | 不変 | — |

## Implementation

上記 inventory の順に機械的に適用。budget undefined 時の既存挙動
(formatProgressLine のトークン節省略、runner の enforcement スキップ、
TurnInput.outputTokenBudget undefined)は既にテスト済みの経路であり新規分岐なし。

## Tests and verification

- token-budget.test.ts: LLM 対局の既定が undefined、baseline も undefined、
  明示フラグが従来どおり効く、help に既定値リテラルが無い。
- 既存回帰 `npm test` 全体(enforcement 系テストは明示 budget 付きで不変に
  green のはず)。
- 実機 smoke 不要(既定値の変更のみで、budget 無し経路は既存テスト済み)。

## Failure and rollback

- **上限なし run がまだ存在しない時点**: 定数と derived 面の一括 revert が有効。
- **上限なし run が生まれた後**: 単純 revert は歴史を偽るため不可。600k 既定を
  「再導入」として実装し、match-conduct / usage-semantics へ「既定なし期間
  (2026-08-02〜再導入日)」を日付つき履歴として残す。help・direction doc の
  該当5箇所も再導入として更新する。run 記録値はいずれの場合も不変。

## Completion criteria

- 既定なしが help・契約文書・direction doc と整合し全テスト green。
- codex-impl-review APPROVED。
