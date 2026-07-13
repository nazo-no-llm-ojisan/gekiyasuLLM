# ローカル Phase 4 ロードマップ

**異常観測と期限付き判断を、日次の収集・review queue・operator review・公開判断へ接続する。**  
前提となる監査可能な ledger / active projection / feed overlay は [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md)。親設計は [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)。

最終更新: 2026-07-13

---

## この Phase の位置

```text
M1–M3  正しい routing・公式データ・安全な自動 feed
  ↓
Phase 3+  observation / evidence / assessment / ledger / overlay
  ↓
Phase 4   daily collection / review queue / operator UI / publication  ← この文書
  ↓
Phase 5   OSS 利用性成熟・外部利用者の install 成功
```

Phase 4 は「中央で LLM リクエストを中継する」段階ではない。中央側が扱うのは公開情報、異常観測、evidence candidate、operator decision、署名付き feed 生成物である。

---

## ゴール

公式情報から更新された Offering 群について、異常を発見し、必要なものだけを人間が確認し、期限付きで判断し、その結果を監査可能な feed へ反映する日次運用を成立させる。

1. anomaly review queue を決定論的に生成する。
2. evidence candidate を出典・取得時刻・content identity とともに収集する。
3. operator が observation と evidence を分けて確認できる。
4. verdict、confidence、routing action、expiry、reason を append-only event として記録する。
5. expired / stale / changed evidence を自動的に再レビュー対象へ戻す。
6. Hy3 fixture で未レビューから期限切れ再浮上まで縦貫通する。
7. 日次更新を連続運用できるが、異常時は安全に公開を止められる。

---

## 本線: 4 ゲート

```text
P4+A  deterministic review queue model
  ↓
P4+B  evidence collector
  ↓
P4+C  minimal operator UI + assessment submission
  ↓
P4+D  Hy3 expiry flow + daily publication operations
```

### P4+A — Deterministic anomaly review queue

[Issue #11](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/11)。Issue #9 decomposition item 4。

| | |
|---|---|
| **入力** | anomaly observations、evidence state、active assessment、prior decision references、明示的 `now` |
| **出力** | typed review items、entry reasons、stable priority order |
| **禁止** | network、filesystem watch、timer、UI state、feed overlay、LLM explanation |
| **完了条件** | 同じ入力と clock から byte-for-byte 安定した queue を生成できる |

想定境界:

```ts
buildAnomalyReviewQueue(input, now): ReviewQueue
```

queue entry reason は machine-readable にする。例:

- `unreviewed_high_severity`
- `assessment_expired`
- `evidence_changed`
- `evidence_stale`
- `evidence_conflict`
- `unresolved_aging`

優先順位と tie-breaker は文書化し、入力配列の順序に依存させない。

#### Queue policy

- high severity + unreviewed は即時 queue。
- `inconclusive` は「調査済みだが不明」であり、`unreviewed` とは別。
- reviewed + unexpired + evidence unchanged は unresolved queue から外せる。
- expired assessment は supplied clock を越えた時点で再浮上。
- superseded decision は history として保持するが active decision にしない。
- low severity unreviewed は可視化してよいが、それだけで publication block や `block` directive を生成しない。

### P4+B — Evidence collector

Issue #9 decomposition item 5。

| | |
|---|---|
| **対象** | provider/model page、official pricing、release note、reputable secondary reporting |
| **保存** | URL、source kind、retrievedAt、publisher、claim summary、content hash、freshness/expiry、review status |
| **優先度** | provider/model page → official pricing/release → reputable reporting → community supporting only |
| **完了条件** | offline fixture と低頻度 public retrieval の両方で provenance を失わず candidate を生成できる |

collector output は常に `candidate`。検索要約や LLM 生成文を trusted metadata や operator verdict へ直接書き込まない。

#### Collector boundaries

- robots、rate limit、site terms を守る。
- provider API abuse や high-volume inference probe を行わない。
- price alone から model quality / quantization / distillation を推定しない。
- network failure は observation failure と evidence absence を区別して記録する。
- source content change は以前の assessment を自動で否定せず、queue の `evidence_changed` reason にする。

### P4+C — Minimal operator UI

Issue #9 decomposition item 6。

operator UI は Pokédex ではなく quality-control surface とする。

最低限表示するもの:

- anomaly score と raw observations
- canonical group と Offering comparison
- evidence candidates、source priority、retrieval time、freshness、conflicts
- current verdict / confidence / routing action / expiry
- prior decisions と supersession history
- unresolved age と queue entry reasons

最低限操作するもの:

- verdict 選択
- confidence 選択
- evidence accept/reject/insufficient
- metadata patch
- routing action
- reason
- effectiveFrom / expiresAt
- supersede target

submit は既存 ledger の in-place mutation ではなく、新しい override event の append とする。

#### Local-only operator identity

初期は明示的なローカル設定値または OS/user-derived display identity を候補とし、匿名 default を黙って採用しない。identity source は event に記録し、将来の GitHub/Auth 連携に依存しない契約とする。

### P4+D — Hy3 expiry flow と日次公開運用

Issue #9 decomposition item 7。Phase 4 の運用ゲート。

```text
Day 0  extreme price anomaly を観測
  ↓
collector が campaign evidence を candidate 化
  ↓
operator が launch_campaign / high / allow / expiresAt を記録
  ↓
Phase 3+ projection + overlay を通して feed に反映
  ↓
expiry 到達
  ↓
active override から除外
  ↓
review queue に assessment_expired で再浮上
  ↓
消滅 / 延長 / free 継続 / paid 化を再確認
```

少なくとも次の4分岐をテストする。

1. Offering が消滅した。
2. campaign が公式に延長された。
3. end date 後も free pricing が継続している。
4. paid pricing へ転換した。

---

## 日次 pipeline

```text
official sources / saved fixtures
  ↓ collect
raw observations + evidence candidates
  ↓ normalize / anomaly score
review queue build (explicit clock)
  ↓ operator review where required
append override event
  ↓ Phase 3+ projection
active overrides
  ↓ Phase 3+ overlay
candidate generated feed
  ↓ validate / sign / publish
site + RSS + feed
```

publication は review UI と密結合させない。operator が UI を開いていない場合でも、既存の有効判断と publication policy から決定論的に候補 feed を再生成できるようにする。

---

## Publication policy

Phase 4 では severity と review state を publication decision に使えるが、意味を混同しない。

| 状態 | 既定方針の例 |
|---|---|
| low severity / unreviewed | 表示可。保証表現は禁止 |
| high severity / unreviewed | review queue 即時。自動 ranking への投入は policy で抑制可能 |
| reviewed legitimate campaign | expiry まで `allow` 可 |
| inconclusive high severity | `deprioritize` または `require_explicit_opt_in` を選択可能 |
| conflicting official evidence | 再レビュー。既存 active decision の継続可否を明示 policy 化 |
| expired assessment | active overlay から外し再レビュー |

「未レビュー」「不明」「危険」は同義ではない。public feed に何を含めるかと automatic selection に何を許すかも別 policy とする。

---

## 運用上の失敗分類

最低限、次を別々に扱う。

- source unreachable
- source content changed
- parser failed
- schema validation failed
- anomaly scoring failed
- queue generation failed
- operator decision missing
- ledger append failed
- active projection failed
- overlay failed
- signature/publish failed

途中失敗時に、前回の正常な signed feed を破壊しない。partial output を latest として公開しない。

---

## 7日連続運用の完了条件

大枠 Phase 4 の完了条件は「日次更新7日連続」。単に cron が成功した回数ではなく、次を満たす7サイクルとする。

- source provenance 付き observation/evidence が生成される
- queue が再現可能に生成される
- required review の有無が記録される
- ledger / projection / overlay / validation / signature が成功する
- latest publication pointer が完全な成果物だけを指す
- failure 時は前回正常版を維持する
- run summary に counts と failure class が残る
- prompt、API key、private code を中央へ収集しない

---

## 並列化ルール

- P4+A は Phase 3+ schema contract のマージ後に開始。
- P4+B は evidence candidate contract の確定後、offline fixture parser と network adapter を分離して並列可。
- P4+C は queue output と ledger append contract が確定してから開始。
- P4+D は P4+A–C と Phase 3+ overlay の統合後。
- UI agent に schema や verdict vocabulary を設計させない。
- collector agent に operator verdict や routing directive を生成させない。
- publication agent に raw source observation を修正させない。

---

## この Phase で触らない

- 中央 LLM proxy / prompt relay
- paid subscription、Stripe、広告 UI
- provider ToS を回避する scraping
- high-volume behavioral fingerprinting
- LLM explanation の自動承認
- canonical-name equality を behavioral identity とみなす処理
- high anomaly score のみを理由とする unsafe 表示
- decorative comparison UI の先行実装

---

## 完了条件

- [ ] deterministic review queue が typed entry reason と stable ordering を持つ
- [ ] `unreviewed` / `inconclusive` / `stale` / `superseded` が異なる状態として扱われる
- [ ] evidence collector が provenance、freshness、content identity を保持する
- [ ] operator UI が observation と interpretation を分けて表示する
- [ ] operator submission が append-only override event を生成する
- [ ] expired / changed / conflicting evidence が review queue に再浮上する
- [ ] Hy3 fixture の4分岐がテストされる
- [ ] publication failure が前回正常 feed を破壊しない
- [ ] 日次 pipeline が7サイクル連続で監査可能に成功する
- [ ] site / RSS / feed が同じ生成データを参照する

---

## Phase 5 への引き渡し

Phase 4 完了後、Phase 5 は次に集中できる。

- README 通りの third-party install
- release artifact / checksum / upgrade path
- contributor workflow
- schema/version compatibility policy
- operator documentation
- incident / correction procedure
- support burden を抑える diagnostics

Phase 5 は Phase 4 の収集・レビュー設計を作り直さない。

---

## 関連

- Phase 3+ anomaly governance: [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md)
- 通常ローカル本線: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)
- 大枠 Phase: [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)
- 並列タスク台帳: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
- 親設計: [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)
- Review queue model: [Issue #11](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/11)
