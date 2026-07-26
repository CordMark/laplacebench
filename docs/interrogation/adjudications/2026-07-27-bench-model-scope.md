# work item: bench-model-scope — tier: light

Slice: laplacebench 側ドキュメントのみ。ベンチマークの採点対象を
モデル対モデルに明示し、ハーネス設計を競わせる領域(軸3・段5・シーズン制
ハーネス部門)を範囲外へ保留として登録。学習シリーズ(`claude-cli-learn`)を
「一度きりの探索・保留」として位置づけ直し、モデル側の種目が今後増えうる
ことと、その最有力候補である `split-ally`(同盟の色ごとに独立コンテキスト。
味方への意思共有能力を測る)を記録した。

Requirement source: ユーザー対話 2026-07-27。「この学習の部分はハーネスの
存在でどれくらい強さが変わるのか試していた一例で一旦導入したがハーネスを
作り込んで実際に対戦するみたいな部分はこのベンチマークの範囲の外に保留
してる」「このページはあくまでモデルのベンチマークとしての部分に
フォーカスさせた」「もちろんまだベンチマークとしても色々な種目を作るかも
しれない。例えば今は一つのモデルが２色を操作しているが１色ずつ別スレッドに
操作させ仲間間の意思の共有能力も測るなど」「一旦この前提でbench側の
ドキュメントを更新して」。

Tier defense: doc/copy のみ。変更は README.md / docs/design-v0.1.md /
docs/experiment-axes-ja.md / docs/public-platform-strategy-ja.md /
packages/cli/FINDINGS.md の5ファイル。schema・状態遷移・API contract・CI・
認可・金銭・legacy data semantics・不可逆操作いずれも変更なし。コードと
アダプター(`claude-cli-learn` を含む)は無変更で、保留は削除ではなく
ラベル付けとして表現。回帰ゲート: `npm run build && npm test` 13/13 pass、
追加した相対リンクと見出しアンカーを実ファイル・実見出しに対して検証。

## Impl review (codex-impl-review, session impl-bench-model-scope)

- Q(review/false-shared-invariant): 「両者は同一アダプターで走る」という
  スコープ宣言が実際の cross-provider 対局(claude-cli vs codex-cli)と矛盾し、
  同一 README 内のハーネス条件記述とも衝突 → 受理、共通なのは
  rulebook/観測/プロトコル/リソース方針/レフェリーであり、アダプターは
  プロバイダ要求の範囲で異なりラベル付き条件として保持する、へ修正
  (revise, class: B)。R3 で同じ誤りが docs/experiment-axes-ja.md の
  現在のスコープ節にも残っていたため同文へ統一。
- Q(review/candidate-promoted-to-commitment): ユーザーが「作るかもしれない」
  と述べた `split-ally` を README Status と Phase 3 が確定ロードマップ項目
  (新種目)として記載 → 受理、README は "leading candidate, not a committed
  one"、Phase 3 は「新種目の検討…実施が確定した項目ではない」、軸4 表は
  `split-ally`(**候補**) へ統一(revise, class: B)。
- Q(review/parked-lane-still-reads-active): 軸2 の `series-notes` 行と
  「リーダーボード2枚」「最も刺さり得る指標」「実装コスト最小」が、後段の
  保留注記を読まない読者には現行レーンとして読める → 受理、表の行自体を
  取り消し線+保留表記にし、生きている条件(cold/primed/series-transcript)を
  明示、学習スロープ2枚案は series-notes 依存の保留中設計として書き直し
  (revise, class: B)。
- ラウンド 3・指摘計 4 件で APPROVED(confidence 0.99)

## 保留の登録先(再開時に読む場所)

- docs/experiment-axes-ja.md 「現在のスコープ」+ 軸3 見出しの状態ブロック
- docs/public-platform-strategy-ja.md 冒頭スコープ注記 + 「保留: 競技
  (ハーネス部門)」節
- docs/design-v0.1.md §12 Decisions intentionally deferred
- packages/cli/FINDINGS.md Run 7 の Status ブロック(唯一の実測)

## 未対応(このスライスの範囲外)

- laplace-main 側 `/bench/learning` は実装済みだが被リンク 0 の孤児。
  ドキュメント上は「深いリンクのまま常設導線には載せない」と確定したので
  現状と一致するが、製品側の UI 変更は本スライスでは触っていない。
