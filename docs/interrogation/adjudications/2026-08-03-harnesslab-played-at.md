# 2026-08-03 harnesslab-played-at — tier: standard

Work item: harnesslab.json games への `played_at` 追加(laplace-main Arena
パリティスライスの producer 側成分、cross-repo 二段 sequencing の後段)。
Plan: `docs/plans/2026-08-03-harnesslab-played-at.md`(direction: exempt —
ユーザーパリティ指示+laplace-main approved plan の事前登録)。

## Plan review (plan-harnesslab-played-at): 1ラウンド APPROVED (0.97)

additive フィールド+v1 維持+publish フェンス(laplace-main の optional
受理 dev マージ後にのみ push)+rollback 逆順(consumer 受理は残す)を承認。

## Impl review (impl-harnesslab-played-at): 1ラウンド APPROVED (0.99)

`artifact.playedAt` 直接代入(bench.exported_at と同一の検証済み game_end.ts、
再導出なし)・validator 追修不要(replay 経路の assertTimestamp が fail-loud)・
テスト(RFC3339 形式+replay bench.exported_at とのバイト等値)を確認。
305/305 green(arena golden 不変)。全24局に付与を public-arena 実出力で確認。

## Publish フェンス

**push 保留中** — laplace-main `agent/harness-arena-parity-dev` の dev マージ
後に orchestrator が push(= CI publish)する。
