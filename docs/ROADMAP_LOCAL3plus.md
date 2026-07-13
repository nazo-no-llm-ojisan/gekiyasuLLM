# Phase 3+ anomaly governance ロードマップ

**観測した異常を、人間の判断と監査履歴を保ったままfeed/routingへ反映する。**  
ローカルProxy本線は [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)。中央の日次review運用は [ROADMAP_LOCAL4.md](./ROADMAP_LOCAL4.md)。親設計は [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)。

最終更新: 2026-07-13（M2/M3との依存順と名称を同期）

---

## このPhaseの位置

```text
M1 正しいrouting
  ↓
M2 evidence-backed data vertical
  ├─ Phase 3+ observation / evidence / assessment / ledger / overlay  ← この文書
  └─ M3 signature / DNS pin / feed validation
       （契約確定後は並行実装可）
          ↓
Phase 4 daily collection / review / publication
```

Phase 3+は「M1–M3の別名」ではない。また、production publication開始後に追加する後付け統制でもない。M2で確定したidentity/feed契約を入力として、M3のsecurity gateと合流し、Phase 4へ渡す。

M2が現在監査修正中のため、P3+Aは [Issue #12](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) のmodel-id契約と [Issue #13](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/13) のgenerated feed境界を消費し、再定義しない。

---

## ゴール

同じcanonical modelに属するOffering間で価格、cache、context、capability等の差異が見つかったときに、次を満たす。

1. 機械が観測した事実を改変しない
2. 外部証拠はcandidateのまま保存し、人間確認なしにtrusted metadataへ入れない
3. 誰が・いつ・なぜ・何を根拠に判断したか追跡できる
4. 判断をappend-only eventとして保存し、訂正はsuperseding eventで行う
5. active overrideをsupplied clockから決定論的に再生成できる
6. reviewed active overrideだけをgenerated feed/routing metadataへ適用できる
7. 期限切れ判断をactive stateから除外し、Phase 4 review queueへ戻せる

---

## 役割分担

| 層 | 内容 | 信頼境界 |
|---|---|---|
| Machine observation | 価格差、free/paid、cache、context、capability等 | 説明や意図を推定しない |
| Evidence candidate | provider page、pricing、release note、報道等 | operator review前は未信頼 |
| Operator assessment | verdict、confidence、reason、expiry | 明示的人間判断 |
| Override event ledger | assessment、metadata patch、routing directiveのappend-only履歴 | 監査の正本 |
| Active projection | supplied clock時点で有効なeventのmaterialized view | 純粋関数・再現可能 |
| Feed overlay | reviewed active overrideを生成物へ適用 | source observationを変更しない |

`metadataPatch`と`routingDirective`は別契約にする。表示上の訂正と実行policyを混ぜない。

---

## 本線: 3ゲート

```text
P3+A  契約を固定する
  ↓
P3+B  ledger → active projection
  ↓
P3+C  active override → generated feed overlay
```

### P3+A — 観測・証拠・判断・override契約

Issue #9 decomposition item 1。

| | |
|---|---|
| **前提** | M2のapproved identity/feed contract（#12/#13後） |
| **含む** | observation / evidence / assessment / status / verdict / routing directive / override event schema |
| **必須境界** | `unreviewed`と`inconclusive`を分離、canonical source record不変、candidate evidenceはtrusted fieldへ直結しない |
| **契約変更** | `proposed`。直列で確定後に下流を開始 |
| **完了条件** | Hy3 free campaignをbehavioral equivalenceやhidden quantizationを主張せず表現できる |

最低限のstatus:

- `unreviewed`
- `reviewed`
- `inconclusive`
- `stale`
- `superseded`

最低限のrouting action:

- `observe_only`
- `allow`
- `deprioritize`
- `require_explicit_opt_in`
- `block`

高anomaly scoreだけを理由に`block`を生成しない。

### P3+B — Append-only ledgerからactive viewを投影

Issue #9 decomposition item 2。

| | |
|---|---|
| **入力** | override events、明示的`now` |
| **出力** | active overrides、expired/stale/superseded diagnostics |
| **性質** | 純粋関数、入力順序非依存、wall clockを直接読まない |
| **保存例** | `overrides/events.jsonl` → `generated/active-overrides.json` |
| **完了条件** | 同じledgerとclockからbyte-for-byte安定したactive viewを再生成できる |

訂正や判断変更は既存eventの書換・削除ではなく、新しいsuperseding eventを追加する。

### P3+C — Reviewed active overrideをgenerated feedへ適用

[Issue #10](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/10)。Issue #9 decomposition item 3。

| | |
|---|---|
| **入力** | M2で生成されたcanonical feed、materialized active overrides |
| **出力** | overlay済みfeed/routing metadata、audit reference、diagnostics |
| **禁止** | raw ledger再解釈、network access、candidate evidence直接適用、source observation破壊 |
| **完了条件** | reviewed active overrideだけが正しいOffering/canonical targetへ決定論的に適用される |

```ts
applyActiveOverrides(feed, activeOverrides): OverlayResult
```

expiry判定はP3+Bの責務。overlay関数はwall clockを読まない。

---

## 初期vertical fixture: Hy3 free campaign

```text
free-vs-paidの大きな価格差を観測
  ↓
provider page/release noteをevidence candidateとして保存
  ↓
operatorがlaunch_campaign・high confidenceと判断
  ↓
routing action = allow、expiresAtを記録
  ↓
active projectionが期間中だけoverrideを有効化
  ↓
overlayがcampaign metadataとallow directiveをfeedへ反映
```

目的は「大きな異常でも正当・説明可能・期限付きの場合がある」ことを証明すること。モデル品質や内部構造の同一性は証明しない。

---

## 並列化ルール

- M2 #12/#13を先に確定する
- P3+Aは契約確定のため直列
- P3+B後にP3+Cを開始する
- schema公開型を変えたい場合は別`contract_changes: proposed`を立てる
- Phase 4 queue/UI/collectorをPhase 3+実装へ混ぜない
- 横断Docs Syncとdone判定は統括担当のみ

---

## このPhaseで触らない

- operator UI
- review queue prioritization
- evidence search/collectionの本番接続
- scheduler/cron/notification
- hidden high-volume model probing
- 価格だけからquantization/distillation/品質劣化を推定する処理
- 中央でuser promptを中継する機能
- source observationのsilent mutation

---

## 完了条件

- [ ] schemaがobservation/evidence/assessment/patch/routing directiveを分離
- [ ] `unreviewed`と`inconclusive`を別状態としてtest
- [ ] append-only ledgerとsupersessionを表現
- [ ] supplied clockからactive overrideを決定論的に生成
- [ ] expired assessmentをactive viewから除外
- [ ] reviewed active overrideだけをfeed overlayへ適用
- [ ] metadata correctionとrouting policyを別fieldで維持
- [ ] Hy3 fixtureがcampaign expiryまで縦貫通
- [ ] package tests/typecheck/buildが緑

---

## Phase 4への引き渡し

- typed anomaly observations
- evidence freshness/conflictを表すcandidate metadata
- active assessment/override view
- expired/stale/superseded diagnostics
- Offeringとcanonical identityの安定参照
- presentation framework非依存のdomain data

Phase 4開始には、これらに加えてM3の署名・取得検証gateが必要。

---

## 関連

- ローカル本線: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)
- Phase 4: [ROADMAP_LOCAL4.md](./ROADMAP_LOCAL4.md)
- 大枠: [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)
- 台帳: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
- 親設計: [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)
- Feed overlay: [Issue #10](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/10)
