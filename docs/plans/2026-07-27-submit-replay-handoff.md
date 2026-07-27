---
status: approved
direction: direction-submit-replay-handoff
owner: bench
risk_tier: heavy
last_updated: 2026-07-27
related_plan: /Users/kei/projects/laplace-main/docs/plans/2026-07-27-bench-replay-handoff.md
---

# 提出完了から公開リプレイへ直接つなぐ

## Direction Brief

1. **Purpose** — `laplacebench play` で対局と自動提出を終えた人を GitHub の
   commit/PRだけで行き止まりにせず、その対局が LaPlace Bench に反映されるまで同じURLで
   待ち、公開後すぐ盤面を観られるようにする。ユーザーは「自動提出までできたら
   laplace bench に移動する動線」「その対局のリプレイのページ」を要望し、2局セットは
   2局とも完了後に一度提出し、2本のリプレイ導線を出す方向を明示承認した。
2. **Concept owner** — run全体のverify/submission lifecycleは `submit.ts`、公開eligibilityと
   `raw_ref`/digestの正本はpublisherの `publicgames.ts` / `publicarena.ts`。CLIは最終提出名から
   strict `raw_ref` の一時locatorだけを作る。digestとready判定はpublisher-issued catalog、
   productはfixed upstreamを読む既存resolverと人向け待機表示だけを所有する。
3. **Lifecycle and scope** — canonical 2局は両局を最後まで実行 → run全体をlocal verify →
   一度だけdirect pushまたはPR → eligibleな各gameのproduct-origin `?ref=` URLを表示。
   製品ページはvalidated catalogにrefが現れるまでbounded pollし、現れたらcatalog-issued
   digestのcanonical `?id=` URLへ置換して既存replay APIで再生する。製品を先にdeployし、
   CLI `0.2.2`を後からimmutable publishする。
4. **Value hierarchy** — run/setの完全性と一度だけの提出 > publisherだけがdigest/readyを
   決めること > 提出直後から迷わない動線 > 待機状態の正直さ > polling負荷の小ささ >
   GitHub進行状況への監査導線。
5. **Adopted direction** — CLIはfinal submission basenameとgame IDから
   `https://laplace.zone/bench/replay?ref=<encoded raw_ref>&lang=ja` をeligible gameごとに表示し、
   commit/PR URLも残す。`ref`は任意URLではなくcatalog内lookup keyで、product serverは
   strict grammarを検証し、verified catalogだけを検索する。404/502/504はbackoff付きで最大
   5分待ち、成功時は`?id=<digest>&lang=...`へcanonicalize、時間切れは手動再確認と
   「公開対象外・検証/公開失敗なら反映されない」説明を出す。通常の`?id`は即時fail-closedの
   まま。2局セットは2局終了後に2リンク、1局ずつ早期提出しない。
6. **What disappears / is not protected** — GitHub-onlyの提出後行き止まりと「viewer未公開」の
   stale commentを削除する。CLIによるdigest予測、`pending=1` flag、per-game早期提出、
   arbitrary src/GitHub fetch、browser自動起動、CLIの長時間待機、無期限poll、新public arena
   schema、ineligible gameへのready保証は作らない。

## Tier: heavy

`?ref=`はCLIから製品への新しいexternal handoff contractで、最終的にpublic npm `0.2.2`を
immutable publishする。既存のfixed-upstream/digest trust boundaryは広げないが、release順序を
誤ると公開CLIが未対応URLを配るため、direction → plan review → product-first implementation /
deploy → producer implementation → heavy interrogation → implementation review → exact releaseの順を守る。

## Settled direction evidence

Human Direction Proxyは、CLIがdigestを予測する初案をversion-skewで永久dead-linkになりうると
指摘した。採用案はpublisher catalogだけがdigestを発行し、CLIは`raw_ref` locatorのみを出す。
`pending=1`も捨て、`ref`自体をready後に消えるtemporary locatorとする。completed traceは
`docs/interrogation/adjudications/2026-07-27-submit-replay-handoff.md`に記録する。

## Source-of-truth inventory

Search terms: `submitRun`, `SubmitOutcome`, `rawRunUrl`, `publicPair`, `raw_ref`, `replay.id`,
`BenchReplayClient`, `getCatalogEnvelope`, `findPublicGame`, `replay_not_found`, `/bench/replay`。

| Surface | Classification | Treatment |
|---|---|---|
| `packages/cli/src/submit.ts` | canonical verify/copy/direct-or-PR lifecycle | final copied basenameからeligible game refsを作り、成功後だけURLを表示/return |
| `packages/cli/src/publicgames.ts#publicPair` | canonical publication eligibility | courtesy filterとして再利用。ready authorityにはしない |
| `packages/cli/src/publicarena.ts` / `publicreplay.ts` | canonical digest/artifact publisher | 変更しない。CLIから呼んでdigestを予測しない |
| `packages/cli/src/publicarena-contract.ts#raw_ref` | producer grammar | existing `assertRawRef`でgenerated locatorを固定 |
| `packages/cli/src/wizard.ts` | derived submit outcome presentation | submitの既存console outputを保持。run/set lifecycleを変更しない |
| `packages/cli/test/wizard.test.ts` | orchestration regression | deferred arenaで2局完了前no submit、完了後exactly once、arena reject時no submitを固定 |
| `packages/cli/src/cli.ts` | standalone submit entry | same `submitRun` outputを受ける。別導線を作らない |
| `packages/cli/test/submit.test.ts` | producer regression | 2 eligible games=2 refs、direct/PR parity、ineligible=0、success前no link |
| `packages/cli/README.md` | packaged user contract | set完了後のGitHub+Bench handoffと反映待ちを説明 |
| `packages/cli/package.json`, root lock | immutable CLI release | `0.2.2`、依存追加なし |
| sibling `contracts.ts` / `parseArenaCatalog.ts` | consumer raw-ref grammar | consumer planで一 ownerへ寄せる |
| sibling replay page/API/tests/docs | product handoff consumer | related consumer planが所有 |

No Decision Record currently governs this handoff. Existing implemented public-arena plans remain normative:
`docs/plans/2026-07-26-public-arena-catalog.md` and sibling
`docs/plans/2026-07-26-bench-public-arena.md`。

## Producer implementation

1. `publicReplayHandoffs(dest, dirName)`（名称は実装で簡潔に調整可）を`submit.ts`の小さいpure-ish
   helperとして設ける。`games/*/final.json`をstable sortで読み、A/B agentを`publicPair`へ渡す。
   eligibleなら`raw_ref=<dirName>/<gameId>`を`assertRawRef`し、game ID、raw ref、encoded product URLを
   返す。replay bytes/digestは作らない。
2. helperはverified runをfinal submission destinationへcopyした後、commit前に評価する。
   real verificationが保証するfinal shapeを信頼し、分類失敗をsilent fallbackしない。
3. direct push / PR createが成功した**後だけ**、既存commit/PR URLに続けて次を表示する。
   - 1件以上: `公開リプレイ（反映後に自動表示）` とgameごとのURL
   - 0件: `この対局セットは公開アリーナ対象外`。GitHub source recordは残る
   `SubmitOutcome.submitted`にhandoff rowsを持たせ、standalone/auto-submitで同じ結果にする。
4. `rawRunUrl`の「viewer未公開」commentを削除し、source audit URLとしての役割へ直す。
5. 対局 runner/wizardは変更しない。arena完了をawaitした後にrunを一度submitする現行順序をtestで
   固定し、game-000後のpartial submission pathを追加しない。

## Producer tests and release

- fixtureをvalid final agent specsへ更新し、eligible 2-game canonical pairがsubmission prefixを含む
  2つのstrict ref URLをstable game orderで返す。
- direct/PR laneでhandoff rowsが同じ、push/PR failure・verify/auth block・already-submittedでは
  URLを成功表示しない。
- `wizard.test.ts`でcanonical presetが`games=2`をrunnerへ渡すことを確認し、deferred
  `runArena`がpendingの間は`submitRun=0`、resolve後はcompleted run dirでexactly once、arenaが
  rejectした場合は`submitRun=0`のままerror伝播することを固定する。`submit.test.ts`だけで
  orchestrationを証明したことにしない。
- baseline-only、same-headline different harnessは0 links。LLM-v-CPUはlinksあり。
- encoded URLをdecodeするとexact raw_ref、digest/pending/arbitrary source parameterが無い。
- build/typecheck/all tests/audit、package inventory/secret/host-state scan、clean tgz installを通す。
- product production support確認後にversion `0.2.2`をreviewed clean pushed commitから2回packし、
  bytes/integrity/shasum/inventoryを一致させる。npm publishは一度だけ、registry `gitHead`/digestを照合し、
  fresh `npx laplacebench@latest` packaged outputを確認する。

## Cross-repository integration and release order

1. sibling product planを実装、web typecheck/focused tests/real browser pending→ready acceptance。
2. siblingのscoped filesだけをcommit/pushし、CIとproduction `laplace.zone`で`?ref` stateを確認。
3. 本producerを実装・reviewし、commit/push/CI。
4. CLI `0.2.2`をpublishし、`latest`とartifact equalityを確認。
5. public CLIのlink shapeをproduction pageで開き、known published raw_refはcanonical `?id`へ遷移、
   absent strict refはpending→timeout/manual retry、ordinary bogus idは即errorを確認。

## Failure policy

product productionが未対応ならCLIをpublishしない。CLI publish前のfailureは修正してgatesを再実行。
publish応答後は`0.2.2`を再試行せずregistryをreconcileし、必要なら新versionで回復する。refが
publisher catalogに現れない場合、productはreadyと主張せず、GitHub progress/source導線をCLIに残す。

## Completion criteria

- 2局セットは両局終了後に一度提出され、eligibleなら2つのBench handoff URLが出る
- URLはdigestを予測せずstrict raw_refだけを持つ
- productはbounded polling中に正直な待機UIを出し、catalog ready後にcanonical digest URLで再生する
- trust boundary、ordinary id failure、ineligible publication semantics、opt-in submissionが不変
- product-first deploy後にpublic npm `latest=0.2.2`がreviewed artifactと一致する
