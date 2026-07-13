# ロードマップ索引

「いまどこ？」の入口。長い設計は `design/`、作業チケットは台帳。

| 見たいもの | ファイル |
|---|---|
| **大枠（Phase 0–7）とピン** | [ROADMAP_MACRO.md](./ROADMAP_MACRO.md) |
| **ローカル本線（L0–L12 履歴 + M1–M3）** | [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) |
| **Phase 3++ 横正規化基盤** | [design/07-horizontal-schema-normalization.md](./design/07-horizontal-schema-normalization.md) |
| **Phase 3+ anomaly governance** | [ROADMAP_LOCAL3plus.md](./ROADMAP_LOCAL3plus.md) |
| **Phase 4 中央集計・日次レビュー運用** | [ROADMAP_LOCAL4.md](./ROADMAP_LOCAL4.md) |
| 設計とコードのギャップ表 | [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) |
| 並列タスク台帳 T-0xx | [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) |
| 短いユーザ報告 | [USER_STATUS_TEMPLATE.md](./USER_STATUS_TEMPLATE.md) |
| 静的モデルカタログ（M2 prototype） | [catalog/index.html](./catalog/index.html) |

---

## いま（まとめて一言）

| 地図 | 位置 |
|---|---|
| 大枠 | Phase 1–3 完了。ローカル本線は **M2完了 / M3準備** |
| ローカル | **L12 / M1 / M2 完了**。model-id契約、generated feed、trust保持、actual HTTP/executor proof、same-feed catalogを監査済み |
| Phase 3++ | [Issue #17](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/17) 横正規化基盤を設計・子Issue #18–#24へ分解済み。最初は#18移植監査/golden corpus |
| Phase 3+ | [Issue #9](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/9) anomaly governance。Phase 3++のtyped observationを入力として利用 |
| M2契約ゲート | [Issue #12](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) **done / closed** |
| 監査済み縦貫通 | [Issue #14](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/14) **done / closed** |
| 監査済みsite | [Issue #15](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/15) **done / closed** |

```text
M1 正しいルーティング  →  M2 データ縦貫通・契約監査 完了
     T-044–046              T-039,024,050,051
                                   ↓
                    #12 / #13 / #16 / #14 / #15 完了
                                   ↓
         Phase 3++ 横正規化基盤 (#17–#24) + M3 security gate
                                   ↓
                  Phase 3+ anomaly governance (#9–#11)
                                   ↓
                     Phase 4 日次レビュー・公開運用
```

コミット `fd8fb47` と `62244eb` により、保存した価格fixtureからprovenance付きfeedを決定論的に生成する経路は監査済みとなった。実providerのprivate-code trustは根拠がなければfeedへ出力しない。

コミット `2adcefc` と `03c56da` により、feed由来providerのmissing trustはProxyでも`undefined`のまま保持され、private modeではexplicit `true`だけを許可する。

コミット `f278593`–`60c7631`、`00c2d7f`、`031b92c`、統合コミット `e4ac4d0`、追補 `01d6521` により、actual HTTP→executor attemptの縦貫通と、ProxyとPagesがexact same feedを使う静的catalog生成・stale検出を監査完了した。

Issue #12のmodel-id契約はmain `6e11a83`で統合・監査完了した。raw/normalized provider、deprecated互換alias、access variant、canonical key、rule表保守契約が型・実装・test・design 06で一致する。GitHub Actions run `29253627169`は対象SHAでsuccess。これによりM2は`done`。

`nazo-no-llm-ojisan/ag`のschema fingerprint、variant dictionary、Observation JSONL、streaming normalization研究を監査した。成果は再利用価値が高い一方、silent parse skip、brace counting、fingerprint v1、identity fallback、transform failure、backpressureにproduction契約上の未確定点があるため、Phase 3++として設計 07とIssue #17–#24へ分解した。

---

## ドキュメントの役割分担

```text
docs/
  ROADMAP.md               ← この索引
  ROADMAP_MACRO.md         ← 製品全体のPhaseと依存
  ROADMAP_LOCAL.md         ← 利用者向け段階 (L) + ローカル本線 (M)
  ROADMAP_LOCAL3plus.md    ← anomaly governance / ledger / overlay
  ROADMAP_LOCAL4.md        ← 中央の日次収集・review・publication
  PARALLEL_AGENTS.md       ← T番号・owned_paths・done_when・実装状態
  IMPLEMENTATION_STATUS.md ← コード着地と監査済み状態の差
  design/06-*              ← 縦: model identity契約
  design/07-*              ← 横: schema normalization契約
  catalog/                 ← 静的モデルカタログ prototype
```

- **Phase** = 製品全体の到達段階
- **L** = 利用者向け到達段階の履歴（L0–L12完了）
- **M** = ローカル本線の依存マイルストーン
- **P3++** = providerレスポンスの横正規化データ基盤
- **P3+ / P4** = anomaly governanceと中央運用ゲート
- **T / Issue** = エージェントへ渡す閉じた作業単位

横断Docs Syncと `done` 判定は統括担当の責務。実装担当は局所docs以外のロードマップ状態を独断で変更しない。詳細は [AGENTS.md](../AGENTS.md)。