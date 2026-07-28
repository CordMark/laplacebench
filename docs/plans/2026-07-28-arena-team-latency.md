---
status: implemented
direction: direction-arena-team-latency
owner: bench
risk_tier: heavy
last_updated: 2026-07-28
external_consumer: /Users/kei/projects/laplace-main/web
---

# Arena catalog にサイド別応答時間を発行する

## Direction Brief

1. **Purpose** — Web が matchup と各対局にモデル別の一手平均応答時間を表示できるよう、
   新しく発行する `laplace-bench-arena-v1` の各 game に、検証済み replay と同じサイド別
   平均レイテンシを載せる。過去 artifact は書き換えず、未計測を 0 と偽らない。
2. **Concept owner** — 各 replay の検証済み `bench.stats.<side>.avgLatencyMs` が値の正本。
   既存 `headlineKind` が、現在の adapter 群で latency を報告する `llm` / `product-cpu` と、
   報告しない `baseline` の公開 identity 分類を所有する。catalog は表示用の derived copy。
3. **Lifecycle and scope** — replay build が clean stats を artifact result に公開し、arena build が
   `team_latency_ms: {A,B}` を全新規 game に発行する。Web parserを先に本番へ届け、受理確認後に
   bench `main` をpushして自動publicationを走らせる。npm publish/tagはユーザーが後日所有する。
4. **Value hierarchy** — live consumer無停止 > replayとの値一致・未計測null > additiveな旧artifact
   互換 > 実装量。既存の全run/replay schemaを書き換えるsample counterより、現在の公開agent-kind
   contractを明示してfail-loud testで固定する。
5. **Adopted direction** — `llm` / `product-cpu` はclean replayの非負safe integerを0も含めてそのまま
   転記し、`baseline` はturn数に関係なくnull。 producer typeでは新artifactの必須field、consumer
   type/parserでは旧artifactのためoptional。Web parserはexact-key allowlistとshape validationを追加し、
   malformedなside/key/値はcatalog全体を拒否する。
6. **What disappears / is not protected** — game durationからの再計算、catalog内の合算値、schema v2、
   旧artifact backfill、baselineの見せかけ0、未知shapeのsilent fallback、Web未対応のままのbench push、
   npm publish/tag、実データ公開前の本番表示成功の主張は行わない。

## Tier: heavy

公開producer/consumer間のexternal contractと、自動publicationのrelease sequencingを変更するためheavy。
schema名・既存artifact・永続data meaningは変えないが、direction、plan review、implementation checkpoint、
implementation review、実consumer acceptanceを通す。

## Contract inventory

Search terms: `avgLatencyMs`, `latencyMs`, `actCalls`, `team_tokens`, `PublicGame`, `parseArenaCatalog`,
`headlineKind`, `community-publish`, `arena.json`。

| Occurrence | Classification | Target |
|---|---|---|
| `packages/cli/src/exportweb.ts` `bench.stats.*.avgLatencyMs` | canonical replay value | unchanged; round(latencyMs/actCalls), validated downstream |
| `packages/cli/src/publicreplay-meta.ts` | canonical publication validation | existing exact/nonnegative-safe-integer validationを維持 |
| `packages/cli/src/publicreplay.ts` `PublicReplayArtifact` | validated handoff | clean stats由来のside latencyを追加 |
| `packages/cli/src/publicarena-contract.ts` `PublicGame` | producer contract | required `team_latency_ms` shapeを追加 |
| `packages/cli/src/publicarena.ts` | derived catalog publisher | baseline=null、llm/product-cpu=artifact valueを発行 |
| `packages/cli/src/publicgames.ts` `headlineKind` | canonical public kind classifier | telemetry policyへ再利用、未知kindは既存fail closed |
| `packages/cli/src/cli.ts` `makeAgent`全branch | canonical accepted-adapter registry | catalog choicesではなく全accepted specをtelemetry classification tableへ列挙 |
| `packages/cli/src/agents/{random,greedy,centergreedy,chaos,takeshi}.ts` | baseline reply paths | latency omissionをregistry-complete test evidenceへ固定 |
| `packages/cli/src/agents/{cli,llm,learning,productcpu}.ts` | measured reply paths | success/error/timeoutとlearning wrapperを含むlatency presenceをfocused testsへ固定 |
| `packages/cli/test/speed-visibility.test.ts` | focused contract regression | replay/catalog一致、baseline null、zero保持を検証 |
| `packages/cli/test/publicarena.test.ts` | publication/determinism regression | new field presence、canonical bytes、limitsを検証 |
| `.github/workflows/community-publish.yml` | automatic release lifecycle | unchanged; main pushが即発行するためWeb production greenを前提化 |
| `packages/cli/README.md` | current public-arena contract docs | field/null/old-artifact semanticsを追記 |
| Web `contracts.ts` / `parseArenaCatalog.ts` / resolver tests | external consumer | optional field宣言、exact parse、malformed rejection、old omission acceptance |

## Implementation

1. `PublicReplayArtifact` に clean stats から作る `{A:number,B:number}` を追加し、replay JSON bytesを
   再parseしたり`final.json`から再計算したりせず同じvalidated objectを起点にする。
2. `PublicGame`に`team_latency_ms`を追加。arena buildでは各sideのrecorded agentを`headlineKind`で分類し、
   baselineならnull、それ以外ならartifact値を転記する。値を再round/defaultしない。
3. `makeAgent` の全accepted branch（`random`、`greedy`、`center-greedy`、`center-greedy:wN`、`chaos`、
   `takeshi`、`takeshi:dN`、product CPU、Anthropic、learning Claude CLI、Claude CLI、Codex CLI）を
   table化したcanonical runnable-spec classifierを`publicgames.ts`に置き、`makeAgent`とarena emissionが同じ
   parsed unionを使う。factoryは全returned agentをlatency contract wrapperで包み、measured familyの全reply
   （success/error/timeout）が`latencyMs`を持つこと、baselineが持たないこと、値が非負safe integerであることを
   runtime fail-loudにする。
   catalogのadvertised choicesをcomplete registryとはみなさない。table testは全factory branchを列挙し、
   baseline=false、LLM/product CPU=trueを要求する。adapter追加時にregistry inventory testが未分類specを検出し、
   wrapper testsはsuccess/error/timeoutとbaseline omission/reporting violationを固定する。unrunnable historical
   opaque specはclassifier nullであり、baselineへ分類せずcatalog latencyをconservative nullにする。
4. Web consumerはfield absenceを許容し、presentならexact `{A,B}`、各値はnullまたは非負safe integerのみ受理。
   parsed resultへ値を保持し、既存UIがデータ到着時に表示できるようにする。
5. docsにcatalog field、null semantics、old artifact compatibility、release orderを追記する。

## Verification and release order

1. Focused bench tests: replay/catalog exact equality、LLM/product CPU numeric、baseline null、0保持、malformed
   replay rejection、deterministic bytes、old fixture behavior。
2. Focused Web parser tests: present numeric/null acceptance、absence acceptance、negative/fraction/missing side/extra key/
   wrong type rejection。既存のmodel panels/game chips集計テストと日英表示を再実行。
3. Web: `npx tsc --noEmit -p web/tsconfig.json` とfocused Jest（repo ruleによりbuildは実行しない）。
   parser compatibilityはUIと分離した先行commitにし、producer公開後はrevert禁止のcompatibility floorとする。
   heavy checkpointとimpl review後、reviewed commitsをremote `dev`へpromoteし、同じcommitsを`main`へpromote。
   production Vercel workflow成功とproduction parser acceptanceを確認する。
4. Bench commands: `npm run check-product-cpu --workspace laplacebench`、`npm run typecheck`、`npm test`、
   `npm run build`、`npm audit --omit=dev`、`npm pack --workspace packages/cli --json`をclean temp outputへ2回、
   file list/SHA-256/npm shasum/integrity/size一致を比較し、fresh temp install後にbundled CPU headless playと
   `laplacebench verify`を実行する。`packages/cli/README.md`にfield/null/compatibilityを記録する。
   heavy checkpointとimpl review後にcommitし、Web production確認後だけ`main`へpushする。
5. Bench push後のcommunity publication workflow成功、standingsのarena.jsonにfieldがあり、Webがcatalogを
   rejectしないことを確認する。実表示の最終目視はlatency-bearing artifactを使い、npm publishはしない。

## Failure and rollback

- Web productionがgreenでなければbench commitはpushしない。bench publication失敗はworkflowのfailed stateと
  last-success pointerを維持し、必要ならbench commitをrevertして再発行する。
- producer field公開後、Web parser compatibility commitはUI rollbackに含めない。Webまで戻す必要がある場合は、
  先にbench producerをrevertしてold-fieldless arenaを正常再発行しproductionがそれを読むことを確認してから、
  最後にparser compatibilityをrevertする。
- field shape/valueがreplayと不一致ならpublicationを止め、duration等から補完しない。
- Web UIはfield absent/nullを非表示にし、0は測定値として表示する。過去artifactは変更しない。

## Completion criteria

- 新規arena gameがexact `{A,B}` fieldを持ち、数値はreplayと一致、baselineはnull
- Web parserが新旧両artifactを受理し、malformed present fieldをfail closedで拒否
- Web productionが先にgreen、bench publicationが後にgreenで無停止
- required heavy gatesとfull regressionsがAPPROVED/green
- version 0.2.5のcommit/pushまで完了し、npm publish/tagは未実行
