---
status: approved
direction: exempt
owner: bench
risk_tier: standard
last_updated: 2026-08-03
---

# harnesslab.json に played_at を追加(Arena パリティの producer 側)

## Direction Brief

1. **Purpose** — laplace-main の Arena パリティ指示(ユーザー 2026-08-03
   「まだアリーナ側とだいぶ差がある…もっとアリーナ側の実装とUIを確認して」)の
   producer 側成分。arena.json の games は `played_at` を持ち UI が対局日時と
   「最終対局」を表示するが、harnesslab.json の games には時刻が無く、
   laplace-main 側パリティスライス(2026-08-03-harness-arena-parity、
   APPROVED)が G4.1 として「consumer が optional 受理を先に出し、producer
   追加は後続スライス」と二段構えを事前登録した。本スライスがその後続。

2. **Direction source(exempt)** — 上記ユーザー指示+laplace-main 側
   approved plan の事前登録済み sequencing。値の新設ではなく既存記録値
   (game_end.ts)の露出。

3. **Adopted direction** —
   - `HarnesslabGame`(`harnesslab.ts`)に `played_at: string` を追加し、
     game entry 組み立てで `artifact.playedAt` を出力(= events の
     `game_end.ts`、公開 replay の `bench.exported_at` と**同一値** —
     既に公開済みの時刻情報であり新たな露出はない)。
   - schema 名は `laplace-bench-harnesslab-catalog-v1` のまま(additive)。
     現行の唯一の consumer(laplace-main dev の /bench/harness)は
     パリティスライスで optional 受理済みになる。
   - **publish フェンス(rollback 逆順の遵守)**: 本スライスの main への
     push(= CI publish)は **laplace-main パリティスライスの dev マージ後**
     に限る。コミットまで作り、push はフェンス充足後に orchestrator が行う。
   - games の並び・matchup 集計・arena.json は不変(arena golden 不変を
     全体スイートで確認)。

4. **What disappears** — なし(既存フィールド・並び・検証は全て不変)。
   consumer 側の必須化(optional のまま — 過去 artifact との互換)。

## Tier: standard

公開 artifact contract への additive フィールド1点。金銭・認可・migration
なし。検証・並びの意味論不変。

## Inventory

| 対象 | 変更 |
|---|---|
| `packages/cli/src/harnesslab.ts` | `HarnesslabGame.played_at` 型追加+組み立てで `artifact.playedAt` を設定 |
| `packages/cli/test/harnesslab.test.ts` | played_at が RFC3339 で各 game に存在し、対応する公開 replay の `bench.exported_at` と一致することの assert を追加 |
| 全体回帰 | `npm test` 全 green(**arena golden 不変** = arena.json バイト不変の証明) |

## Verification

`npm test` 全 green。ローカル `public-arena` 実行で harnesslab.json の全 24
games に `played_at` が付き、arena.json のバイトが不変(golden green)である
ことを確認。

## Failure / rollback

additive のみ。producer 稼働後に consumer 側だけを巻き戻さない(パリティ
スライスのフェンス: consumer の optional 受理は残す)。producer 巻き戻しは
フィールド除去のみで安全。
