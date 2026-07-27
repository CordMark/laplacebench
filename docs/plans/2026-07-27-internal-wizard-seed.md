---
status: abandoned
direction: direction-internal-wizard-seed
owner: bench
risk_tier: heavy
last_updated: 2026-07-27
---

# Interactive seed を内部化して `laplacebench` 0.2.1 を公開する

> Superseded before implementation by the user-requested whole first-run CLI
> redesign (`docs/plans/2026-07-27-cli-first-run-ux.md`). No code or npm
> publication was performed from this narrow draft.

## Direction Brief

1. **Purpose** — 初見ユーザーが意味を理解しなくてもよい実装上の乱数 seed を、対局
   ウィザードの判断項目から外す。また、日本語 IME のまま全角数字 `１` を選択番号へ
   入れても同じ質問が繰り返される実測 blocker を取り除く。要求は公開 `0.2.0` 実行中の
   「これ見せなくていい。たとえrandomが使われたとしても内部で決めればいい」と、
   `１` を3回拒否された後の「これが連続して進めない」。

2. **Concept owner** — interactive seed の決定は `runWizardFlow` が内部所有する。scripted
   reproducibility は既存の `--seed` flag が所有し、採用 seed の監査正本は引き続き
   `run.json` / `game_start` event とする。

3. **Lifecycle and scope** — `packages/cli` の wizard UI / numeric prompt parsing、packaged README、focused tests と
   npm patch release `0.2.1`。ゲーム初期状態、乱数アルゴリズム、baseline/product CPU、
   model sampling、run schema、公開 arena、engine は変更しない。

4. **Value hierarchy** — 初見ユーザーが不要な概念を判断しないこと > 明示入力が無視されて
   いないと確認できること > 内部 provenance の見えやすさ。provenance はログに残す。

5. **Adopted direction** — 通常の対話フローは `randomSeed()` を内部採用し、seed prompt
   も start summary の seed も出さない。TTY の有無ではなく**明示入力の有無**で summary
   visibility を決め、`--seed 0` 等を明示した caller には値を表示するが prompt は出さない。
   非対話 `--seed` の validation / passthrough / summary は維持する。interactive menu と
   integer prompt では ASCII `0-9` と全角 `０-９` を同じ数字として受け付ける。正規化は
   numeric prompt 境界だけに限定し、model ID、path、任意文字列を変換しない。CLI は
   `0.2.1` として clean commit から1回だけ npm 公開する。

6. **What disappears / is not protected** — interactive `seed:` prompt、未要求 seed の
   start-summary 表示、seed の説明を代わりに出す advanced menu を捨てる。explicit
   `--seed`、ログ、deterministic baseline/CPU behavior、過去 run の replay meaning は守る。
   arbitrary Unicode normalization や曖昧な `1abc` の受理は追加・保護しない。

## Tier: heavy

実装差分だけなら UI simplification の light slice だが、利用中の public npm `latest` を
immutable `0.2.1` へ進めるため combined slice は heavy。方向づけ → plan review → 実装 →
full verify / exact pack → impl interrogation → impl review → clean commit/push → final two-pack →
1 publish → registry/public acceptance を通す。

## Source-of-truth inventory

| Surface | Classification | Change |
|---|---|---|
| `packages/cli/src/wizard.ts` | canonical interactive decision / prompt parsing owner | seed prompt 廃止、visibility は explicit flag 基準、全角 digit を numeric boundary で正規化 |
| `packages/cli/test/wizard.test.ts` | regression | ordinary / explicit / headless seed branches、全角 menu/integer input |
| `packages/cli/README.md` | packaged user instruction | wizard choice list から seed を削除 |
| `packages/cli/package.json` | canonical package version | `0.2.1` |
| `package-lock.json` | derived workspace lock | `0.2.1` |
| `packages/cli/src/cli.ts` / help | scripted contract | `--seed` を維持、変更なし |
| `packages/cli/src/types.ts#rng` | deterministic random owner | 変更なし |
| `packages/cli/src/runner.ts` | event provenance owner | `run.json` / game event の seed を維持、変更なし |
| `laplace-engine` | frozen referee | 変更・公開なし |

## Implementation and focused regression

1. `runWizardFlow` は flag `seed` が文字列なら整数採用、無ければ `deps.randomSeed()` を
   即採用する。interactive branch の `promptInteger("seed:")` は削除する。
2. summary は `seed` flag が明示された場合、または headless の場合だけ `seed=<n>` を
   含める。通常 interactive では games/swap のみ。
3. scripted test IO が受けた select/input prompt を記録できるようにし、次を固定する:
   - ordinary interactive: 回答 queue に seed を置かず完走、内部値 `4242`、prompt/summary
     に seed 無し
   - interactive + `--seed 0`: prompt 無し、内部値0、summary に `seed=0`
   - headless + explicit seed: 現行 passthrough/summary 維持
   - games の整数再prompt は seed prompt 削除後も維持
4. 全既存 scripted answers から seed 回答を除き、prompt順序を新contractへ合わせる。
5. prompt専用の targeted digit normalizer と strict menu-selection parser を共通化する。
   `１` / `２` と複数桁の全角 integer は受理し、範囲外、混在 junk (`1abc`) は従来どおり
   再promptする。scripted flags と arbitrary input は正規化しない。
6. packaged README の wizard choice 列挙から seed だけを外す。
7. CLI / lock version を `0.2.1` へ整合する。

## Verification and release

1. focused wizard/package README tests
2. `npm run build && npm run typecheck && npm test`
3. interactive scripted testsで no prompt / hidden generated / visible explicit、全角 `１` / `２`
   menu selection と全角 multi-digit integer、junk rejection を確認
4. exact `npm pack --json` full inventory、safe maps、LICENSE、secret/host-state scan
5. clean tarball install で interactive wizard を games selection まで scripted 操作し、次の
   visible questionが auto-submit で seed でないこと、headless explicit seed game と verify
6. `/interrogation` と `/codex-impl-review` APPROVED
7. version/source/doc records を clean commit で両 GitHub `main` へ push、CI success
8. clean commit から2回 byte-identical pack、同じ inventory/install/smoke を再実行
9. npm auth / owner / `0.2.1` absence を再確認し、directory publish `--ignore-scripts` を1回
10. registry `latest=0.2.1`, `gitHead`, integrity/shasum を expected と照合
11. fresh dir + isolated cache の public `npx laplacebench@latest play` を baseline同士で
    match-count choiceまで操作し、次が submit choice で seed prompt が無いことを確認して
    中止（対局は開始しない）

## Failure policy

publish 前は修正して gates を再実行。publish 応答後は結果を問わず `0.2.1` を再試行しない。
不明時は external state reconciliation で停止し、回復は新しい reviewed version とする。
公開済み version は上書き/unpublish しない。

## Completion criteria

- ordinary interactive flow に seed prompt / unrequested summary seed が無い
- interactive prompt が全角数字を受理し、同じ質問をループしない
- explicit `--seed` と log provenance は不変
- npm `latest=0.2.1` の source/digest が clean reviewed artifact と一致
- public first-user flow が match-count から直接 submit choice へ進む
