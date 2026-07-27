---
status: implemented
direction: direction-cli-first-run-ux
owner: bench
risk_tier: heavy
last_updated: 2026-07-27
---

# First-run CLI を矢印選択中心へ作り直して 0.2.1 を公開する

## Direction Brief

1. **Purpose** — clone せず `npx laplacebench play` を試す人が、意味のない実装値や
   日本語 IME の入力形式で止まらず、普通のCLIとして選択・開始できるようにする。実測は
   seed confusion、全角 `１` の3回連続拒否、「全体的にもっとcliよくしたい」「選択肢とかも
   できるんじゃなかったっけ？」「お願い」。

2. **Concept owner** — first-run TTY presentation は `WizardIO` の concrete adapter が所有し、
   provider/model/effort/match/submission decisions は既存 `runWizardFlow` が所有する。headless
   automation は既存 flags、seed provenance は run/game logs が引き続き所有する。

3. **Lifecycle and scope** — `packages/cli` の interactive renderer、seed exposure、free-form
   numeric input、packaged README、tests、exact dependencies、npm patch release `0.2.1`。
   agent catalog、auth gate、match runner、submission behavior、schemas、engine、arena publication
   は変更しない。

4. **Value hierarchy** — 自然なfirst-run interaction > 不要な判断を見せないこと >
   script/replay contract preservation > dependency minimalism。TTY renderer だけの pinned
   dependency は実測でUXを単純化できる場合に限り許容する。

5. **Adopted direction** — 全 choice を `↑/↓ + Enter` に統一し、Ctrl+C と Escape は cursor
   を戻して一度だけ自然に中止する。`WizardIO` と business logic は維持し、CommonJS / Node
   22 で実測済みの `prompts@2.4.2` を exact pin した薄い adapter にする。text input は
   custom model、product pin、custom game count だけ。custom integer では全角 digit を targeted
   normalize する。generated seed は prompt/summary から隠し、explicit `--seed` は summary
   confirmation、flags、logs を維持する。visible wording は判断数を増やさず人間語へ直す。

6. **What disappears / is not protected** — numbered menus、ASCII-number selection、interactive
   seed prompt、unrequested seed summary、0.2.0 の exact prompt text/line layout、seed説明の
   advanced menu、狭い seed-only draft を捨てる。back stack、extra confirmation、spinner、
   screen clear、mouse/multi-select は作らない。

## Tier: heavy

UI実装は通常挙動のstandard相当だが、public npm `latest` を immutable `0.2.1` へ進める
不可逆 release を同じsliceで行うため heavy。direction → plan review → implementation/full
verify/exact pack → impl interrogation → impl review → clean commit/push → final two-pack → single
publish → registry/public acceptance の順を守る。

## Runtime evidence and dependency ruling

- clean temp package + `prompts@2.4.2` + actual Node `v22.23.1` + PTY で検証済み。
- Down arrow は Claude から Codex へ動き、Enter は `{choice:1}` を返した。
- Ctrl+C と Escape はいずれも `onCancel` を呼び、cursor をrestoreし、empty resultで終了した。
- `prompts` は古いが CommonJS-compatible。current Inquirer/Clack は ESM-onlyで、現行 CommonJS
  package 全体のmodule migrationを要求する。renderer boundaryのexact pinを小さい選択とする。
- non-TTY + missing team flags は adapter 到達前に failし、不足 flagを出す既存testがある。

## Source-of-truth inventory

| Surface | Classification | Change |
|---|---|---|
| `packages/cli/src/wizard.ts` | canonical wizard + concrete TTY adapter | prompts adapter、cancel、seed内部化、wording、numeric normalize |
| `packages/cli/test/wizard.test.ts` | regression | adapter mapping/cancel、prompt order、seed visibility、fullwidth count、headless不変 |
| `packages/cli/README.md` | packaged first-run instruction | arrow/Enter/Ctrl+C、seed choice削除、new wording |
| `packages/cli/package.json` | package/runtime dependency/version | `prompts: 2.4.2`, version `0.2.1` |
| `package-lock.json` | derived lock | exact dependency graph / workspace version |
| `@types/prompts` | dev-only typing | exact `2.4.9` |
| `packages/cli/src/cli.ts` | command/headless contract | `--seed` とflag behavior維持、原則変更なし |
| `packages/cli/src/catalog.ts` | provider/model catalog | 内容・順序変更なし |
| `packages/cli/src/types.ts#rng` | deterministic random | 変更なし |
| `packages/cli/src/runner.ts` | match/log provenance | 変更なし |
| `laplace-engine` | frozen referee | 変更・公開なし |
| old seed plan/adjudication | superseded record | `status: abandoned` + human correction、code ownerではない |

## Implementation

### Terminal adapter

1. `prompts` runner を注入可能な adapter factory とし、`WizardIO.select` は labels を
   `{title, value:index}` へ写像、initial 0。未選択/cancel は dedicated cancellation error /
   stateの選択肢を残さず、**`WizardCancelledError` だけ**へ写像する。ownership boundaryは
   `runPlay`: `runWizardFlow` 呼び出しだけをcatchし、この型なら既存の
   「中止しました。対局は開始されていません。」を一度だけ出して return 1。それ以外の
   error は伝播する。`finally` がIO closeを一度だけ所有する。stack traceを出さない。
2. `WizardIO.input` は text prompt と defaultを写像。空 + defaultの既存contractを維持。
3. `print` は console outputのまま。prompt libraryにbusiness logicを持たせない。
4. TTY無しでは adapterを起動しない既存guardを維持する。

### Journey simplification

1. Provider/model/effort、match preset、swap、submissionをarrow select化。
2. wording:
   - `2局・先後交代（推奨）` / `詳細設定`
   - `先後を交代する` / `固定する`
   - `今回は提出しない` / `GitHubで公開提出する（検証後、自動マージ）`
3. seed flag absentなら `deps.randomSeed()` をprompt無しで採用し、interactive summaryには出さない。
   explicit `--seed`なら TTYでもprompt無しで採用しsummaryに出す。headless summaryは現状維持。
4. custom game countは text promptのまま、`０-９` をASCIIへtargeted normalizeしてstrict
   integer/range validation。model ID/path/commit inputは一切normalizeしない。

### Tests

- injected prompt runnerで choice titles/value/index、default text、Ctrl+C/Escape cancellation相当の
  `onCancel` pathを固定。adapter cancelは必ず`WizardCancelledError`になることを固定。
- `runPlay` end-to-endで select cancel と text-input cancel を別々に注入し、各々 message 1回、
  close 1回、return 1、arena/submission 0回、error伝播なし。real Node22 PTYでCtrl+C/Escapeの
  cursor restoreを維持。
- ordinary interactive answersからseed回答を全削除し、generated seedはplan/log argsへ届くが
  prompt/summaryには無いことをassert。
- interactive + explicit `--seed 0` はprompt無し・summary `seed=0`。
- fullwidth custom game count `１２` は12、`1abc` / nonpositiveは再prompt。
- scripted test helperは全`select`/`input`のkind+title transcriptとremaining answersを持ち、
  **各 scripted flow が consumed-all を明示assert**する。seed削除で余ったanswerやprompt shiftを
  greenにしない。ordinary journeyはexact prompt kind/orderもassertする。
- normalization negative boundary: fullwidth custom model ID、product repo path、commit pinは
  byte-for-byte不変。flag `--games １２` はinteractive normalizerへ流さず現行validationで拒否。
- headless complete/missing flags、deprecated arena alias、auth failure、submit default/success/failureの
  既存contractを維持。
- packaged READMEがarrow/Enterを案内し、number-entry/seed choiceを再導入しない。

## Verification and npm release

1. focused tests → build → typecheck → all tests → `npm audit --omit=dev`
2. Node 22 PTY smoke: arrows choose a non-default item、Enter、Ctrl+C、Escape、cursor restore
3. exact `npm pack --json`: full inventory、safe maps、LICENSE、secret/host-state scan
4. clean tgz install:
   - headless explicit seed baseline game + replay verify
   - PTY wizardで arrows と no-seed transitionを確認し、対局開始前cancel
5. heavy `/interrogation` → `/codex-impl-review` APPROVED
6. reviewed files/recordsをclean commit、両GitHub `main`へpush、CI success
7. final pack/publish toolchainを **Node v26.5.0 / npm 11.17.0** に固定し、clean pushed commitの
   同一working directoryから`npm pack --workspace packages/cli --json`を2回実行。file inventory、
   integrity、shasum、size、unpacked size、bytesが一致することを確認しexpected evidenceとして
   保持。片方のexact tgzへinventory/scan/install/headless+PTY acceptanceを再実行する。
8. final smoke後にHEAD、両remote source commit、`git status --porcelain`、Node/npm versionsが
   変わっていないことを再確認。一つでも違えばpublish前に停止し、packからやり直す。
9. npm owner/auth、`0.2.1` absenceを確認する。directory publishが必要なのは npm がGit checkout
   からregistry manifestへ`gitHead`を設定するため（tgz publishはpacked manifestにgitHeadが無い）。
   final packと**同じclean directory / Node/npm / `--ignore-scripts` input**から
   `npm publish --workspace packages/cli --access public --ignore-scripts`を1回だけ実行する。
10. registry `latest=0.2.1` / `gitHead` / integrity / shasumをexpectedと照合し、不可逆publishが
    事前acceptance済みtgzとbyte-identicalだったことを確定する。不一致は成功扱いしない。
11. fresh dir + isolated cacheのpublic `npx laplacebench@latest play` で Baseline A/B と
    `2局・先後交代（推奨）` をarrow選択し、次のvisible decisionがpublicationでseedでないことを
    確認。Escapeで中止し、run無しを確認。

## Failure policy

publish前は修正しgates再実行。publish応答後は結果を問わず`0.2.1`を再試行しない。不明時は
external-state reconciliationで停止し、回復は新しいreviewed version。公開versionは
overwrite/unpublishしない。

## Completion criteria

- public first-run choices are arrow/Enter, cancel is clean
- no numbered menu / fullwidth digit loop
- generated seed is not a user decision or unrequested summary field
- explicit seed/headless/log/replay contracts remain intact
- npm `latest=0.2.1` source/digest matches reviewed clean artifact
