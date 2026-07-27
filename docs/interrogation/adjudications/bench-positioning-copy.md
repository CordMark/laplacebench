# Bench positioning copy（README + bench UI 文言の書き換え）

## 2026-07-27 positioning-copy [impl-review]（tier: light）

軽量スライス: laplacebench README のポジショニング書き換え + laplace-main
bench UI 文言（Hero・記録注記・OG description）+ dev launch config。
方向づけはユーザー指示（本セッション）: ①主張の主軸はベンチマーク信頼性
（固定テストセットの汚染・最適化への対抗として「答案用紙ではなく対戦相手」）、
②対戦の決着性を第一級の主張に、③汚染ゼロ主張は日付+ルールセット版数付きの
検証可能形で強めに、④「凍結エンジン」は内部用語なので UI から撤去
（README には残す）、⑤README に「What a match measures」と将来イベント
（split-context 2v2 / vision / harness 部門）を追記。

## Impl review (codex-impl-review, session impl-bench-positioning-copy)

- Q(review/decisiveness-overclaim): 「every result is a win or a loss」は
  ルールブックの horizon/repetition draw と `winner: null` を出す実装に矛盾
  → 受理。tagline を「head-to-head results, not leaderboard scores」に、
  本文は「win, loss, or the occasional draw」、UI は「対戦成績 /
  head-to-head record」に改訂（revise, class: B）。
- Q(review/unprovable-global-negative): 「no games/theory/discussion exist
  outside this project」は証明不能な全称否定、UI の「まだ誰も定石を知らない」
  も同型 → 受理。README は「we know of no ...」（日付+版数維持）、UI は
  ゲームの新しさに接地した「まだ定石が生まれていない / too new to have any
  established theory」に改訂。検索方法論ページの整備は軽量スライスに不釣合
  として reject（qualifier で誠実性を担保）（revise, class: B）。
- Q(review/retired-wording-unregistered): 固定チェック4 — 撤回文言が回帰
  ゲートに未登録 → 受理。laplacebench に
  `packages/cli/test/positioning-wording.test.ts`（README への
  nobody knows / absent from training data / tracking a full board /
  pure thinking の再侵入を禁止）、laplace-main に
  `web/src/__tests__/unit/BenchCopyRegression.test.ts`（bench UI 2面への
  凍結/frozen の再侵入を禁止）を新設（revise, class: B）。
- ラウンド 2・指摘計 3 件で APPROVED（confidence 0.97）
