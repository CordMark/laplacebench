---
status: implemented
direction: direction-harness-lab-contract
owner: bench
risk_tier: standard
last_updated: 2026-07-30
---

# Harness Lab 比較契約(集計境界のコード化)と最初の curated ablation

## Direction Brief

1. **Purpose** — (a) ハーネス差を背負った対局が Model Arena のモデル戦績に混入
   しない境界を、文書ではなくコード契約にする。direction 対話で実在の契約欠陥を
   確認済み: 現状の publicPair は headline 折り畳みにしか依存しないため、
   `claude-cli-learn` の cross-model 対局は「Opus 対 Sol」として公開 matchup 適格に
   なってしまう(運用が same-model しか走らせていなかったため未露呈)。
   (b) OpenAI の ARC-AGI-3 報告(reasoning retention + compaction)と同じ H0 軸
   「コンテキストを毎ターン捨てるか持ち越すか」を、この基盤の最初の
   curated controlled ablation として実測する。

2. **Concept owner** — `catalog.ts` の `PUBLIC_MATCHUP_HARNESSES` allowlist が
   「公開 matchup 適格 harness」の canonical owner。`publicgames.ts` が
   その allowlist から公開適格(publicPair)と対局種別(matchupKind)を導出する。
   headline 折り畳みは同一 identity 対局の正当な除外として残るが、境界の正本では
   なくなる。harness ごとの context 契約(harness_conditions)は catalog 側の
   条件表が持ち、arena() は記録するだけ。

3. **Lifecycle and scope** — (i) 新 harness `codex-cli-reset`(毎ターン新規
   `codex exec`・resume なし・rulebook+全状態観測を毎回送る turn-reset 変種)。
   (ii) allowlist 境界と `matchup_kind` / `harness_conditions` の run.json 記録。
   (iii) 事前固定条件での curated 実験1本(GPT-5.6 Sol 同士、persistent vs
   turn-reset)を実行し、verify 通過後に community/runs/keisuke70--… へコピーして
   コミット(ルート runs/ は gitignore)、FINDINGS へ追記。UIタブ・差分カード・
   投稿・matchmaking・rating・claude 側 reset 変種・compaction イベント記録は
   作らない。community 台帳に learn の cross-model 対局が無いことは確認済み
   (遡及是正は不要)。

4. **Value hierarchy** — 出す数字がデータより強い主張をしない(learn/reset の
   cross-model 対局が Model Arena 集計に決して載らないこと、n=4 を示唆に留める
   記述規律) > 比較の解釈可能性(条件の事前固定・seat swap・全ゲーム公開) >
   実験の実時間・サブスク消費 > メニューの網羅性(reset は published メニューに
   載せず free-form spec のままにする)。

5. **Adopted direction** —
   - **allowlist が境界の正本(fail-closed)**: `PUBLIC_MATCHUP_HARNESSES =
     ["claude-cli", "codex-cli", "anthropic", "product-cpu"]`(公開 matchup に
     入り得る harness の positive 分類。product-cpu は既存の公開対局が示す通り
     適格な対戦相手)。publicPair は「**認識済み harness**(LLM か否かに依らず
     `parseAgentSpec().harness !== null`)のうち allowlist 外が片側にでも居る
     対局」を除外する。判定は LLM_HARNESSES を経由しない — 将来
     RECOGNIZED_HARNESSES へ追加された harness は、allowlist へ明示追加される
     まで既定で公開不適格になる(第二の分類リスト編集を要さない)。opaque spec
     (random / takeshi 等、harness=null)は従来通り対戦相手として適格。
   - **matchup_kind の導出**(同じ allowlist から): 両側 allowlist 内(または
     opaque)→ `"model-arena"`。allowlist 外の認識済み harness が居て headline
     一致 → `"same-model-harness-ablation"`。allowlist 外が居て headline 不一致 →
     `"cross-model-system"`。run.json に記録する。
   - **harness_conditions**: 認識済み LLM harness ごとに
     {context_lifetime, reasoning_retention, compaction, mechanism} の条件表を
     catalog 側に置き、両 side 分を run.json へ記録する。
     - `codex-cli` = persistent-thread(`codex exec resume`)。retention /
       compaction は provider-managed で opaque。
     - `codex-cli-reset` = turn-reset(毎ターン fresh exec・全破棄)。
       retention = 毎ターン破棄、compaction = n/a。
     - `claude-cli` = persistent-session(`--resume`)。provider-managed opaque。
     - `claude-cli-learn` = persistent-session + 対局間 learning lifecycle。
     - `anthropic` = **persistent client-managed transcript**: アダプタが
       append-only の会話履歴を保持し、返却された assistant content
       (thinking block 含む)をそのまま再送する。provider 内部の reasoning
       state は opaque。アダプタ側 compaction は未実装(none)、prompt caching は
       compaction ではない。観測できるアダプタ挙動と provider 内部を区別して
       記述する。
     CLI から reasoning retention 単独の切替はできないため、本実験は
     「retention+compaction 込みの persistent 条件 vs 毎ターン全破棄」という
     H0 の複合ポリシー比較として正直に記録する(個別要因に分解しない)。
   - **curated 実験(事前固定)**: コマンドごと事前登録する —
     `laplacebench play --team-a codex-cli:gpt-5.6-sol@medium --team-b
     codex-cli-reset:gpt-5.6-sol@medium --games 4 --swap --seed 42 --run-id
     harnesslab-sol56m-persistent-vs-reset-20260730`。実挙動に即した設計:
     **4局・各局異なる seed(42/1042/2042/3042)・seat 交互**(game 0,2 は
     persistent が Team A、game 1,3 は reset が Team A)。max-plies 100、
     output-token budget 350k/team/game、turn timeout 1,200,000ms、並列実行、
     clean-room 既定 — すべて正準既定値で固定。停止規則 = 固定4局・途中打ち切り
     なし・再抽選なし。provider 失敗は design-v0.1 §6 の availability failure
     としてそのまま報告する。完走 0 局の全滅時のみ、同条件・別 run-id で 1 度
     再実行し、それは**別報告の availability 記録**とする(findings の分析対象は
     事前登録 run とし、再実行が発生した場合は両方を明記する)。結果は verify
     通過後に community/runs/keisuke70--… へコピーしてコミットし、FINDINGS Run 9
     として記録。台帳には載るが、公開 matchup 集計には allowlist 境界により
     入らない。
   - **効果の読み方**: n=4 は差の方向と失敗モードの観測に留める(FINDINGS Run 7 と
     同じ記述規律)。ARC 報告の「再現」ではなく同軸の対応物と表現する。

6. **What disappears / is not protected** — publicPair の境界正本としての
   headline 折り畳み(同一 identity の除外としては残る)。learn/reset の
   cross-model 対局を Model Arena 公開集計に載せる経路は消える(システム対戦の
   記録としては run.json に残る)。UIタブ・投稿・matchmaking・rating、claude 側
   reset、compaction イベント記録、reasoning retention 単独実験、reset の
   published メニュー掲載、Harness Lab 独自の集計表は今回作らない。

## Tier: standard

公開集計の適格性契約(新 allowlist)、新 harness spec、run.json への additive な
記録を導入するため standard。過去の公開記録の再解釈は発生しない(community 台帳に
allowlist 外 harness の cross-model 対局が存在しないことを確認済み)。金銭・認可・
不可逆操作なし。

## Source-of-truth and removal inventory

Search terms: `LLM_HARNESSES`, `RECOGNIZED_HARNESSES`, `publicPair`, `headlineKey`,
`claude-cli-learn`, `codex-cli`, `matchup`, `isLlmSpec`, `classifyRunnableAgentSpec`,
`harness_conditions`, `matchup_kind`, `PUBLIC_MATCHUP_HARNESSES`。

| Occurrence | Classification | Target |
|---|---|---|
| `catalog.ts RECOGNIZED_HARNESSES / LLM_HARNESSES` | canonical(識別) | `codex-cli-reset` 追加 |
| `catalog.ts`(新)`PUBLIC_MATCHUP_HARNESSES` + `HARNESS_CONDITIONS` 条件表 | canonical(境界と契約) | 新設 |
| `publicgames.ts publicPair` | canonical(公開適格) | 認識済み harness の allowlist 検査を追加(fail-closed) |
| `publicgames.ts`(新)`matchupKind` | derived(allowlist から導出) | 新設 |
| `publicgames.ts classifyRunnableAgentSpec` | canonical(実行可否) | `codex-cli-reset` 追加 |
| `agents/cli.ts codexCliAgent` | canonical(適用側) | `contextPolicy` 追加 + exported pure な session-state helper(テスト seam) |
| `cli.ts makeAgent / run.json` | 記録側 | reset case、`matchup_kind`・`harness_conditions` 追加 |
| `standings.ts / publicarena.ts` | derived(publicPair 経由) | 変更不要(境界は publicPair が正本)— 回帰テストで確認 |
| `packages/cli/test/harness-boundary.test.ts` | 新規テスト | 境界・matchupKind・reset 組み立て・条件表 drift guard |
| `docs/harness-lab-direction-ja.md §10` | stale になる現状記述 | allowlist 実装を追記 |
| `README.md` scope 節(learn 文言) | derived doc | reset 併記と allowlist 境界の記述 |
| `packages/cli/FINDINGS.md` | 記録 | Run 9 追記(実験後) |
| `community/runs/keisuke70--harnesslab-sol56m-persistent-vs-reset-20260730/` | 新規実測 artifact | verify 通過後にコピーしてコミット(ルート runs/ は gitignore) |
| community 台帳の既存 run | snapshot/history | 不変(allowlist 外の cross-model 対局は存在しない・確認済み) |

## Concept model and invariants

- **allowlist は公開適格 harness の positive 分類**: そこに載る harness の対局
  だけが Model Arena の公開 matchup に入り得る。判定対象は認識済み harness 全て
  (LLM か否かに依らない)であり、載らない認識済み harness(learn/reset、および
  将来 RECOGNIZED_HARNESSES へ追加されるもの)は、allowlist へ明示追加されるまで
  モデルの同異に関係なく公開 matchup に入らない(fail-closed)。
- **matchup_kind は導出値**: allowlist と headlineKey から一意に決まり、
  独立に編集できる状態を持たない。
- **harness_conditions は宣言**: provider 内部(retention/compaction)は
  "provider-managed (opaque)" と記録し、観測できないものを検証済みとは書かない。
- **reset の同一対局内不変条件**(direction doc §4): rulebook / observation /
  action protocol / referee は persistent 側と共通。変わるのはコンテキスト寿命
  のみ。envelope(出力トークン)と timeout の適用は両側同一。
- **spec 文法は既存のまま**: `codex-cli-reset[:model][@effort]`。headlineKey は
  従来通り model@effort へ折り畳む(reset の same-model 対局が公開から落ちる
  既存挙動は維持され、cross-model も新 allowlist で落ちる)。

## Implementation

1. **`catalog.ts`** — `RECOGNIZED_HARNESSES` / `LLM_HARNESSES` に
   `codex-cli-reset` を追加。`PUBLIC_MATCHUP_HARNESSES` を新設し、根拠コメント
   (公開 matchup 適格の positive 分類、認識済み harness は明示追加まで不適格)を
   書く。`HARNESS_CONDITIONS: Record<llm-harness, {context_lifetime,
   reasoning_retention, compaction, mechanism}>` を新設(anthropic は Brief §5 の
   通り: persistent client-managed transcript / thinking 再送 / provider 内部
   opaque / アダプタ compaction なし)。
2. **`publicgames.ts`** — `classifyRunnableAgentSpec` に `codex-cli-reset`
   (model/effort 任意、latency measured)。`publicPair` に allowlist 検査を追加:
   `parseAgentSpec().harness !== null` かつ `PUBLIC_MATCHUP_HARNESSES` に無い
   side が一つでもあれば null。`matchupKind(specA, specB)` を新設。
3. **`agents/cli.ts`** — `codexCliAgent` に `contextPolicy?: "persistent" |
   "turn-reset"` を追加。turn-reset の per-turn 判断は exported pure helper
   (contextPolicy と started/threadId から {resume: string|undefined,
   includeInstructions: boolean} を返す)へ切り出し、agent はそれを
   buildCodexInvocation へ渡すだけにする(テストは helper と builder で
   no-resume・毎ターン instructions を実 CLI 起動なしに検証)。agent 名は
   `codex-cli-reset:...`。timeout 時の thread 破棄ロジックは reset では無操作。
4. **`cli.ts`** — makeAgent に reset case。run.json へ `matchup_kind` と
   `harness_conditions`(両 side、認識済み LLM harness のみ; それ以外は null)。
5. **docs** — `docs/harness-lab-direction-ja.md` §10 末尾に allowlist 実装を追記。
   README の scope 節の learn 文言に reset を並記(公開 matchup に入らない旨は
   allowlist として記述)。
6. **実験(コード外)** — 上記事前固定条件で 1 run を実行する。artifact lifecycle:
   ルート `runs/` は gitignore のため、`laplacebench verify` 通過後に
   `community/runs/keisuke70--harnesslab-sol56m-persistent-vs-reset-20260730/`
   へコピーしてコミットする(maintainer 直コミットの既存経路)。これにより
   publicPair 境界が実データで意味を持つ(台帳には載るが、公開 matchup 集計には
   allowlist により入らない)。FINDINGS Run 9 を追記(方向・失敗モード・
   latency/turn・トークン差を報告、n=4 は示唆に留める)。実行前に本 plan の
   条件節が事前登録を兼ねる。

## Tests and verification

- `packages/cli/test/harness-boundary.test.ts`(新規):
  - learn/reset の cross-model 対局(例: `claude-cli-learn:claude-opus-5@medium`
    vs `codex-cli:gpt-5.6-sol@medium`、`codex-cli-reset:gpt-5.6-sol@medium` vs
    `claude-cli:claude-opus-5@medium`)が publicPair=null になる(現状は前者が
    non-null で通る = 契約欠陥の regression 固定)。
  - same-model ablation(codex-cli vs codex-cli-reset 同 model/effort)も null。
  - arena 適格同士の cross-model は従来通り公開適格。LLM vs product-cpu、
    LLM vs opaque baseline も従来通り適格(既存公開記録の非互換ゼロ)。
  - **fail-closed drift guard**: `RECOGNIZED_HARNESSES` を実際にループし、
    `PUBLIC_MATCHUP_HARNESSES` に無い各 harness について cross-model 対局が
    null になることを機械的に検証する(将来の新 harness が自動的にこのテストの
    対象になり、第二のリスト編集を要さない)。
  - `matchupKind` の3値と、PUBLIC_MATCHUP_HARNESSES ⊆ RECOGNIZED_HARNESSES /
    HARNESS_CONDITIONS が LLM_HARNESSES を全カバーする drift guard。
  - `classifyRunnableAgentSpec("codex-cli-reset:gpt-5.6-sol@medium")` の受理。
  - reset invocation: exported pure helper + buildCodexInvocation の組で
    resume 引数が決して現れないこと、毎ターン instructions が前置されることを
    実 CLI 起動なしに検証。
- 既存回帰: `npm test` 全体。standings/publicarena のテストが allowlist 追加後も
  green であること(公開経路は publicPair 正本のため変更不要の検証)。
- 実機: curated 実験 run 自体が reset adapter と manifest の実測検証を兼ねる
  (run.json の matchup_kind = "same-model-harness-ablation"、harness_conditions
  両側、clean-room isolation manifest を確認)。

## Failure and rollback

- allowlist 追加は公開適格を狭める方向のみで、既存 community 台帳の公開対局は
  全て allowlist 内(確認済み)のため公開面の非互換はない。
- 実験 run の provider 失敗(rate limit 等)は availability failure として
  そのまま報告し、再抽選しない。run が全滅した場合のみ、条件を変えず別 run-id で
  再実行し両方を残す。
- reset adapter の不具合は対局失敗として顕在化する(referee の failure policy)。

## Completion criteria

- 境界テスト(cross-model learn/reset 排除)を含む全テスト green。
- run.json に matchup_kind / harness_conditions が記録される。
- curated 実験 1 run(4局・事前固定条件)が verify を通過して
  community/runs/keisuke70--… に追跡され、FINDINGS Run 9 が記述規律を守って
  追記されている。
- codex-impl-review APPROVED。
