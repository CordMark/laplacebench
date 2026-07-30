---
status: implemented
direction: direction-clean-room-execution
owner: bench
risk_tier: standard
last_updated: 2026-07-30
---

# サブスクCLI対局の clean-room 実行・canary検査・isolation manifest

## Direction Brief

1. **Purpose** — サブスクCLI対局(claude-cli / codex-cli系spec)で、ユーザー個人の
   instructions・settings・skills・plugins・hooks・MCP・環境変数が対局条件へ混入する
   経路を、サブスク認証を保ったまま遮断する。隔離が成立した証拠(canary)と実行条件
   (isolation manifest)を run.json に残し、docs/harness-lab-direction-ja.md §11 の
   「provider公式harnessはversion付き許可、個人設定は禁止、fail-closed」を実行系で
   成立させる。将来のofficial verifiedレーンの実行前提を作る(レーン自体は作らない)。

2. **Concept owner** — 新規 `packages/cli/src/cleanroom.ts` が clean-room 契約の
   canonical owner: 隔離ホーム構成(認証ファイルのみ)、隔離OS HOME、子プロセスenvの
   allowlist、provider別抑止フラグ/feature無効化、実行cwd、静的検査、canary matrix、
   isolation manifest(`laplace-isolation-v1`)。`agents/cli.ts` の両agentと
   `agents/learning.ts` は受け取った isolation コンテキストを適用するだけで、条件の
   定義を持たない。隔離ホームのlifecycleは arena()(run scope)が単独所有する。

3. **Lifecycle and scope** — `laplacebench play` / (deprecated) `arena` で
   claude-cli / claude-cli-learn / codex-cli の agent が居る対局は clean-room が既定。
   preflight(CLI version解決→静的検査→canary matrix)は run directory 作成前に走り、
   不通過なら run.json を書かず対局を開始しない。`--ambient-cli-env` は明示opt-inで
   従来のambient環境コピー実行を選び、manifestへ `mode: "ambient"` と記録される
   別条件。anthropic API agent、baseline、product-cpu、公開レーン、community schema、
   UIは変更しない。既存の記録済みrunは不変。

4. **Value hierarchy** — 出す数字がデータより強い主張をしない(記録と実条件の一致、
   検査済み事実と記述的主張の区別) > fail-closed(判定不能は対局を開始しない) >
   サブスク認証の維持(BYOサブスクの摩擦ゼロ原則) > 初回体験の滑らかさ(落ち方の
   設計で担保) > canaryのトークンコスト(対局1局100+コールに対し数コールは封筒誤差)。

5. **Adopted direction** — 実測済み(2026-07-30、本環境)の機構で構成する:
   - **隔離ホーム**: Claude `CLAUDE_CONFIG_DIR=<iso>` + `~/.claude/.credentials.json`
     へのsymlink + 最小`.claude.json`(hasCompletedOnboardingのみ)。Codex
     `CODEX_HOME=<iso>` + `~/.codex/auth.json` symlink。実ホームの他ファイルは
     読まない・持ち込まない。**子プロセスHOMEも隔離OS HOME(空dir)へ差し替える**
     (両CLIで認証維持を実測済み)。
   - **env allowlist**: PATH, SHELL, TERM, LANG, LC_ALL, LC_CTYPE, TMPDIR, USER,
     LOGNAME のみ継承。HOME/CLAUDE_CONFIG_DIR/CODEX_HOMEはwrapperが設定。
     ANTHROPIC_*/OPENAI_*/CLAUDE_*/CODEX_*/NODE_OPTIONS を含む他は全て遮断
     (サブスク条件なのでANTHROPIC_API_KEYも遮断)。
   - **抑止フラグ**: Claude=`--safe-mode --setting-sources "" --strict-mcp-config`
     + 既存`--disallowedTools`。Codex=`--ignore-user-config --ignore-rules
     -s read-only --disable shell_tool --disable hooks --disable plugins
     --disable browser_use --disable computer_use --disable in_app_browser
     --disable image_generation --disable multi_agent`。`--disable shell_tool`で
     shell実行が実際に不能になることは実測済み(NOSHELL canary)。
   - **実行cwd**: agent毎の空scratch cwdをisolationコンテキストが持ち、対局コール・
     learning分析コール・canary両legの全invocationが同じcwd契約を使う。
   - **preflight**(fail-closed、run dir作成前): (1) CLI versionを解決し、nullなら
     fail。(2) 静的検査: admin/管理policyパス(注入可能なリスト;
     `/Library/Application Support/ClaudeCode/managed-settings.json`,
     `/etc/claude-code/managed-settings.json` 等)の存在→fail、隔離ホーム内容が
     期待ファイル集合と完全一致、scratch cwd空。(3) canary matrix(下記)。
   - **canary matrix**(surface毎にstatusをmanifestへ記録):
     | surface | 方式 | status値 |
     |---|---|---|
     | instructions(CLAUDE.md/AGENTS.md) | LLM canary: canaryホームで陽性対照が注入され、clean-room構成+敵対的base env(CLAUDE_CONFIG_DIR/CODEX_HOME/CLAUDE_EFFORT等をcanaryホームへ向ける)で陰性 | canary-verified |
     | config読み取り元(settings.json/config.toml) | 決定論canary: canaryホームのconfigに実在しないmodelを設定→フラグ無しでは失敗(陽性=configが読まれる)、clean-room構成では成功(陰性) | canary-verified |
     | shell/tool(codex) | 決定論canary: shell実行要求が`--disable shell_tool`下でcommand実行イベント無しに拒答(陰性)、無効化なし陽性対照でcommandイベント発生 | canary-verified |
     | skills/plugins/hooks/agents/commands等のhome artifact | 隔離ホームの内容列挙(artifact不在)+抑止フラグ | artifact-absent + flag-suppressed |
     | MCP | Claude: `--strict-mcp-config`+`--mcp-config`なし。Codex: config.toml不在+`--ignore-user-config` | flag-suppressed + artifact-absent |
     | env override(model/effort/base URL/fallback) | allowlist(unit test)+上記敵対的env陰性canary | canary-verified |
     | network/web search | Claude: tools禁止。Codex: web search featureを有効化しない+feature状態を記録 | flag-suppressed |
     | admin/管理policy | 静的パス検査(存在→fail) | checked-absent |
     陽性対照が反応しない場合は「canary死」としてfail。LLM canaryはwrapper/CLI表面の
     検査なのでmatchモデルではなく固定の安価な設定(claude: claude-haiku-4-5、codex:
     プラン既定モデル、effort low)で行い、使用モデルをmanifestへ記録する。
   - **isolation manifest**(`laplace-isolation-v1`、run.jsonの`isolation`):
     `{schema, mode: "clean-room"|"ambient", revision: "clean-room-v1",
     providers: {<claude|codex>: {cli_version(非null必須), mechanism(home/HOME/cwd),
     flags, allowed_env_keys, surfaces: {<surface>: status}, canary: {model, effort,
     outcomes}, managed_policy_paths_checked, opaque_condition_note}}}`。
     provider公式system promptは中身が非公開のため「CLI名+CLI version」を条件単位と
     し、同一versionのまま挙動が変わり得る点を `opaque_condition_note` に明記する。
     検査済み事実(canary-verified/checked-absent)と記述的主張(flag-suppressed)は
     status値で区別する。
   - **ambient opt-in**: `--ambient-cli-env` 時は従来の`buildChildEnv`挙動。
     manifestは `mode: "ambient"` のみ(cleanの主張をしないためcanaryは走らない)。

6. **What disappears / is not protected** — ambient環境コピーは**既定としては
   消える**(明示opt-in条件としてのみ存続)。`buildChildEnv`のCLAUDE_EFFORT単独削除は
   ambientモード専用へ降格。子プロセスから見た実HOMEは消える(隔離OS HOME)。
   Codexのshell/browser/computer/画像生成/マルチエージェント面はclean-roomでは
   feature無効化で消える(provider公式harnessの能力差はmanifestが開示)。
   「clean-room = official verified」という主張はしない(model identityの
   コミュニティ検証不能性は不変)。プロキシ環境下のclean-room動作は保証しない。
   keychainのみで.credentials.jsonが無い環境の自動対応、Windows、canary結果の
   (CLI version × wrapper revision)キャッシュ、独立clean-room-checkコマンドは
   今回作らない。codexの未知の管理config面が存在した場合の検出は既知パスリストの
   範囲に限る(リスト外はopaque conditionとしてCLI versionが背負う)。

## Tier: standard

新しい通常挙動(既定の実行条件の反転)、run.jsonへのadditiveなmanifest追加、
preflight契約を導入するためstandard。認可 enforcement・金銭計算・legacy data
semantics・不可逆migration・外部契約の変更はない。既存runの再解釈もしない。

## Source-of-truth and removal inventory

Search terms: `buildChildEnv`, `CLAUDE_EFFORT`, `scratchDir`, `cli_versions`,
`DISALLOWED_CLAUDE_TOOLS`, `--ignore-user-config`, `safe-mode`, `CLAUDE_CONFIG_DIR`,
`CODEX_HOME`, `isolation`, `ambient`, `clean-room`, `preflight`, `MatchPreflightError`,
`commandVersion`。

| Occurrence | Classification | Target |
|---|---|---|
| `agents/cli.ts buildChildEnv` | legacy残置(ambientモード専用へ降格) | clean-roomでは`cleanroom.ts`のallowlist envがcanonical |
| `agents/cli.ts` claude/codex agentのargs/env/cwd組み立て | canonical(適用側) | isolationコンテキスト適用。純関数のinvocation builderへ抽出しテスト可能に |
| `agents/cli.ts scratchDir` | canonical(cwd) | isolation指定時はコンテキストのcwdを使用 |
| `agents/learning.ts runClaude` | derived copy | 同じisolation env/フラグ/cwdを適用(分析コールも同条件) |
| `cli.ts arena()` run.json書き出し・`commandVersion` | canonical(記録側) | preflight後にのみrun dir作成、`isolation`ブロック追加、version非null強制 |
| `cli.ts makeAgent()` | canonical(組み立て側) | ctx経由でisolationを配る |
| `wizard.ts` flag passthrough | derived | `--ambient-cli-env`(boolean)を通す |
| `docs/harness-lab-direction-ja.md §11`末尾の現状記述 | stale文言(実装後) | 実装済みの現状へ更新 |
| `README.md` trust lanes / vendor CLI節 | derived doc | clean-room既定と--ambient-cli-envを反映 |
| 過去runのrun.json(isolationなし) | snapshot/history | 不変。欠落=ambient期の記録として文書側で解釈 |

## Concept model and invariants

- **Isolation modeはrun全体の条件**: 1runの中でsideごとにclean/ambientを混ぜない。
  CLI LLM agentが居ないrunでは `isolation: null`。
- **fail-closed**: preflightのどの検査も、失敗・判定不能は
  `MatchPreflightError`で終了。silent fallbackや自動ambient降格は存在しない。
  CLI versionがnullでも開始しない。
- **lifecycle所有**: 隔離ホーム・隔離OS HOMEは arena()(run scope)が作成し、全対局
  終了後(失敗パス含むfinally)にのみ削除する。agentは自分のscratch cwdだけを所有・
  削除する。並列対局・同一provider両側でも安全。
- **cwd契約**: 全invocation(対局・learning分析・canary)がisolationコンテキストの
  空scratch cwdから実行される。agentのstartGameで空性を再検証する。
- **認証だけを持ち込む**: 隔離ホームに置いてよいのは認証symlinkと最小
  `.claude.json`のみ。静的検査が実内容を列挙照合する。
- **agent identityは不変**: spec文字列・headlineKey・publicgames分類は変更しない。
  clean-roomはrun条件であってharness identityではない。
- **canaryは両方向**: 陽性対照(汚染が検出される)と陰性(clean-room構成で検出されない)
  の両方が通って初めて合格。陽性無反応はcanary死としてfail。
- **検査と記述の区別**: manifestのsurface statusは canary-verified / checked-absent
  (実測)と artifact-absent / flag-suppressed(構成上の保証)を区別して記録する。

## Implementation

1. **`packages/cli/src/cleanroom.ts`(新規)** — `CLEAN_ROOM_REVISION`、
   `buildCleanChildEnv(base)`(allowlist)、`prepareCleanRoom(providers, deps)`
   (隔離ホーム+OS HOME+cwd群を作成し`CleanRoomContext`を返す; 認証source欠如は
   `--ambient-cli-env`案内付きエラー)、`claudeCleanFlags()`/`codexCleanFlags()`、
   `staticChecks(ctx, deps)`(policyパスリスト注入可)、`runCanaryMatrix(ctx, deps)`
   (CLI呼び出しはdeps注入; 実行はpreflightのみ)、`isolationManifest(ctx, results)`。
   `CliIsolation = {env, extraArgs, homeDir, cwd}` をagent向けに切り出す。
2. **`agents/cli.ts`** — invocation組み立てを純関数
   (`claudeInvocation(opts, isolation?)` / `codexInvocation(...)` → {argv, env, cwd})
   へ抽出し、agent本体はそれを実行するだけにする。isolation指定時はコンテキストの
   cwd/env/フラグを使用、未指定時は現行`buildChildEnv()`+内部scratchDir(ambient)。
   **scratch cwdの削除はendGameから`dispose`へ移す**(両CLI agent共通)。runnerと
   runGameSetはdisposeを全exit pathで呼ぶ既存契約があり、learning wrapperの
   endGame内分析はdisposeより前に走るため、分析中もcwdが生存する。dispose/endGameは
   隔離ホームには触れない。
3. **`agents/learning.ts`** — isolationを受け取り、play側にも分析側`runClaude`にも
   同じenv/フラグ/cwdを適用。invocation builderを共用。
4. **`cli.ts`** — `arena()`: specsからCLI LLM providerを判定し
   `--ambient-cli-env`を解釈。clean-room時は (a) `commandVersion`非null確認、
   (b) `prepareCleanRoom`、(c) `staticChecks`、(d) `runCanaryMatrix` を run dir
   作成**前**に実行。合格後にrun.jsonへ`isolation`ブロックを書いて対局開始。
   失敗は`MatchPreflightError`(隔離リソースはfinallyで削除)。makeAgent ctxに
   isolationを追加。usage helpに`--ambient-cli-env`を追記。
5. **`wizard.ts`** — passthroughに `ambient-cli-env`(boolean)を追加。
6. **docs** — README(trust lanes・vendor CLI節)、harness-lab-direction §11末尾の
   現状記述、本plan `status`更新。

## Tests and verification

- `packages/cli/test/cleanroom.test.ts`(新規):
  - env allowlist: 敵対的env(CLAUDE_EFFORT, ANTHROPIC_API_KEY, OPENAI_BASE_URL,
    CODEX_HOME, NODE_OPTIONS等)が全て落ち、allowlist+wrapper設定分だけが残る。
  - 隔離ホーム/OS HOME/cwd構成: symlink先・最小.claude.json・余分ファイル無し・
    認証source欠如の案内付きエラー。
  - staticChecks: 偽managed-policyパスでfail、隔離ホーム異物でfail、非空cwdでfail。
  - canary matrix(fake CLI deps): 陽性無反応→fail(canary死)、陰性で検出→fail、
    両方向正常→pass。組み立てたargv/env/cwdがフラグ・cwd契約と一致。
  - invocation builder: claude/codex両方でclean-room時のargv(抑止フラグ+feature
    無効化)、env、cwdの正確な形。learning分析invocationにも同契約が乗ること。
  - learning lifecycle順序: endGame(分析)実行中にcwdが存在し、dispose後にのみ
    削除されること。分析失敗パスでもdisposeで確実に削除されること。
  - isolationManifest: schema形、非null version、surface status語彙、
    ambient時の内容。
- `packages/cli/test/cleanroom-orchestration.test.ts`(新規、deps注入で実CLI不要):
  - clean-roomが既定で選ばれ、`--ambient-cli-env`のみがambientへ倒すこと
    (silent fallback不在: preflight失敗時にrun dirが作られないこと)。
  - CLI version null → 開始拒否。
  - run.jsonの`isolation`ブロックがpreflight結果と一致すること。
  - 並列複数game+同一provider両側で、game終了が隔離ホームを消さず、run終了後に
    削除されること(失敗パス含む)。
  - wizard: `--ambient-cli-env` passthrough。
- 既存テストの回帰: `npm test`(workspace全体)。
- 実機verification(コミット前、report記載):
  (a) clean-roomでのclaude側smoke: `play --team-a claude-cli:claude-haiku-4-5@low
  --team-b random --games 1 --max-plies 4` — preflight合格・isolationブロック・
  対局成立。(b) codex側は**bounded実対局**: `play --team-a codex-cli:@low
  --team-b random --games 1 --max-plies 4` — match経路(probe経路だけでなく)が
  検証済み構成で動く証拠。(c) 実CLIでのcanary matrix一式の通過。
- 実LLM canary/実対局はCIに入れない(quota消費)。CIはfake depsのみ。

## Failure and rollback

- preflight失敗は対局開始前で、run dirは作られない(隔離リソースはfinally削除)。
- 追加フィールドはadditive。過去run・verify・submit・public-arenaの既存経路は
  isolationブロックを読まないため互換(matchups/publicarenaの回帰テストで確認)。
- providerがCLI仕様(フラグ/feature名/認証格納)を変えた場合、preflightが
  version解決・canary・認証エラーで止まり、ユーザーには`--ambient-cli-env`の
  明示選択肢が残る。feature名変更はcodex invocationの失敗として顕在化する
  (unknown featureの挙動は実装時に確認し、silent no-opならfeature状態の実測記録で
  補強する)。

## Completion criteria

- clean-roomが既定で、canary matrixとstatic checksがfail-closedに機能する。
- run.jsonに`laplace-isolation-v1` manifestが記録され、ambient opt-inも別条件として
  記録される。
- unit + orchestration tests green、実機smoke(claude対局・codex対局・canary一式)の
  証跡。
- README / harness-lab-direction §11の現状記述が実装後の状態と一致。
- codex-impl-review APPROVED。
