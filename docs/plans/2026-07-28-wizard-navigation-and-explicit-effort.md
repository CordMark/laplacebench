---
status: implemented
direction: direction-wizard-navigation-and-explicit-effort
owner: bench
risk_tier: standard
last_updated: 2026-07-28
---

# CLI wizard を戻れる明示選択フローにする

## Direction Brief

1. **Purpose** — `npx laplacebench play` の対話利用者が、意味の曖昧な effort
   `default` を選ばず比較条件を明示でき、選択ミスに気づいたらwizard全体を中止・再開せず
   前の項目へ戻って安く直せるようにする。終了後の提出判断は、上に提出、下に今回は提出しない
   を置きつつ、提出を暗黙の既定にはしない。

2. **Concept owner** — 公開provider/model/effort選択肢とspec構成は
   `packages/cli/src/catalog.ts`、interactive journey state・依存関係・back semanticsは
   `packages/cli/src/wizard.ts#runWizardFlow`、terminal上の初期cursorとcancel mappingは
   `WizardIO` / `makePromptIO` が正本。既存record/parserは過去のeffort未記録specを読み続ける。

3. **Lifecycle and scope** — interactive play wizard、catalogの公開effort候補、prompt adapter、
   focused transition tests、packaged READMEを変更する。headless flags/free-form spec、
   stored run/schema/public arena identity、match runner、publication implementationは変更しない。最終の
   ユーザー裁定により、未公開version 0.2.5への更新とpublish-ready commitを追加し、npm publishは行わない。

4. **Value hierarchy** — 小さな選択ミスを安く修正できること > 比較条件を明示すること >
   独立した既入力を再入力させないこと > 実装の単純さ。提出はopt-inのまま保ち、安全な既定を
   視覚順より優先する。

5. **Adopted direction** —
   - effort軸を公開するClaude/Codex menuから空文字/default候補を削除し、menu生成specには必ず
     `@low|medium|high|xhigh` 等の明示effortを付ける。過去recordと手入力/headlessのeffort未記録
     specはparse可能なまま残す。
   - interactive wizardを明示step state machineへし、最初の編集可能step以外では末尾に
     `← 前の項目に戻る` を置く。Esc/Ctrl+Cは従来どおりwizard全体のcancelで、backには使わない。
   - 戻る際は依存で不正になる値だけを破棄する。provider変更時はそのteamのmodel/effortだけを
     再解決し、Team A変更でTeam Bやmatch/submissionを消さない。独立値は保持し、再訪時のinitial
     cursor/text defaultに前回値を使う。specは最終stateから再構成しstale specを保持しない。
   - flag指定値はwizard内で編集せず固定stepとしてskipする。backは直前の編集可能stepへ戻る。
   - auth失敗時のchoiceにも設定へ戻る導線を置き、戻れば最後の編集可能stepからさらに遡れる。
   - submission optionsは上=`GitHubで公開提出する（検証後、自動マージ）`、
     下=`今回は提出しない`。初回initialは下、再訪時は前回選択をinitialにする。

6. **What disappears / is not protected** — interactive effort `default`、一方向だけのwizard、
   「戻ると独立した下流値も全消去」という単純実装、旧prompt option順・固定initial indexを捨てる。
   過去のeffort未記録identity、free-form/headless grammar、Esc cancel、submit opt-inは消さない。
   mouse操作、任意stepへのjump、全設定を一画面で編集するUIは作らない。

## Tier defense

新しいinteractive通常挙動とcatalog選択contractを変更するためstandard。schema/migration、
authorization enforcement / identity trust、payment/accounting、legacy data meaning、external
integration contract、cutover、不可逆操作は変更しない。npm publishはscope外、version bumpとcommitはscope内。

## Source inventory

| Surface | Classification | Change |
|---|---|---|
| `packages/cli/src/catalog.ts` | canonical published effort choices/spec builder | Claude/Codexのeffortsから空文字を除去。builder/parser/free-form grammarは維持 |
| `packages/cli/src/wizard.ts` | canonical journey + prompt adapter | state machine、back choice、依存値だけの再解決、initial cursor、auth→settings back、submit順 |
| `packages/cli/test/wizard.test.ts` | primary regression | prompt order/options/initial、back transitions、値保持・依存破棄、flags固定、cancel |
| `packages/cli/test/matchups.test.ts` | catalog round-trip consumer | published catalogが全explicit effortでround-tripする期待へ更新。historical effort-less casesは維持 |
| `packages/cli/README.md` | packaged current-facing help | explicit effort、back、Esc cancel、submit defaultを案内 |
| `packages/cli/package.json` / `package-lock.json` | release identity | 未公開version 0.2.5へ同期 |
| `packages/cli/src/cli.ts` | flag parser/resolver | no behavior change expected; headless effort-less specs remain accepted |
| `packages/cli/src/agents/{cli,learning}.ts` | runtime effort application | no change; explicit `@effort` continues to map to provider CLI args |
| `packages/cli/src/{catalog,publicgames}.ts` identity consumers | stored/public semantics | parser/headline behavior no change; effort-less historical identity remains distinct |
| historical plans/adjudications | history | no rewrite; prior behavior remains a dated record |

## Implementation

1. Extend `WizardIO.select` with optional initial index. `makePromptIO` bounds it and forwards it to
   `prompts.initial`; injected test IO records initial. Default remains 0 for non-wizard callers/tests.
2. Represent editable journey as dynamic step identifiers. Skip flag-owned team/games/swap/submit values and
   calculate previous editable step rather than treating flags as mutable menu state.
3. Store team selection as provider/model/custom-model/effort primitives. When provider changes, retain model or
   effort only if valid for the new provider; otherwise initialize from its first published option. Build spec
   only when the plan is finalized.
4. Append one back sentinel to each select after the first editable step. Custom model and custom game-countの
   text promptは`空のままEnterで前へ戻る`を明示し、emptyを値ではなくback sentinelとして返す。
   previous editable stepが存在する場合だけemptyをbackとして有効にし、invalid integer後もemptyならloopを
   抜けてそこへ戻る。teams/swap等がflags所有でcustom games text自体が最初のeditable stepなら、emptyは
   通常のinvalid入力として扱い、有効値入力かEsc/Ctrl+C cancellationを求める。前回textはdefaultへ再提示するため、
   backしたい場合はclearしてempty Enter、採用したい場合はそのままEnter。Esc/Ctrl+Cは従来どおりwhole-wizard
   cancelであり、empty-backと混同しない。Detailed match settingsはgamesとswapを独立に保持する。
5. Let auth gate return `back` in interactive failure state; the main loop resumes the last editable settings
   step。ただしflagsがteam/match/submissionの全stepを所有してeditable stepが0件なら、設定へ戻るchoice自体を
   出さず、従来の再チェック/中止だけにする。partial flagsでは存在する最後のeditable stepへ戻り、flag-owned
   値は表示も編集もしない。Headless gate remains single-pass and never prompts.
6. Reorder submit labels but map by semantic value, not raw index. Initial semantic value is not-submit; revisits
   use the stored value. `--submit` remains fixed true and headless omission remains false.
7. Update README and remove active `default effort` wording. Do not rewrite dated plans.

## Regression cases

- All published Claude/Codex effort arrays are non-empty strings; every menu-generated spec contains
  `@effort`. Historical/free-form `claude-cli:<model>`, `codex-cli` still parse/resolve as before.
- Ordinary A/B journey has exact prompt sequence, back option placement, explicit effort, submit labels
  [submit, not-submit] with initial=1.
- Back from Team B to Team A preserves independent Team B/match/submission state on later revisit; changing
  provider invalidates only incompatible model/effort; same-provider revisit restores cursor.
- Back across match preset/custom games/swap preserves games and swap; text default is previous value.
- Custom model入力とcustom games入力は有効値を完成させなくてもempty Enterで前へ戻れる。integer invalid後の
  emptyもbackとなり、Esc/Ctrl+Cだけがwhole-wizard cancelになる。ただしpartial flagsによりcustom games textが
  最初のeditable stepならempty-backは表示・発火せず、valid valueかwhole-wizard cancelだけを受ける。
- Back from submit and auth failure resumes settings without losing prior selections.
- Partial flagsのauth failureは最後のeditable stepへ戻れる。complete flagsでeditable stepがないauth failureは
  設定へ戻るchoiceを表示せず、再チェック/中止だけ。headless authは従来どおりsingle-pass/prompt-free。
- Partial/complete flags remain fixed and are skipped by back navigation.
- Esc/Ctrl+C still raises `WizardCancelledError`; run/cost/submission remain zero.
- Submission selection maps top to true, bottom to false; initial bottom does not publish.
- Existing headless, auth retry/cancel, match execution and submission success/failure tests remain green.

## Verification

1. `packages/cli/package.json`と`package-lock.json`を未公開version 0.2.5へ同期する。
2. `npm run typecheck`
3. `npm test --workspace laplacebench` and focused wizard/catalog tests
4. `npm run build`; `npm audit --omit=dev`
5. clean `npm pack --workspace packages/cli --json` twice and compare bytes; install one tgz and inspect a
   real TTY journey transcript/initial positions through back + explicit effort, cancelling before run creation.
6. 0.2.5を含むcomplete diffをStandard `/codex-impl-review`へ渡し、APPROVEDを得る。
7. reviewed changesを意図/やったこと本文付きでcommit。npm publish/push/Git tag作成はしない。

## Failure and rollback

Revert catalog/wizard/test/docs changes to restore the prior one-way/default-effort menu. No stored runs or schema
need migration. If prompt library cannot preserve an initial cursor safely, do not fake retention in text only;
stop and revise the interaction direction. A failed/cancelled wizard must create no run and submit nothing.

## Completion criteria

- menu-generated Claude/Codex specs always carry explicit effort
- every editable selection after the first has a working previous-step path
- independent values survive back navigation; invalid dependent values do not
- submit is visually first, not-submit visually second and initially selected
- flags/headless/historical records/cancel/publication semantics remain intact
- tests/typecheck/build/audit/pack/TTY acceptance/impl review are green
- version is 0.2.5; registry, remote branch, and Git tags are unchanged
