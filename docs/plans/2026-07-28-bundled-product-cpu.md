---
status: implemented
direction: direction-bundled-product-cpu
owner: bench
risk_tier: standard
last_updated: 2026-07-28
---

# LaPlace CPU を CLI に同梱して一般利用可能にする

## Direction Brief

1. **Purpose** — `npx laplacebench play` を使う人が、公開メニューの LaPlace CPU Lv1–6を
   選んだあとに別repoのcheckout・Git知識・path・commit SHAを要求されず、そのまま対局
   できるようにする。runには実行したCPU sourceの正確なpolicy/commitを残し、再現性は弱めない。

2. **Concept owner** — npm package内のtrusted policy indexが、Benchで実行できる製品CPU
   policy・command role・source commit・manifest digestのcanonical owner。各vendor directoryは
   indexが認証するmanifestに束縛されたimmutable snapshot、bridgeはindex/manifest/file検証と
   policy選択、TypeScript clientはprocess lifecycleとprotocol validation、agent specはpublic
   identityを所有する。製品repoは更新元であってruntime dependencyではない。

3. **Lifecycle and scope** — `packages/cli` に cpu-v6 play snapshotと既存cpu-v4 regret oracleを
   同梱し、runtime checkout依存を削除、maintainer sync/verification、CLI/bridge/test/docs、clean
   pack acceptanceまでを行う。最終のユーザー裁定により公開可能なcommit作成と未公開version
   `0.2.5`への更新を追加する。npm publish自体はユーザーが別途所有する。

4. **Value hierarchy** — 一般利用時のno-clone/no-Git > exact policy/source provenanceとfail-closed
   integrity >既存spec/replay/regret identity > package size。remote serviceやhand-written TS portより、
   exact Git objectから作るstdlib-only snapshotを選ぶ。

5. **Adopted direction** — product commit `101b739ff41a612c9b2c512d57d0a5ba4d233d47`
   のcpu-v6と`d316b30914cb49942486f744099468fe0561ea02`のfrozen cpu-v4 oracleについて、
   allowlistしたPython module closureをGit objectからbyte-for-byteでvendorし、policy/commit/file
   SHA-256 manifestとvendor外のtrusted indexへ固定する。runtimeはcommand roleに許可されたbundled
   policyだけを選び、unknown/cross-role policy、index/manifest digest、hash/file-set、
   active policy、visible tier、protocol不一致を拒否する。新run metadataはhost pathを含めず、
   bundled distributionとsource product commitを記録する。Python 3.11+不在はrun作成前に短い
   install guidanceで終了する通常状態として扱う。

6. **What disappears / is not protected** — wizardのproduct path/SHA入力、`--product-repo`、
   `--product-commit`、`LAPLACE_PRODUCT_REPO`、`LAPLACE_PRODUCT_COMMIT`、dirty checkout判定、
   `product_repo` host-path metadata、live checkout override/dual runtimeを削除する。自動Python
   install、Python runtime同梱、Nodeだけで動く保証、hosted CPU、auto-clone、TypeScript port、
   Windows固有installer、旧0.2.xのexact help/prompt、npm公開実行は守らない。

## Tier: standard

新しいbundled runtime behaviorとprovenance contractを導入するためstandard。schema migration、
authorization/identity trust、legacy data meaning、金額、cutover、不可逆操作はない。ユーザーが
公開実行はユーザーが所有するため、direction → plan review → implementation → verify/pack acceptance
→ standard impl review → version 0.2.5のpublish-ready commitまでとし、publish/push/tag作成は行わない。

## Source-of-truth and removal inventory

Search terms: `product-cpu`, `productRepo`, `expectedCommit`, `product_repo`, `product_commit`,
`product_dirty`, `product-repo`, `product-commit`, `LAPLACE_PRODUCT`, `pinned product checkout`,
`product checkout`, `commit pin`, `CPU_V4_VISIBLE_TIERS`, `product_cpu_bridge`。

| Occurrence | Classification | Target |
|---|---|---|
| `packages/cli/bridge/product_cpu_bridge.py` | canonical runtime bridge | checkout import/git inspectionをbundled manifest/hash/policy importへ置換 |
| `packages/cli/bridge/trusted_product_cpu_policies.json`（new） | canonical policy/command-role/source-commit/manifest-digest anchor | vendor tree外のpackage-trusted index |
| `packages/cli/bridge/vendor/manifest.json` + policy dirs（new） | authenticated derived manifest + immutable snapshots | exact Git objectsから生成、runtime同梱 |
| `packages/cli/scripts/sync-bundled-product-cpu.mjs`（new） | maintainer-only derivation tool | pinned matrix + allowlistからsnapshot/manifestを決定的生成・`--check` |
| `packages/cli/src/agents/productcpu.ts` | canonical client/process boundary | repo/expectedCommit/dirtyを削除、policy指定・Python resolver・protocol/tier検証を維持 |
| `packages/cli/src/cli.ts` | canonical play/regret wiring + run provenance/help | checkout context/flags/env/host pathを削除、bundled preflight/provenanceへ変更 |
| `packages/cli/src/catalog.ts` | canonical provider auth/menu | repo/commit env requirementとpinned-checkout noteを削除しPython prerequisiteを人間語で表示 |
| `packages/cli/src/wizard.ts` | canonical flag/prompt/auth flow | retired flagsとextraArgs/prompt branchを削除、普通のCPU選択にする |
| `packages/cli/src/regret.ts` | canonical frozen-oracle analysis | repo/commit optionを削除、cpu-v4 bundled policyを使用、comparability commitは維持 |
| `packages/cli/test/{productcpu,productcpu-client,regret,wizard}.test.ts` + fake bridge | regression/derived test fixtures | bundled success、no prompt/flags、unknown/tamper/missing Python、v4/v6 identitiesへ更新 |
| `packages/cli/package.json` `files:[bridge]` | package allowlist/version owner |既存bridge包含でvendorも包含されることをpack testで証明。versionを未公開の0.2.5へ更新 |
| `package-lock.json` | derived workspace version | CLI workspace versionを0.2.5へ同期 |
| `packages/cli/README.md` | packaged current user docs | clone/path/SHA手順を選ぶだけ+Python prerequisite+bundled provenanceへ置換 |
| `README.md` | current project capability index | “adapter design only”をbundled/current CLI realityへ更新 |
| `docs/product-cpu-adapter-v1-spec.md` | current-facing adapter specification with historical revision | checkout/dirty/cpu-v4-only active claimをsupersedeし、bundled index/manifest、cpu-v6 play/cpu-v4 regretへcurrent revision追加。過去revisionは保持 |
| `docs/anchor-ladder-v2.md` | historical experiment/reproduction snapshot | 当時commandは保持し、現在はbundled cpu-v4でflags不要との注記だけ追加 |
| `docs/community-lane-v2-context-ja.md` | historical architecture snapshot | 当時のcommit-pin記述はhistoryとして保持、current runtimeのownerではない |
| `packages/cli/src/{publicgames,publicarena-contract,runner,types,exportweb}.ts` | verified-unchanged identity/provenance consumers | agent spec/`product_commit`をopaque snapshotとして扱うため変更不要をtestで確認 |
| `packages/cli/test/{matchups,publicarena,submit,token-budget}.test.ts` | verified-unchanged identity/serialization regression | colon specとpublished identityがbundling後も不変であることをfull suiteで確認 |
| `docs/{anchor-ladder-v1,design-v0.1,pilot-stage05-smoke,pilot-stage05-v1}.md` | historical experiment/design snapshots | 当時のcheckout/adapter stateを変更しない。current usage ownerではない |
| `docs/plans/**`, `docs/interrogation/**` | immutable decision/history snapshots | 過去記録は変更せず、このplan/adjudicationが新しいcurrent decisionを所有 |
| `packages/engine/scripts/**`, `packages/engine/README.md` | independent rules-engine/product cross-check | CPU runtimeとは別目的なので変更なし |
| `packages/cli/scripts/verify-product-acceptance.mjs` | current consumer acceptance for effort identity | CPU snapshot ownerではなく変更なし |

## Concept model and invariants

- Supported bundled policyはtrusted indexに列挙された`cpu-v4`と`cpu-v6`だけ。`play`はcatalogの
  current `cpu-v6`だけ、`regret`はfrozen `cpu-v4`だけを許可し、cross-role policyとmixed-policy
  playをrun作成前に拒否する。agent specのpolicyを暗黙にlatestへfallbackしない。
- snapshot identityは`policy_version + command_role + product_commit + manifest_sha256 +
  sorted(path, sha256)`。syncはworking treeを
  読まず`git show <full commit>:<path>`だけを読む。生成後に同じ入力でbyte-identicalであることを
  `--check`する。
- v4/v6は別directory/package namespaceで、同一processへ混在importしない。bridge processは
  起動時に一policyだけ選び、manifest/file-set/hash、Python versionを確認してからimportする。
- trusted indexはvendor directory外に置き、各policyのrole/full commit/canonical manifest SHA-256と
  exact sourceが公開するvisible-tier symbol/level-resolver symbolを固定する（frozen cpu-v4は
  `CPU_V4_VISIBLE_TIERS`、cpu-v6は`CPU_VISIBLE_TIERS`、resolverは各々`get_cpu_level`）。bridgeは
  manifestをparseする前後でraw canonical bytesのdigestをindexと比較し、その後manifest commit/
  file set/file hashesとsymbol存在/valueを検証する。npm package integrityがindex自体の配布root。
- bridge helloの`product_commit`はtrusted indexとmanifestが一致したsource commit。
  `product_dirty`は存在せず、new runの
  `product_cpu`は`distribution:"bundled"`, policy, commit, Python, protocol, teamsのみ。local path、
  secret、raw source hash一覧はrunへ出さない。
- `product-cpu:cpu-v6:level_N`、default regret `product-cpu:cpu-v4:level_5`、per-move seed、agent名、
  existing replay/event identityは変えない。
- preflight failure（Pythonなし/古い、tamper、unsupported policy/tier、malformed hello）はrun.jsonと
  gamesを作らず、interactive/headlessともstack traceではなく短いactionable errorで非zero終了。
- runtimeに外部checkout/env/flag fallbackを残さない。古いflagはunknown flagとして対局前に拒否。

## Implementation

### Deterministic vendor pipeline

1. sync scriptにpolicyごとのcommand role、full source commit、source root、allowed relative modules、
   source-version固有のvisible-tier/resolver symbolを固定する。
   `git cat-file -e`でcommit/path、`git show`でbytesを取得し、temporary directoryで全体を生成して
   sorted canonical JSON manifest（schema/policy/commit/files SHA-256）と、そのmanifest bytesのSHA-256を
   持つvendor外trusted indexを作る。
2. outputをatomic replaceし、`--check`は生成期待値とtracked vendor treeのfile set/bytesを比較して
   一切writeしない。unexpected `.py`、missing allowlist、abbreviated/moved commitをfailさせる。
3. cpu-v4は`base.py,cpu_tier_profiles.py,cpu_levels.py,minimax.py,weight_profiles.py,__init__.py`、
   cpu-v6はこれに`tactical_candidates.py`を加える。source checkoutのunrelated dirty fileは読まない。
4. origin/authorizationをmanifestまたは隣接NOTICEに明示し、Laplace source repo URL、exact commit、
   generated-file warningをpackageへ含める。正式license artifactが必要と判明した場合はpublishの
   blockerとしてユーザーへ残すが、runtime cloneへ戻さない。

### Bundled bridge and client

1. bridgeは`--policy`だけを受け、own directoryのtrusted indexとmanifestをload。index role/full commit/
   manifest digest、schema、known policy、expected/surplus `.py` file set、各hashをimport前に検証。
   policy directoryだけを`sys.path`へ加え、`CPU_POLICY_VERSION`とtrusted indexが指定するsymbol
   （cpu-v4の`CPU_V4_VISIBLE_TIERS`、cpu-v6の`CPU_VISIBLE_TIERS`、各`get_cpu_level`）を`getattr`で
   fail-closed解決し、manifest/requestと一致することを確認。vendor sourceは互換化のため編集しない。
2. helloはprotocol/policy/product_commit/python/visible tiersを返す。move/score protocolとstrict profile、
   fresh-agent-per-request、seed、timeouts、stderr fail-closedは維持。
3. clientはrepo/commit optionsを廃止し、policyからbridgeを起動。Python resolverは3.11+の
   `python3`/`python`（Windows launcherを含む実装可能なcandidate）をversion probeして選び、見つから
   なければinstall guidanceを返す。test-only bridge command injectionは維持。
4. CLI playはspec policyがexact `PRODUCT_CPU_POLICY`（cpu-v6）であることを確認してbundled preflightし、
   provenanceを確定後にrun directoryを作る。両teamがproduct CPUなら一度のv6 provenanceを共有する。
   cpu-v4 play、cpu-v6 regret、mixed policyはfallbackせずrun作成前に拒否する。
5. `runPlay`はpreflight/run setup errorを一度だけhuman-readableに表示し、no submit/no runで終了。
   programmer errorを黙殺するbroad fallbackは作らない。

### Removal and documentation

1. catalog authから`LAPLACE_PRODUCT_*`とpinned checkout note、wizard value flags/auth branch/extraArgs、
   CLI context/parser/help、regret optionsのrepo/commitを削除。retired spellingをactive src/README/test
   assertionsから機械的に禁止する（historical docsはallowlist）。
2. README quickstartでLaPlace CPUがpackage同梱であること、Python 3.11+、source commitがrunに自動記録
   されること、不足時のinstall guidanceを説明。checkout/SHA commandは削除。
3. historical anchor reproductionには「当時はpinが必要だった。current bundled commandでは不要」を
   追記し、original evidence command自体は書き換えない。

## Tests and verification

1. `packages/cli/package.json`と`package-lock.json`を0.2.5へ同期してからFocused unit:
   - sync first generation/`--check`/repeat identity、dirty working tree非参照、missing commit/path、unexpected
     file/tamperをreject。
   - bridge real cpu-v4/v6 hello、visible 5/6 tiers、one deterministic v6 move、v4 score roots。file-only
     tamper、valid-schema manifest commit/hash改変、manifest+file同時改変（trusted index不変）はtemp
     packaged copyでhello前fail。unknown policy/hidden tier/malformed protocol/stderr/timeoutもfail。
   - Python resolver: supported candidate選択、old-only、all missing、Windows-style argv。missing/old messageに
     Python 3.11+ guidance、no run artifact。
   - wizard ordinary product CPU journeyにpath/SHA inputが存在せず、retired flags/env noteを出さない。
     old flagsはunknownとしてarena 0回。
   - headless cpu-v6 Lv1 vs baseline one gameでrun provenanceにbundled/policy/full commit/no `product_repo`/
     no dirty、event seed、verify success。bundled cpu-v4 regret outputのcommit/specを固定。
   - cross-role cpu-v4 play、cpu-v6 regret、mixed-policy playはrun directory作成前に拒否。
2. Full gates: `npm run typecheck`, `npm test`, `npm run build`, `npm audit --omit=dev`。
3. Source parity: sync `--check`; exact source checkoutに対するtargeted real bridge parity fixturesをv4/v6で実行。
   product checkoutはread-only、dirty worktreeではなくGit objectsを基準にする。
4. Clean artifact: version 0.2.5で`npm pack --workspace packages/cli --json`を2回、file inventory/bytes一致、
   vendor manifest+all allowlisted files包含、host path/secret/`__pycache__`/`.pyc`/unexpected source不在。
   fresh temp installからpublic binary相当でheadless cpu-v6 one game+verify、v4 regret、TTY product choiceが
   checkout promptなしで次へ進むこと、Python-missing refusal/no runを確認。
5. Standard `/codex-impl-review`へ6項目弁明、scoped diff、plan、tests、pack evidenceを渡しAPPROVEDを得る。
   npm publish、push、Git tag作成は行わない。reviewed changesを意図/やったこと本文付きでcommitする。

## Failure and rollback

- 実装/検証失敗はtracked vendor/runtime変更をrevertすれば旧checkout-required behaviorへ戻る。data/schema
  migrationはない。既存runはspec/commitを自身に保持し変更しない。
- source parity、manifest integrity、clean packのいずれかが不明なら「一般利用可能」と報告せず停止。
- Pythonなしはfallback agentへ切り替えずfail closed。unsupported policyをv6へ読み替えない。
- 後続publish時はユーザーがregistry authとimmutable artifact acceptanceを別途所有する。

## Completion criteria

- interactive/headlessのcpu-v6 playがcheckout/path/SHAなしでclean packageから完走・verifyできる
- bundled cpu-v4 regretがfrozen commit identityで動く
- exact source commits/file hashes/provenanceがmanifest・hello・run outputsで一貫する
- retired runtime checkout contractとhost path leakageがactive surfaceから消える
- Python不足/tamper/unknown policyはrunを作らずactionableに失敗する
- full tests/build/typecheck/audit/source parity/two-pack acceptance/impl reviewがgreen
- package versionは0.2.5、npm registry・remote branch・Git tagは変更しない
