# Phase 4 中央集計・日次レビュー運用ロードマップ

**異常観測と期限付き判断を、日次収集・review queue・operator review・公開判断へ接続する。**  
前提となるanomaly governanceは [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md)、Proxy側の安全な取得・検証は [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) M3。親設計は [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)。

最終更新: 2026-07-13（Phase 3+ / M3との合流条件を同期）

---

## このPhaseの位置

```text
M2 evidence-backed exact-same-feed vertical
  ├─ Phase 3+ observation / evidence / assessment / ledger / overlay
  └─ M3 signature / DNS pin / feed validation
       ↓  両gateを満たす
Phase 4 daily collection / review queue / operator UI / publication  ← この文書
  ↓
Phase 5 OSS利用性成熟
```

Phase 4は中央でLLM requestを中継する段階ではない。扱うのは公開情報、異常観測、evidence candidate、operator decision、署名対象feed生成物である。

M2が監査修正中のため、Phase 4実装は少なくとも [Issue #12](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) と [Issue #13](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/13) のidentity/generated-feed契約を前提にする。queue/UI/collectorが独自feed modelを作らない。

---

## ゴール

公式情報から更新されたOffering群について、異常を発見し、必要なものだけを人間が確認し、期限付きで判断し、その結果を監査可能なfeedへ反映する日次運用を成立させる。

1. anomaly review queueを決定論的に生成する
2. evidence candidateを出典・取得時刻・content identityとともに収集する
3. operatorがobservationとinterpretationを分けて確認できる
4. verdict/confidence/routing action/expiry/reasonをappend-only eventとして記録する
5. expired/stale/changed evidenceを再review対象へ戻す
6. Hy3 fixtureで未reviewから期限切れ再浮上まで縦貫通する
7. 日次更新を連続運用し、異常時は前回正常版を維持して公開を止められる

---

## 本線: 4ゲート

```text
P4+A deterministic review queue model
  ↓
P4+B evidence collector
  ↓
P4+C append boundary + minimal operator UI
  ↓
P4+D Hy3 expiry flow + daily publication operations
```

### P4+A — Deterministic anomaly review queue

[Issue #11](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/11)。Issue #9 decomposition item 4。

| | |
|---|---|
| **入力** | anomaly observations、evidence state、active assessment、prior decision refs、明示的`now` |
| **出力** | typed review items、entry reasons、stable priority order |
| **禁止** | network、filesystem watch、timer、UI state、feed overlay、LLM explanation |
| **完了条件** | 同じ入力とclockからbyte-for-byte安定したqueueを生成 |

```ts
buildAnomalyReviewQueue(input, now): ReviewQueue
```

最低限のentry reason:

- `unreviewed_high_severity`
- `assessment_expired`
- `evidence_changed`
- `evidence_stale`
- `evidence_conflict`
- `unresolved_aging`

方針:

- high severity + unreviewedは即時queue
- `inconclusive`と`unreviewed`を混同しない
- reviewed + unexpired + evidence unchangedは通常queueから外せる
- expired assessmentはsupplied clockで再浮上
- superseded decisionはhistoryだけに残す
- anomaly scoreだけで`block`やpublication stopを自動生成しない

### P4+B — Evidence collector

Issue #9 decomposition item 5。

| | |
|---|---|
| **対象** | provider/model page、official pricing、release note、reputable secondary reporting |
| **保存** | URL、source kind、retrievedAt、publisher、claim summary、content hash、freshness/expiry、review status |
| **優先度** | provider/model page → official pricing/release → reputable reporting → community supporting only |
| **完了条件** | offline fixtureと低頻度public retrievalの両方でprovenanceを失わずcandidateを生成 |

collector outputは常に`candidate`。検索要約やLLM生成文をtrusted metadataやoperator verdictへ直接書かない。

境界:

- robots/rate limit/site termsを守る
- provider API abuseやhigh-volume inference probeをしない
- priceだけからquality/quantization/distillationを推定しない
- network failureとevidence absenceを区別する
- source changeはassessmentを自動否定せず、`evidence_changed`としてqueueへ渡す

### P4+C — Append boundary + Minimal operator UI

Issue #9 decomposition item 6。

UIはquality-control surfaceであり、decorative model catalogではない。

表示:

- anomaly scoreとraw observations
- canonical groupとOffering comparison
- evidence candidates、priority、retrieval time、freshness、conflicts
- current verdict/confidence/routing action/expiry
- prior decisionsとsupersession history
- unresolved ageとqueue reasons

操作:

- verdict/confidence
- evidence accept/reject/insufficient
- metadata patch
- routing action
- reason
- effectiveFrom/expiresAt
- supersede target

submitは既存ledgerのin-place mutationではなく、新しいoverride event append。append service/boundaryとUIは別責務として実装し、UI agentにledger contractを設計させない。

初期operator identityは明示的local settingまたはOS/user-derived display identityを候補とし、匿名defaultを黙って採用しない。identity sourceをeventへ記録する。

### P4+D — Hy3 expiry flowと日次公開運用

Issue #9 decomposition item 7。

```text
Day 0 extreme price anomaly
  ↓
collectorがcampaign evidenceをcandidate化
  ↓
operatorがlaunch_campaign / high / allow / expiresAtをappend
  ↓
Phase 3+ projection + overlay
  ↓
M3 validate/sign candidate feed
  ↓
expiry到達 → active overrideから除外
  ↓
review queueへassessment_expiredで再浮上
```

少なくとも次をtestする。

1. Offering消滅
2. campaign公式延長
3. end date後もfree継続
4. paid pricingへ転換

---

## 日次pipeline

```text
official sources / saved fixtures
  ↓ collect
raw observations + evidence candidates
  ↓ normalize / anomaly score
review queue build (explicit clock)
  ↓ operator review where required
append override event
  ↓ Phase 3+ projection / overlay
candidate generated feed
  ↓ M3 validate / sign / safe publish
site + RSS + feed
```

publicationはreview UIと密結合させない。UIを開いていなくても、既存の有効判断とpublication policyから候補feedを決定論的に再生成できること。

---

## Publication policy

| 状態 | 既定方針の例 |
|---|---|
| low severity / unreviewed | 表示可。保証表現は禁止 |
| high severity / unreviewed | queue即時。automatic rankingはpolicyで抑制可 |
| reviewed legitimate campaign | expiryまで`allow`可 |
| inconclusive high severity | `deprioritize`または`require_explicit_opt_in`を選択可 |
| conflicting official evidence | 再review。active decision継続可否を明示policy化 |
| expired assessment | active overlayから外し再review |

「未review」「不明」「危険」は同義ではない。public feedへ含めるかとautomatic selectionへ許可するかも別policy。

---

## 運用上の失敗分類

最低限、次を別々に扱う。

- source unreachable / content changed
- parser failed / schema validation failed
- anomaly scoring failed / queue generation failed
- operator decision missing / ledger append failed
- projection failed / overlay failed
- signature failed / publication failed

途中失敗時に前回正常signed feedを破壊しない。partial outputをlatestとして公開しない。既存`ProbeFailureClass`へ無理に混ぜず、pipeline/publication用taxonomyを別契約として定義する。

---

## 7日連続運用の完了条件

単にcronが成功した回数ではなく、次を満たす7サイクル。

- provenance付きobservation/evidence生成
- queueを再現可能に生成
- required review有無を記録
- ledger/projection/overlay/validation/signature成功
- latest pointerが完全成果物だけを指す
- failure時は前回正常版を維持
- run summaryにcountsとfailure classを記録
- prompt/API key/private codeを中央収集しない

---

## 並列化ルール

- P4+AはPhase 3+ schema contract後
- P4+Bはevidence candidate contract後、offline parserとnetwork adapterを分離可能
- append boundaryをUIより先に確定
- P4+C UIはqueue outputとappend contract後
- P4+DはP4+A–C、Phase 3+ overlay、M3 validation/signatureの統合後
- collectorにoperator verdictを生成させない
- publication agentにraw observationを修正させない
- 実装担当は横断Docs Syncやdone宣言をしない

---

## このPhaseで触らない

- 中央LLM proxy / prompt relay
- paid subscription、Stripe、広告UI
- ToS回避scraping
- high-volume behavioral fingerprinting
- LLM explanationの自動承認
- canonical-name equalityをbehavioral identityとみなす処理
- anomaly scoreだけによるunsafe表示
- decorative comparison UIの先行実装

---

## 完了条件

- [ ] deterministic review queueにtyped reason/stable order
- [ ] `unreviewed` / `inconclusive` / `stale` / `superseded`を区別
- [ ] evidence collectorがprovenance/freshness/content identityを保持
- [ ] operator UIがobservationとinterpretationを分離表示
- [ ] operator submissionがappend-only eventを生成
- [ ] expired/changed/conflicting evidenceがqueueへ再浮上
- [ ] Hy3 fixtureの4分岐をtest
- [ ] publication failureが前回正常feedを破壊しない
- [ ] 日次pipelineが7サイクル完走
- [ ] package tests/typecheck/buildが緑

---

## Phase 5への引き渡し

- README通りのthird-party install
- release artifact/checksum/upgrade path
- contributor workflow
- schema/version compatibility policy
- operator documentation
- incident/correction procedure
- support burdenを抑えるdiagnostics

Phase 5はPhase 4の収集・review設計を作り直さない。

---

## 関連

- Phase 3+: [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md)
- ローカル本線/M3: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)
- 大枠: [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)
- 台帳: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
- 親設計: [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)
- Review queue: [Issue #11](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/11)
