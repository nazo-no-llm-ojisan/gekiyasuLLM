# ローカル節ロードマップ

**自分の PC 上で「使える中継」から「正しく安い方へ送る」まで。**  
大枠は [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)。作業単位・done_when・owned_paths は [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)。

最終更新: 2026-07-13（M2実装候補の監査結果と修正Issueを反映）

---

## 役割分担（混同しない）

| 記号 | 意味 | 正本 |
|---|---|---|
| **L0–L12** | 利用者から見た到達段階。完了済み | 下の履歴 |
| **M1–M3** | ローカルProxyを公開feedへ接続する依存マイルストーン | **本ファイル** |
| **Phase 3+** | anomaly governance / ledger / overlay | [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md) |
| **Phase 4** | 中央の日次収集・review・publication | [ROADMAP_LOCAL4.md](./ROADMAP_LOCAL4.md) |
| **T-0xx** | エージェントへ渡す作業単位 | [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) |

番号は工程順を表さない。依存グラフで進む。実装コミットが存在しても、done_whenの証拠と統括監査がなければ `done` ではない。

---

## いまの位置

```text
L0–L12  中継・plan・静的feed・統計・dashboard・circuit  ████ 完了

本線マイルストーン
  M1  正しく振り分ける     ████ 完了（T-044 / T-045 / T-046）
  M2  データから一本通す   ██░░ 実装候補着地・監査修正中  ← いまここ
  M3  安全に取得・検証する ░░░░

M2後
  Phase 3+ anomaly governance  ░░░░
  Phase 4 日次review/publication ░░░░
```

**ピン:** M2。コミット `34a01e1` に T-039 / T-024 / T-050 / T-051 の実装候補が着地したが、次が未証明。

- saved snapshot → parser → generated feed の接続
- canonical model normalizationを使ったfeed生成
- 実HTTP / executor / injected attemptを通るvertical slice
- Proxyと静的catalogがexact same feedを使用

修正依存:

```text
#12 model-id contract review
  ↓
#13 saved snapshots → deterministic generated feed
  ├─ #14 real HTTP/executor vertical proof
  └─ #15 exact same feed → static catalog
```

本番利用・自動取得公開フィードは不可。M3とPhase 3+の公開ゲート前に開始しない。

---

## 本線: 3 マイルストーン

```text
現在 (L12)
  ↓
M1 正しいルーティング          T-044 · T-045 · T-046  ✅
  ↓
M2 データ縦貫通                T-039 · T-024 · T-050 · T-051
  ↓                             audit fixes #12–#15
M3 安全な取得・検証            T-035 · T-034 · T-048
  ├─ Phase 3+ anomaly governance
  └─ publication security gate
       ↓
Phase 4 日次レビュー・公開運用
```

### M1 — 正しく振り分ける（完了）

Proxyの正しさだけ。スクレイピングも署名も不要。

| | |
|---|---|
| **含む** | request bodyからmodel・能力を読む / 対応Offeringだけ候補化 / `apiCompat` fail-closed / private trust fail-closed / `upstreamModelId`へ書換 |
| **タスク** | T-044 ✅ · T-045 ✅ · T-046 ✅ |
| **完了条件** | fixture上の同一論理モデルについて、適合する最安Offeringを選び、正しい`upstreamModelId`を実HTTP経路から上流attemptへ渡せる |

### M2 — データから実際に一本通す（監査修正中）

収集・正規化と「同じfeed」の比較面。

| | |
|---|---|
| **含む** | model-id正規化 / 保存した公式情報から少数provider収集 / provenance付きOffering / 2–3 provider縦貫通 / exact same feedから静的Pages生成 |
| **タスク** | T-039 · T-024 · T-050 · T-051 |
| **実装着地** | `34a01e1`。コード・fixture・prototypeあり。ただし完了証拠は未成立 |
| **修正Issue** | [#12](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) → [#13](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/13) → [#14](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/14) / [#15](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/15) |
| **完了条件** | 保存snapshotから決定論的に生成した同一feedを、比較サイトとローカルProxyが利用し、実HTTP/executor経路で正しいOffering・endpoint・body rewriteを証明する |
| **Pagesの扱い** | この段階で出してよい。署名済み本番feedではない。人間が読む静的catalog |

`docs/catalog/data.js`への手動複製、手書き価格、generic policy URLだけによる実providerの`allowsPrivateCode: confirmed`はM2完了証拠にしない。

### M3 — 公開feedを安全に取得・検証する

Proxy側のsecurity gate。日次publication運用そのものはPhase 4。

| | |
|---|---|
| **含む** | feed署名検証 / rollback・期限 / feed hostがallowlistを勝手に拡張しない / DNS resolve-and-pin / CI build・全テスト検出 |
| **タスク** | T-035 · T-034 · T-048（T-048は実装済み、M3全体は未完） |
| **完了条件** | 自動更新された候補feedをProxyが安全に取得・検証し、拒否条件をfail-closedで扱える |

異常価格の説明・review・override・publication policyは [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md) の責務。M3だけでproduction publication開始とはしない。

---

## 品質レーン

| タスク | 内容 |
|---|---|
| T-047 | CORS全経路 + origin allowlist — done |
| T-049 | health情報最小化 |
| T-037 | stats CLI / 集計 |
| T-038 | IDE一通docs |
| T-042 | 単一実行ファイル / Releases |
| T-036 | circuit breaker — done |
| T-031 / T-033 | tenant headers / IPv6 SSRF — done |
| 任意 | T-041 Lua hook、T-043 herding NFR |

---

## 触らない

- 中央でユーザープロンプトを中継する
- 保証付きの最安表示
- 少数縦貫通より先に全社scrapingを横展開する
- 署名なし自動取得feedを本番相当で読む
- 月額・Stripe・広告UI
- 実装担当が横断ロードマップを独断でdone更新する

---

## 履歴: L0–L12（完了）

```text
L0  設計・契約                         完了
L1  中継箱 (passthrough)               完了  127.0.0.1:16191
L2  境界ガード                         完了
L3  共有型 + fixture                   完了
L4–L7 RoutePlan / Executor / fallback  完了
L8  静的フィード                       完了
L9  CostEstimate 最小                  完了
L10 ローカル統計 JSONL                 完了
L11 実キーE2E（curl最小）              完了（IDEは利用者）
L12 静的dashboard                      完了
```

| ローカル段 | 台帳 | 状態 |
|---|---|---|
| L1–L2 | T-020 | done |
| L3 | T-021 | done |
| L4–L7 | T-022–T-028 | done |
| L8–L9 | T-029 | done |
| L10 | T-032 | done |
| credential isolation | T-030 | done |
| IPv6 / tenant / circuit | T-033 / T-031 / T-036 | done |

### Phase 1–3チェック

- [x] models + 最小completion（curl）
- [ ] IDE一通（利用者・T-038）
- [x] RoutePlan → Executor
- [x] GET/HEAD fallback、POST禁止
- [x] 静的feed差し替え
- [x] ローカル統計
- [x] M1 正しいmodel IDで振り分け
- [ ] M2 evidence-backed exact-same-feed縦貫通

---

## 関連

- 台帳・投げ方: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
- 実装ギャップ: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
- モデル同定契約: [design/06-model-identity-and-normalization.md](./design/06-model-identity-and-normalization.md)
- anomaly governance: [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md)
- 中央日次運用: [ROADMAP_LOCAL4.md](./ROADMAP_LOCAL4.md)
- 大枠Phase: [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)
