# ローカル Phase 3+ ロードマップ

**観測した異常を、人間の判断と監査履歴を保ったまま feed / routing へ反映する。**  
通常のローカル Proxy 本線は [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)。中央の日次レビュー運用は [ROADMAP_LOCAL4.md](./ROADMAP_LOCAL4.md)。親設計は [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)。

最終更新: 2026-07-13

---

## この Phase の位置

```text
M1 正しいルーティング
  ↓
M2 公式データ縦貫通
  ↓
M3 署名付き feed を安全に自動取得
  ↓
Phase 3+ 異常観測と人間判断を監査可能な overlay にする  ← この文書
  ↓
Phase 4 日次収集・review queue・operator UI
```

Phase 3+ は「中央サービスを始める Phase」ではない。ローカルかつ決定論的なデータ処理として、機械観測、人間判断、feed 補正、routing policy を分離する。

---

## ゴール

同じ canonical model に属する Offering 間で、価格、cache、context、capability 等の差異が見つかったときに、次を満たす。

1. 機械が観測した事実を改変しない。
2. 外部証拠は候補のまま保存し、人間の確認なしに trusted metadata へ入れない。
3. 人間の判断を、誰が・いつ・なぜ・何を根拠に行ったか追跡できる。
4. 判断を append-only event として保存し、訂正は superseding event で行う。
5. active override を supplied clock から決定論的に再生成できる。
6. reviewed active override だけを generated feed / routing metadata へ適用できる。
7. 期限切れ判断を active state から除外し、Phase 4 の review queue へ戻せる。

---

## 役割分担

| 層 | 内容 | 信頼境界 |
|---|---|---|
| Machine observation | 価格差、free/paid、cache、context、capability 等の観測 | 説明や意図を推定しない |
| Evidence candidate | provider page、pricing、release note、報道等の参照 | operator review 前は未信頼 |
| Operator assessment | verdict、confidence、reason、expiry | 明示的な人間判断 |
| Override event ledger | assessment、metadata patch、routing directive の append-only 履歴 | 監査の正本 |
| Active projection | supplied clock 時点で有効な event の materialized view | 純粋関数・再現可能 |
| Feed overlay | reviewed active override を生成物へ適用 | source observation を変更しない |

`metadataPatch` と `routingDirective` は別契約にする。表示上の訂正と実行ポリシーを混ぜない。

---

## 本線: 3 ゲート

```text
P3+A  契約を固定する
  ↓
P3+B  ledger → active projection
  ↓
P3+C  active override → generated feed overlay
```

### P3+A — 観測・証拠・判断・override の契約

Issue #9 decomposition item 1。

| | |
|---|---|
| **含む** | observation / evidence / assessment / status / verdict / routing directive / override event の schema |
| **必須境界** | `unreviewed` と `inconclusive` を分離、canonical source record 不変、evidence candidate は trusted field に直結しない |
| **契約変更** | `proposed`。直列で確定してから下流を並列化 |
| **完了条件** | Hy3 free campaign を、behavioral equivalence や hidden quantization を主張せず表現できる |

最低限の status:

- `unreviewed`
- `reviewed`
- `inconclusive`
- `stale`
- `superseded`

最低限の routing action:

- `observe_only`
- `allow`
- `deprioritize`
- `require_explicit_opt_in`
- `block`

高 anomaly score だけを理由に `block` を生成してはならない。

### P3+B — Append-only ledger から active view を投影

Issue #9 decomposition item 2。

| | |
|---|---|
| **入力** | override events、明示的 `now` |
| **出力** | active overrides、expired/stale/superseded diagnostics |
| **性質** | 純粋関数、入力順序に依存しない、wall clock を直接読まない |
| **保存例** | `overrides/events.jsonl` → `generated/active-overrides.json` |
| **完了条件** | 同じ ledger と clock から byte-for-byte 安定した active view を再生成できる |

訂正や判断変更は既存 event の書換・削除ではなく、新しい superseding event を追加する。

### P3+C — Reviewed active override を generated feed へ適用

[Issue #10](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/10)。Issue #9 decomposition item 3。

| | |
|---|---|
| **入力** | generated canonical feed、materialized active overrides |
| **出力** | overlay 済み feed/routing metadata、適用 audit reference、diagnostics |
| **禁止** | raw ledger の再解釈、network access、candidate evidence の直接適用、source observation の破壊的変更 |
| **完了条件** | reviewed active override だけが正しい offering/canonical target に決定論的に適用される |

想定境界:

```ts
applyActiveOverrides(feed, activeOverrides): OverlayResult
```

expiry 判定は P3+B の責務であり、overlay 関数は wall clock を読まない。

---

## 初期 vertical fixture: Hy3 free campaign

`tencent/hy3:free` を最初の縦貫通 fixture とする。

```text
free-vs-paid の大きな価格差を観測
  ↓
provider page / release note 等を evidence candidate として保存
  ↓
operator が launch_campaign・high confidence と判断
  ↓
routing action = allow
  ↓
終了日を expiresAt に記録
  ↓
active projection が期間中だけ override を有効化
  ↓
overlay が campaign metadata と allow directive を feed に反映
```

この fixture の目的は、「大きな異常でも正当・説明可能・期限付きの場合がある」ことを証明することであり、モデル品質や内部構造の同一性を証明することではない。

---

## 並列化ルール

- P3+A は契約確定のため直列。
- P3+B と P3+C は同時開始しない。P3+C は P3+B の active-view contract マージ後。
- schema 公開型を変えたくなった場合、既存タスク内で変更せず、新しい `contract_changes: proposed` を立てる。
- 1エージェントは独立した赤テスト1本だけを緑にする。
- Phase 4 の queue / UI / collector を Phase 3+ 実装へ混ぜない。

---

## この Phase で触らない

- operator UI
- review queue prioritization
- evidence search / collection の本番接続
- background scheduler / cron / notification
- hidden high-volume model probing
- 価格だけから quantization、distillation、品質劣化を推定する処理
- 中央でユーザープロンプトを中継する機能
- source observations の silent mutation

---

## 完了条件

- [ ] schema が observation / evidence / assessment / patch / routing directive を分離する
- [ ] `unreviewed` と `inconclusive` が異なる状態としてテストされる
- [ ] event ledger が append-only と supersession を表現する
- [ ] supplied clock から active override を決定論的に生成できる
- [ ] expired assessment が active view から除外される
- [ ] reviewed active override だけが feed overlay に適用される
- [ ] metadata correction と routing policy が別フィールドのまま維持される
- [ ] Hy3 fixture が campaign expiry まで縦貫通する
- [ ] package tests / typecheck / build が緑

---

## Phase 4 への引き渡し

Phase 3+ は次を Phase 4 へ渡す。

- typed anomaly observations
- evidence freshness / conflict を表せる candidate metadata
- active assessment / override view
- expired / stale / superseded diagnostics
- offering と canonical identity の安定した参照
- operator UI が読めるが presentation framework に依存しない domain data

review queue、evidence collector、operator UI、日次 publication は [ROADMAP_LOCAL4.md](./ROADMAP_LOCAL4.md) の責務。

---

## 関連

- 通常ローカル本線: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)
- 大枠 Phase: [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)
- 並列タスク台帳: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
- 親設計: [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9)
- Feed overlay: [Issue #10](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/10)
