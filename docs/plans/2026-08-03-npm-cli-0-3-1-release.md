---
status: implemented
direction: direction-npm-cli-0-2-7
owner: bench
risk_tier: heavy
last_updated: 2026-08-04
---

# `laplacebench` 0.3.1 npm release

## Direction Brief

1. **Purpose** — npm の `laplacebench@latest` を、公開済み `0.2.6` の source commit
   `b45f9b8` から進んだ current `main` の CLI と一致させる。clone していない
   利用者が、既に repository で提供・検証されている clean-room 実行、無制限を既定とする
   token policy、Harness Lab の各 harness と publication artifact を npm から利用できる状態にする。

2. **Concept owner** — 公開 CLI の source identity は clean な Git commit、配布正本は npm
   registry の `laplacebench@latest`。release version は `packages/cli/package.json` が所有し、
   root `package-lock.json` は workspace metadata を追随する。npm の `gitHead` と tarball digest
   が公開物を source commit に結ぶ。凍結ルールセットは引き続き `laplace-engine@1.0.0` が所有する。

3. **Lifecycle and scope** — 未発行 `0.3.0` の一回だけの publish command は npm の
   write-time web authentication 要求で既知の failure となり、registry reconciliation でも
   version absent を確認した。no-retry policy に従って同versionを再利用せず、recovery version
   metadata を `0.3.1` に更新し、current CLI 全体を full
   validation、exact package inventory、secret/source-map scan、clean tarball install/smoke に
   通す。review 済み release commit を GitHub `main` へ先に push し、同じ clean commit から
   npm publish を一度だけ行い、registry と外部 `npx` を検証して完了する。npm auth は不可逆
   境界の直前にユーザーが成立させる。packaging 検証が実害を発見した場合だけ同じ scope で
   最小修正を行う。

4. **Value hierarchy** — 公開された既定挙動と version signal の正直さ > source/tarball の
   同一性と秘密非混入 > latest を早く更新すること > release 操作の少なさ。認証待ちで
   version commit/push 済み・npm 未公開になる一時状態は回復可能として許容するが、dirty
   tree publish、同じ version の再試行、既定挙動変更を patch として静かに配ることは許容しない。

5. **Adopted direction** — 当初の minor signal `0.3.0` を同じcommandで再試行せず、recovery
   patch `0.3.1` を最初の発行済み `0.3.x` とする。公開 `0.2.6` では LLM 対局に
   250,000 output-token の既定 cap があり subscription CLI は ambient 条件だったが、current
   `main` は cap を明示 flag 時だけにし、clean-room + canary preflight を既定にする。同じ
   command の費用・終了条件・実行環境が変わるため、`^0.2.x` 利用者へ自動配布されない minor
   version が正直な契約であり、`0.3.1` も `^0.2.x` 利用者へ自動配布されない。engine は
   再公開せず、Git tag、release automation、互換 shim
   は追加しない。clean pushed commit から二回 byte-identical に pack し、その入力から一回だけ
   directory publish して `gitHead` を保持する。

6. **What disappears / is not protected** — npm `latest` が古い `0.2.6` のままの状態、既定契約
   変更を patch として扱う案、dirty-tree publish の手軽さを捨てる。`0.2.6` の上書き/unpublish、
   `0.2.x` consumer への自動 upgrade、未発行 `0.3.0` の再利用、engine 再公開、過去
   run/catalog の書換え、Git tag、
   一般化した release automation は本スライスで守らない。

## Tier: heavy

npm publish は発行済み version を上書きできない外部契約の不可逆操作で、`latest` の blast
radius は clone 前の利用者全員に及ぶ。よって direction → plan review → metadata implementation
→ full verification → implementation interrogation → implementation review → commit/push → final clean
pack → user auth → one-shot publish → external acceptance の順で進める。

## Requirement and current evidence

Requirement source: 2026-08-03 のユーザー指示「では最新版までを反映しようか認証はこっちで
やるよ」。

| Target | Observed state |
|---|---|
| npm `latest` | `laplacebench@0.2.6`, modified `2026-07-28T03:15:44.977Z` |
| npm `gitHead` | `b45f9b8708166ffdcfbab0a8dfc603619ae9653c` |
| current clean `main` | `f00e07afc6d7262119ba326b5c53c30e2b6d91f3`, `origin/main` と一致 |
| source distance | npm `gitHead` から current `main` まで 36 commits（最後はreview済み0.3.0 metadata commit） |
| version availability | registry に `laplacebench@0.3.0` / `0.3.1` は存在しない（両方E404） |
| local CLI manifest / lock | どちらも未発行 `0.3.0`。次の実装で `0.3.1` へ進める |
| npm auth | browser login後の `npm whoami` は `ykei`。write時は別のweb authentication challengeが必要 |
| npm authorized owner | registry の `npm owner ls` / `maintainers` は `ykei <k.yamamoto@cordmark.co.jp>` の1件 |
| toolchain | Node `v26.5.0`, npm `11.17.0` |
| engine delta | published CLI source commit から `packages/engine/**` の変更なし |

## Published-to-current contract inventory

Search/evidence: `git diff b45f9b8..HEAD` と commit log を `packages/cli/src/cli.ts`,
`packages/cli/src/{catalog,cleanroom,contexttelemetry,harnesslab,publicarena,runner}.ts`,
`packages/cli/src/agents/**`, `packages/cli/{README.md,FINDINGS.md}`, root `README.md` で確認した。

| Contract / surface | Classification | Release meaning |
|---|---|---|
| `packages/cli/src/cli.ts` resource defaults | canonical behavior | LLM の default 250k cap を廃止し、明示 `--output-token-budget` 時だけ cap。patch では配らない |
| `packages/cli/src/{cli,cleanroom}.ts` subscription CLI isolation | canonical behavior | clean-room + canary が既定。旧 ambient は `--ambient-cli-env` opt-in、turn-scoped harness は ambient 拒否 |
| `packages/cli/src/{catalog,agents/{memo,notes,primer}}.ts` | canonical agent contract | reset/memo/memo-primed/notes/notes-guided harness を追加 |
| `packages/cli/src/{contexttelemetry,harnesslab,publicarena}.ts` | canonical record/publication contract | context telemetry と `harnesslab.json` generation、`--harness-experiments` を追加 |
| `packages/cli/src/runner.ts` / replay builders | canonical run/replay contract | isolation・context・note suppression 等の記録を追加。既存 run を書換えない |
| `README.md`, `packages/cli/README.md`, `packages/cli/FINDINGS.md` | canonical user/package docs | current command、harness、既定条件を説明済み。packed docs と help の整合を再確認 |
| prior `laplacebench@0.2.6` | immutable issued artifact | 上書き・unpublish・内容変更なし |
| attempted `laplacebench@0.3.0` | unissued reserved identifier | EOTP response後のregistry reconciliationでabsent。同versionを再試行しない |
| `laplacebench@0.3.1` | new external contract | 上記 contract change を minor signal として発行し `latest` にする |

## Source-of-truth and package inventory

| Path / external surface | Classification | Release responsibility |
|---|---|---|
| `packages/cli/package.json` | canonical metadata | version `0.3.1` と package/bin/files/dependency contract |
| `package-lock.json#packages["packages/cli"]` | derived metadata | CLI workspace version を `0.3.1` と一致 |
| `packages/cli/bin/laplacebench.js` | canonical entrypoint | packed build を起動 |
| `packages/cli/dist/**` | generated payload | clean build の JS/map。map は `sourcesContent` と absolute/host path を持たない |
| `packages/cli/{bridge,rulebook,skills}/**` | intentional payload | product CPU bridge、frozen rulebook、learning skill。全 entry を分類・監査 |
| `packages/cli/{README.md,FINDINGS.md}` | intentional payload | current help/behavior と矛盾しない packed docs |
| packed `package.json`, `LICENSE` | generated/auto-included payload | source manifest と root MIT license に一致 |
| `packages/engine/package.json` | frozen ruleset owner | `1.0.0` のまま非公開、runtime 無変更 |
| GitHub `origin/main` | source identity owner | release metadata commit を npm より先に push |
| npm `laplacebench@latest` | external distribution owner | publish 後 `0.3.1`、expected `gitHead`/digest と一致 |
| Git tags / release automation | explicit absence | 新設しない |

## Implementation

1. `npm version 0.3.1 --workspace packages/cli --no-git-tag-version` 相当で未発行 `0.3.0` の
   CLI manifest と root lock の workspace version だけを `0.3.1` へ更新する。runtime version
   定数、engine version、dependency
   range は変えない。
2. diff が version metadata だけであることを確認する。packaging/acceptance で実害が見つかった
   ときだけ、requirement に直接必要な最小修正と focused regression を追加し、全 gate を再実行する。
3. `0.3.1` が registry に未発行であることを公開直前にも再確認する。

## Pre-publication verification

1. `npm run build`; `npm run typecheck`; `npm test`。
2. `npm pack --workspace packages/cli --json` の全 file list を取得し、`package.json#files` の全
   root と npm auto-included `package.json`/`LICENSE` から説明できる regular file だけであることを
   fail-closed に確認する。tarball は working tree 外の一時 `--pack-destination` へ出し、pack 自体が
   checkout を汚さないようにする。run logs、community records、credentials、`.agents/state`、
   repository-only docs が無いことを確認する。
3. 全 source map を JSON parse し、`sourcesContent` が無く、全 source path が relative かつ home/
   host path を含まないことを確認する。
4. tarball を展開し、全 text payload を token/key、`.env`、home path、run/state/log identifiers、
   private absolute path の targeted scan に通す。binary/unreadable entry は個別分類する。
5. clean temp directory + isolated npm cache へ exact tarball を install し、次を確認する。
   - installed `node_modules/laplacebench/package.json` が version `0.3.1` を持つ。
   - `npx laplacebench --help` は current contract どおり exit `1` で usage を出し、その usage が
     current commands、新しい no-default-budget と clean-room help を持つ。success exit や version
     表示は要求せず、通常の `--help`/`--version` behavior追加を本releaseへ混ぜない。
   - `npx laplacebench play --team-a random --team-b greedy --games 1 --seed 7` が非対話・無提出で完了。
   - 生成 run を `npx laplacebench verify <runDir>` が検証する。
   - `npx laplacebench play --team-a codex-cli-reset:gpt-5.6-sol@medium --team-b random --ambient-cli-env`
     は provider を起動する前に turn-scoped ambient contract を fail-closed で拒否し、run dir を残さない。
6. packed `package.json` の name/version/bin/files/dependencies が source manifest と一致し、version が
   `0.3.1` であることを確認する。

## Heavy implementation checkpoint and review

`/interrogation` へ approved plan、actual diff、published-to-current contract inventory、full validation、
tarball inventory/scan、clean install smoke、`0.3.1` 未公開、engine 非公開/無変更、dirty tree/source
identity/rollback 弁明を渡す。APPROVED 後、`/codex-impl-review` が version diff と release evidence を
approved brief および immutable-issued-artifact fixed check に照合する。両方の APPROVED 前に
commit/push/publish しない。

## Commit and source-publication boundary

1. approved metadata diff、plan、adjudication record を、規定の「意図」「やったこと」本文付きで
   `main` に commit する。
2. `origin/main` へ push し、remote commit と local release commit が一致すること、working tree が
   clean なこと、required CI が成功したことを確認する。
3. working tree が clean であることを確認後、`packages/cli/scripts/product-cpu-package-lock.mjs`
   の canonical lock を明示的に acquire し、shell `trap` で必ず release する。以後の final packs、
   検証、publish 完了/失敗まで同じ lock を保持し、product CPU sync/pack の並行 mutation を拒否する。
   lock sentinel 自身は untracked になるため、保持中の source check は tracked diff がゼロ、かつ
   untracked entry がその canonical lock の `owner.json` だけであることを fail-closed に確認する。
4. lock 保持中、working tree 外の二つの一時 `--pack-destination` に、同じ npm `11.17.0` と
   `--ignore-scripts` input で final tarball を2回作る。file inventory、SHA-512 integrity、SHA-1
   shasum が byte-identical であることを確認し、pre-publication の inventory/scan/install/usage/
   baseline/fail-closed/verify smoke をこの final tarballへ再実行する。pack間、smoke後、publish直前に
   tracked diff、allowlisted untracked set、payload digestを再確認し、一つでも変われば失敗する。
5. auth 未成立なら lock を release して「release commit pushed・npm publish blocked」で止める。
   dirty tree publish や
   source identity を持たない tarball publish へ切り替えない。

## Irreversible npm publication

1. registry の `npm owner ls laplacebench` と `npm view laplacebench maintainers` を再取得し、
   authorized publisher allowlist が事前観測どおり npm account `ykei` の1件であることを確認する。
   変化があれば公開を止めて人間へエスカレーションする。ユーザーに npm 認証を依頼し、
   `npm whoami` が厳密に `ykei` と一致するまで publish しない。ただし `whoami` はwrite-time
   2FAを代替しない。token、email、auth出力を
   repository/artifact に保存しない。
2. registry を再読し、`laplacebench@0.3.1` が未発行、current `latest` が expected predecessor で
   あることを確認する。
3. canonical product-CPU lock を final pack から継続保持し、tracked tree、allowlisted lock sentinel、
   final payload digest を再確認した同じ clean release commit から
   `npm publish --workspace packages/cli --access public --ignore-scripts` を **stdin/stdoutともlive TTYの
   直接command（pipe、redirect、`tee`なし）** として一度だけ実行する。npm 11.17.0 の
   `otplease` は両streamがTTYのときだけEOTPの `authUrl` / `doneUrl` を `webAuthOpener` で開き、
   ユーザーのbrowser認証完了後に同じcommand内部で取得したOTPを同じtarball publishへ渡す。
   画面を開いた後はcommandをcancel/restartせず、そのinvocation自身の完了を待つ。
   `--ignore-scripts` で npm lifecycle lock は起動しないため、手動 lock の継続保持が必須である。
   directory publish は npm が `gitHead` を設定するため維持する。publish結果とregistry観測後に
   `trap` で lock をreleaseし、完全にcleanなworking treeへ戻ったことを確認する。
4. success/failure/timeout/connection loss の別を問わず同じ `0.3.1` publish を再試行しない。不明時は
   registry を観測して external-state reconciliation として停止する。回復 publish は別の reviewed
   version だけを使う。
5. registry の `latest`, `version`, `gitHead`, tarball URL, integrity, shasum を取得し、release commit
   と pre-publication final tarball に一致することを確認する。

## Post-publication acceptance

repository/workspace/既存 cache の影響がない temp directory + isolated cache で:

1. public install の `node_modules/laplacebench/package.json` と registry metadata が version `0.3.1`
   を示す。`npx --yes laplacebench@latest --help` は既存contractどおり exit `1` で current usageを
   表示することを明示的にassertする。
2. baseline 1 game と `verify` を public tarball から再実行する。
3. `npx --yes laplacebench@latest play` を provider selection prompt まで起動し、モデルを選ばず中止する。
   実モデル、effort、対局数、提出選択はユーザー本人へ残す。

## Failure and rollback policy

- publish前の failureは修正し全 gate を再実行する。version commit/push後にauth blockedならその状態を
  正直に残す。
- publish command応答不明時は同versionを再試行せず、registry観測結果と不確実性を報告する。
- `0.3.0` の既知EOTP failureは発行ではないが、既存planのno-retry ruleに従い永久に再利用しない。
  `0.3.1` のlive-TTY commandもfailure/timeoutなら同versionを再試行しない。
- publish後のdefectは `0.3.1` を上書き/unpublishしない。必要ならdeprecate理由とreplacementを示し、
  別途review済みpatchを発行する。
- `latest` tagだけが誤っている場合も、既存の検証済みversionへのdist-tag変更を別の不可逆操作として扱う。

## Completion criteria

- npm `latest` が `laplacebench@0.3.1`。
- registry `gitHead` が GitHub `main` の clean release commit と一致。
- registry tarball integrity/shasum が final clean tarball と byte-identical。
- public `--help`、baseline run/verify、interactive provider prompt の外部 acceptance が成功。
- engine `1.0.0`、past versions/runs/catalog、Git tags/release automation が変更されていない。

## Release result

- clean source / registry `gitHead`:
  `e36694196eafde5183251f18887f920122ed05ce`（GitHub `main`へpush、CI / Publish
  community arenaともsuccess）
- recovery history: `0.3.0` の一回だけのpiped publish commandはwrite-time EOTPで既知failure。
  registry absentを確認し、同versionは再試行せず未発行のまま。live-TTYの単一commandへ直した
  `0.3.1` がbrowser challenge完了後にsuccess
- npm: `laplacebench@0.3.1` published `2026-08-03T15:09:40.116Z`、`latest=0.3.1`
- final two-pack: 97 regular/classified text files、36 safe source maps、version `0.3.1`、
  byte-identical。secret/private-key/home/state hitなし、bin mode `0755`
- registry / expected integrity:
  `sha512-xUV+5MPDO4kS9p+xCoYPBty1qnZmr5/UK+Sji8kH/Ggo68N5PW807S9bf5odA1vaRhVC8gwlj1HtiB/r5QDxYA==`
- registry / expected shasum: `15378dcd8125f37e507bfeac0aff33a87d59f1b3`
- isolated public install: fresh temp directory + isolated npm cacheで `laplacebench@latest` が
  `0.3.1`。exit-1のcurrent usage、random-vs-greedy 1 game、1/1 replay verify、未提出を確認
- external interactive acceptance: public `laplacebench@latest play` が Team A provider menu
  （Claude / Codex / Anthropic API / LaPlace CPU / Baseline）まで到達。Escで中止し、モデル未選択・
  対局未開始
- canonical product-CPU lockはpublication後にreleaseし、working treeはcleanへ復帰
