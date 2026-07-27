---
status: implemented
direction: direction-npm-cli-release
owner: bench
risk_tier: heavy
last_updated: 2026-07-27
---

# `laplacebench` 0.2.0 npm release

## Direction Brief

1. **Purpose** — README の最初のコマンド `npx laplacebench play` を、clone していない
   利用者が npm の `latest` から本当に実行できる状態にする。現在の npm
   `laplacebench@0.1.1` は 2026-07-21 の成果物で `play` を持たず、2026-07-27 の
   README と公開物が一致していない。

2. **Concept owner** — 公開 CLI のソース正本は clean な Git commit、配布正本は npm
   registry の `laplacebench@latest`。`packages/cli/package.json` と root
   `package-lock.json` がその release version を所有し、npm の `gitHead` で公開物を
   source commit に結ぶ。凍結ルールセットは引き続き `laplace-engine@1.0.0` が所有する。

3. **Lifecycle and scope** — `packages/cli` の version metadata、正確な tarball、GitHub
   `main` 上の release commit、npm publication、公開後の clean-directory smoke までを
   1 release とする。npm auth は最後の不可逆境界で人間が成立させる。製品 Web、公開
   arena 台帳、ゲームルール、engine runtime は変更しない。

4. **Value hierarchy** — 公開物と source identity の正直さ > README の first-user flow
   を早く直すこと > release 操作の少なさ。認証待ちで version commit だけが先に main
   へ載る一時状態は明示的で回復可能だが、dirty tree から公開して誤った `gitHead` を
   残すことは許容しない。

5. **Adopted direction** — CLI は新機能量に合う minor release `0.2.0` とし、engine は
   immutable ruleset `1.0.0` のまま再公開しない。full validation と exact tarball
   install/smoke を通した version metadata を commit/push し、その commit から
   `packages/cli` を public npm へ公開する。公開後は registry version・`gitHead`・
   tarball と `npx laplacebench@latest play` のモデル選択 prompt を外部経路で確認し、
   実際のモデル選択と対局はユーザー本人へ渡す。今回、新しい tag 規約や自動 release
   pipeline は導入しない。

6. **What disappears / is not protected** — `0.1.1` が `latest` であり続ける状態、README
   が npm 公開物より先行していてもテスト可能だという前提、dirty-tree publish を許す
   手軽さを捨てる。engine の docs/conformance tooling の npm 再公開、一般化した release
   automation、過去 version の上書き・unpublish は本スライスで守らない。

## Tier: heavy

npm publish は version を上書きできない不可逆な外部契約変更であり、誤配布時の影響は
clone 前の全利用者へ及ぶ。したがって、方向づけ対話 → plan review → 実装 → impl
interrogation → impl review → commit/push → npm auth → publish → 外部 smoke の順で進める。

## 現状証拠

| 対象 | 観測値 |
|---|---|
| npm `latest` | `laplacebench@0.1.1`, published 2026-07-21 |
| npm `gitHead` | `f9ea61dafac9e1d26247bcfc076c61451b1f73c1` |
| current clean `main` | `b8e48e105f986aa16f3446404f3d9ddcf92c76a4`, upstream と origin に一致 |
| source distance | npm `gitHead` から current `main` まで 42 commits |
| isolated npm smoke | `npx --yes laplacebench@latest --help` に `play` が無い |
| local CLI manifest | `0.1.0`（registry の `0.1.1` より古く、前回 dirty publish の痕跡） |
| npm auth | `npm whoami` が E401。公開直前に人間の認証が必要 |
| engine | npm `laplace-engine@1.0.0`; runtime `src` は公開 commit 以降無変更 |

## Source-of-truth inventory

| Path / external surface | Classification | Release responsibility |
|---|---|---|
| `packages/cli/package.json` | canonical | `version: 0.2.0`, package files/bin/dependency contract |
| `package-lock.json` | derived lock | CLI workspace versionを `0.2.0` と一致させる |
| `packages/cli/bin/laplacebench.js` | canonical entrypoint | packed tarball が built CLI を起動することを smoke |
| `packages/cli/dist/**` | generated package payload | clean build の JS と source map。map は `sourcesContent` と absolute/host path を含まないことを検証 |
| `packages/cli/bridge/**` | intentional package payload | product CPU adapter が起動する versioned bridge。全 packed file を列挙・内容監査 |
| `packages/cli/rulebook/**` | intentional package payload | 対局でモデルへ渡す frozen rulebook。全 packed file を列挙・内容監査 |
| `packages/cli/skills/**` | intentional package payload | parked learning adapter が明示 spec で読む同梱 skill。全 packed file を列挙・内容監査 |
| `packages/cli/FINDINGS.md` | intentional package payload | package README から参照する findings log。packed 内容を監査 |
| packed `package.json` | generated package payload | name/version/bin/files/dependencies が source manifest と一致 |
| packed `LICENSE` | npm auto-included legal payload | root MIT license と一致することを検証 |
| `README.md` Quickstart | canonical user instruction | `npx laplacebench play` と公開 tarball の一致を確認。文言変更は原則不要 |
| `packages/cli/README.md` | packaged user instruction | packed README と CLI help の一致を確認。文言変更は原則不要 |
| `packages/engine/package.json` | frozen ruleset owner | version/runtime 無変更、非公開 |
| npm `laplacebench@latest` | external distribution owner | publish 後 `0.2.0` と expected `gitHead` を確認 |
| GitHub `main` | source identity owner | release metadata commit を npm publish より先に push |
| Git tags / release workflow | absent | 新設しない |

## Implementation

1. `npm version 0.2.0 --workspace packages/cli --no-git-tag-version` 相当で、CLI manifest と
   root lock の workspace metadata だけを整合させる。registry に存在する `0.1.1` を
   ローカルへ逆輸入する中間 commit は作らない。
2. diff を確認し、version metadata 以外の意図しない dependency/lock 変更があれば
   取り除く。version を runtime 定数へ重複登録しない。
3. full validation と packaging evidence を取得する。packing/install/smoke で実害が
   見つかった場合だけ、同じ plan scope 内で最小修正と focused regression を追加する。
   問題が無ければ release のためだけの新しい test framework や script は追加しない。

## Pre-publication verification

1. `npm run build`
2. `npm run typecheck`
3. `npm test`
4. `package.json#files` の全 root（`bin`, `bridge`, `dist`, `rulebook`, `skills`,
   `README.md`, `FINDINGS.md`）と npm が必ず加える `package.json`, `LICENSE` を expected
   publication inventory とする。`npm pack --workspace packages/cli --json` の**全 file list**を保存し、
   各 entry がこの inventory の意図した regular file であることを説明できなければ失敗
   とする。最低限 `bin/laplacebench.js`, `dist/cli.js`, rulebook, package README が入り、
   run logs、credentials、`.agents/state`、repository-only docs が入らないことも確認する。
   `sourceMap: true` で生成される map は current published `0.1.1` にも含まれる意図した
   debugging payload として許可するが、全 map で `sourcesContent` が無く、source path が
   relative で host path を含まないことを fail-closed で検証する。
5. tarball を展開して packed `package.json` と、`bridge` / `skills` / `FINDINGS.md` を含む
   **全 text payload**を secret scanner と targeted pattern search（npm/GitHub token、`.env`,
   home path、run/state/log identifiers）へ通す。binary/unreadable entry は個別に分類し、
   filename blacklist だけで安全とみなさない。
6. clean temp directory へ tarball を install し、package-local dependency resolution で:
   - `npx laplacebench --help` が `play`, `submit`, `verify` を持つ
   - `npx laplacebench play --team-a random --team-b greedy --games 1 --seed 7`
     が非対話・無提出で完了し、run path と未提出状態を出す
   - 生成 run を `npx laplacebench verify <runDir>` が検証する
7. tarball package metadata の version が `0.2.0` であることを確認する。

## Heavy implementation checkpoint

公開前に `/interrogation` へ次を渡す:

- approved plan と actual diff
- full validation 結果
- tarball file inventory と clean install smoke
- npm `0.2.0` が未公開であること
- engine 非公開・runtime 無変更の証拠
- dirty tree / source identity / rollback の弁明

checkpoint と `/codex-impl-review` の両方が APPROVED になるまで commit/push/publish しない。

## Commit and source publication boundary

1. approved metadata diff と plan/adjudication records を、規定本文付き commit で `main` に
   commit する。
2. `origin/main` と `keisuke70/laplacebench:main` が同じ release commit になったこと、
   working tree が clean なことを確認する。
3. clean pushed commit から final tarball を2回作り、npm 11.17.0 の同一 pack 入力が
   byte-identical（同じ SHA-512 integrity / SHA-1 shasum / file inventory）になることを
   確認する。上記 inventory・content scan・clean install・help・baseline run・verify を
   **この final tarball**へ再実行し、expected integrity/shasum を公開前 evidence として
   保持する。pack 間または smoke 後に source tree が変われば失敗とする。
4. ここまでで npm auth が成立しなければ、release は「version commit 済み・npm publish
   blocked」と明示して止める。dirty tree publish へ切り替えない。

## Irreversible npm publication

1. ユーザーに `npm login` を依頼し、`npm whoami` が期待する owner を返すまで publish
   しない。token や認証出力を repo/log/artifact に保存しない。
2. registry を再読し、`laplacebench@0.2.0` がまだ存在しないことと current `latest` を
   確認する。
3. clean release commit から `npm publish --workspace packages/cli --access public
   --ignore-scripts` を1回だけ実行する。`prepublishOnly` は final pack 前に full validation
   として既に実行済みであり、publish 時に filesystem を変える script は許さない。
   npm の directory publish を使う理由は、npm 11.17.0 が Git checkout から registry
   manifest の `gitHead` を設定するため。tarball publish では packed manifest に
   `gitHead` が無く source identity を失う。publish の in-memory pack は、直前に2回
   byte-identical と証明した同じ clean directory / npm version / no-script 入力で作る。
4. publish 応答が success、failure、timeout、connection loss のどれでも**同じ `0.2.0`
   publish を再試行しない**。不明なら registry を観測し、この work item を external-state
   reconciliation として停止・エスカレーションする。negative/stale な `npm view` を
   「未受理」の証拠にして retry しない。回復に別 publish が必要なら、新しい reviewed
   patch version を使う。
5. registry の `latest`, `version`, `gitHead`, tarball digest/URL を再取得し、expected
   release commit と `0.2.0` に一致し、`dist.integrity` と `dist.shasum` が公開前に記録した
   final tarball と一致することを確認する。これにより publish 内部の deterministic repack
   が、install/smoke 済み tarball と byte-identical だったことを外部 registry で確定する。

## Post-publication first-user acceptance

repository・workspace・既存 npm cache の影響を受けない clean directory で
`npx --yes laplacebench@latest play` を起動し、最初の Team A model-selection prompt と
current model catalog が出るところまで確認して中止する。対局を勝手に選ばない。ここから
先のモデル・effort・対局数・提出選択はユーザー本人が行う。

## Failure and rollback policy

- publish 前の failure: 修正して gates を再実行する。version `0.2.0` commit 済みで auth
  blocked の場合はその状態を正直に残し、publish 待ちとして報告する。
- publish command の応答不明: registry を観測するが `0.2.0` は再試行せず、external-state
  reconciliation として停止する。回復 publish は新しい reviewed version だけを使う。
- publish 後の defect: `0.2.0` を上書き/unpublish しない。必要なら npm deprecate で理由と
  replacement を示し、review 済みの `0.2.1` を出す。
- `latest` の誤設定だけなら、存在する検証済み version への dist-tag 修正を別の明示的な
  不可逆操作として扱い、観測なしで実行しない。

## Completion criteria

- npm `latest` が `laplacebench@0.2.0`
- registry `gitHead` が GitHub `main` の release commit と一致
- public tarball の integrity/shasum が pre-publication で install/smoke した final tarball
  と byte-identical
- clean external `npx laplacebench@latest play` がモデル選択まで到達
- user が自分でモデルを選べる地点で操作を引き渡せる

## Release result

- source commit: `f7cbf3dba81cb6f7ce1d9cf7ae2a1ccff9aea363`（GitHub `main` へ push、
  CI / Publish community arena とも success）
- npm: `laplacebench@0.2.0` published 2026-07-27T09:58:47.861Z、`latest=0.2.0`
- registry `gitHead`: source commit と一致
- registry `dist.integrity`:
  `sha512-l2dSKPpEutDMPNc93DWXgZIZoUEodwZQFt7Z97YVrDGRxZxIbiOv531A7OpETEBa0W2paIdSZE2EHkCh/nBADQ==`
- registry `dist.shasum`: `ff36c3750a9f5b7e53d6f8a70d2c528b6c6c3e3f`
- 上記2 digest は clean source commit から2回 byte-identical に pack し、inventory / secret
  scan / clean install / baseline game / replay verify を通した final tarball と一致
- isolated empty directory + isolated npm cache の
  `npx --yes laplacebench@latest play` が current Team A provider menu まで到達。モデルは
  選ばず中止し、ユーザー本人へ引き渡した
