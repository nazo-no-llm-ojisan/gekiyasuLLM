# Phase 3++ 横正規化基盤 — Schema Fingerprint / Observation / Adapter

## 1. 目的

複数providerの`/models`レスポンスを、モデル個体ごとの手書きルールではなく、構造バリアントとsemantic adapterによって共通Observationへ正規化する。

Phase 3++はM2で確定したmodel identity正規化を再定義しない。

- **縦正規化**: raw model ID → developer / family / version / derivative / canonical key
- **横正規化**: raw provider record → schema variant / normalized-unmapped-missing observations

両者はOffering projectionで初めて交差する。

```text
provider snapshot
  → envelope-aware parser
  → schema fingerprint
  → structural variant
  → semantic adapter
  → Observation JSONL
  → model identity parser
  → Offering projection
  → anomaly governance (#9)
```

## 2. 出典と移植方針

研究・試作の出典は`nazo-no-llm-ojisan/ag`。

再利用対象:

- provider snapshotsとendpoint調査
- schema fingerprintの考え方
- variant dictionary
- provider adapter dispatch
- `normalized` / `unmapped` / `missing` Observation
- JSONL逐次出力
- TDD fixtureと定量検証

そのままproduction契約にしない対象:

- 行単位brace counting parser
- parse failureのsilent skip
- unknown variantで`id`を暗黙仮定するfallback
- transform failureを`normalized: null`として扱う挙動
- write backpressureを待たない出力
- null/array/optional fieldを含むfingerprint v1の曖昧さ

移植は履歴保存より契約保全を優先し、必要なら実装を再構成する。研究repoをruntime dependencyやgit submoduleにはしない。

## 3. 信頼境界

### 3.1 Raw snapshot

取得したレスポンスを改変せず保存し、最低限次を記録する。

- provider key
- endpoint URLまたはendpoint identifier
- retrievedAt
- HTTP status
- response content hash
- collector/version
- authentication requirementの有無

snapshotは観測の正本であり、normalized outputで置換しない。

### 3.2 Structural variant

Schema FingerprintはJSON構造のdispatch keyであり、意味の同一性を証明しない。

```text
fingerprint = 形
adapter     = 意味
provenance  = 根拠
```

同じfingerprintでもproviderごとに異なるsemantic adapterを使える。異なるfingerprintでも同じadapterへ明示的に割り当てられる。

### 3.3 Semantic adapter

adapterはsource path、target path、変換、単位、identity fieldを明示する。

adapter未定義・identity抽出不能・transform失敗は黙って成功扱いしない。

### 3.4 Observation

最低限の状態:

- `normalized`: 明示ruleにより正常変換された
- `unmapped`: rawに存在するがrule未定義
- `missing`: rule対象だがrawに存在しない
- `invalid`: 値は存在するが型・単位・変換契約に違反

Observationはraw値・source path・target path・variant・adapter・snapshot provenanceを追跡可能にする。

## 4. Fingerprint v2契約

fingerprint canonicalizationはversion付き公開契約とする。

必須論点:

- object keyは安定sort
- `null`を欠損と混同しない
- arrayは`array`として扱い、必要な範囲で要素型を表現
- primitive型を明示
- optional field差をstrict variantとして残すか、family groupingを別途持つ
- hash衝突ではなくcanonical structure比較でも検証可能
- canonicalization version変更時はv1/v2を併存または明示migration

`strict fingerprint`と、運用上の近縁構造を束ねる`variant family`を混同しない。初期実装はstrict fingerprintを正本とし、family clusteringは別タスクにする。

## 5. Parser契約

parserはproviderごとのresponse envelopeを設定で指定できる。

例:

- top-level array
- `data[]`
- `models[]`
- nested `data.data[]`
- paginationされた複数snapshot

必須性質:

- JSON文字列内の`{}`を構造として誤計数しない
- parse errorをsilent skipしない
- input model count / emitted model count / error countを返す
- malformed recordの位置または識別情報をdiagnosticへ残す
- parserはnetwork取得を行わない

## 6. Streaming契約

- inputを全件`JSON.parse`で保持しない
- output streamのbackpressureを待つ
- abort/cancelを伝播する
- partial output時はcomplete成功と扱わない
- deterministic inputからbyte-stable outputを生成する
- ordering contractを明示する

「ストリーミング」は低メモリの努力目標ではなく、境界testを持つ実装契約とする。

## 7. Identityとの接続

Observation生成時点ではraw provider model IDを保持する。

Offering projectionでM2の`parseModelId()`を呼び、次を付与する。

- rawProvider
- normalizedProvider
- developer
- family
- version
- derivative
- accessVariant
- canonicalKey

Schema Fingerprintからdeveloperやcanonical identityを推測しない。

## 8. Offering projection境界

Phase 3++ coreはproduction feedへ自動接続しない。

projectionは別ゲートとし、以下を要求する。

- price単位とinput/output/cache区分が明示される
- context limitの意味が明示される
- capability unknownをfalseへ縮約しない
- `invalid` / `unmapped`をtrusted Offering fieldへ昇格しない
- source snapshotとadapter revisionをprovenanceとして保持
- model identity confidenceとschema/adapter confidenceを別々に保持可能

## 9. Phase 3+との関係

Phase 3++は#9 anomaly governanceの入力基盤である。

```text
horizontal observations
  + canonical identity
  → comparable Offerings
  → anomaly observations
  → evidence / review / override ledger (#9–#11)
```

Schemaの違いそのもの、unknown variant、変換失敗、provider内の急なvariant変化もanomaly observation候補になる。

ただしPhase 3++はoperator review UI、evidence search、override ledgerを実装しない。

## 10. 実装ゲート

### P3++A — 移植監査とgolden corpus

`ag`の実装・tests・snapshots・生成物を棚卸しし、再利用/再実装/非採用を決める。代表fixtureと期待件数をgolden corpusとして本線へ置く。

### P3++B — envelope-aware loss-accounting parser

silent skipのないparser、provider envelope config、count/diagnostic契約を実装する。

### P3++C — fingerprint v2

null/array/primitiveを含むcanonical structureとversioned hashを実装する。

### P3++D — Observation / adapter契約

`normalized` / `unmapped` / `missing` / `invalid`とtransform semanticsを固定する。

### P3++E — deterministic streaming pipeline

variant dispatch、backpressure、abort、byte-stable JSONL、summary accountingを実装する。

### P3++F — identity + Offering projection

ObservationからM2 identityを付与し、承認済みfieldだけをOffering候補へ投影する。production feed接続はこのゲートの監査後に別途行う。

### P3++G — corpus regression / CI

研究時の大規模snapshot群または再配布可能な縮約corpusで、件数・variant・diagnostics・determinismのregression gateを作る。

## 11. 並列化

- P3++Aは最初に直列
- A完了後、B/C/Dは別worktree・別branchで並列可
- EはB/C/D依存
- FはEとM2 identity依存
- GはB–Fを横断監査するため最後
- proxy hot path、M3 security、#9 ledger/UIへscopeを広げない

## 12. Phase 3++完了条件

- raw snapshotとnormalized outputが分離される
- parserがsilent data lossを起こさず件数を会計する
- fingerprint canonicalizationがversioned contractになる
- adapter未定義・identity不能・transform failureが明示diagnosticになる
- Observationが4状態を区別する
- streaming outputがbackpressure/abort/determinism testを持つ
- M2 model identityとの接続が一方向である
- Offering projectionがunknown/unmapped/invalidをtrusted fieldへ昇格しない
- golden corpusとCI regressionがgreen
- #9 anomaly governanceへtyped observationを渡せる
