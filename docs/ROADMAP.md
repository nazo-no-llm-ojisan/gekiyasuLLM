# ロードマップ索引

「いまどこ？」の入口。長い設計は `design/`、作業チケットは台帳。

| 見たいもの | ファイル |
|---|---|
| **大枠（Phase 0–7）とピン** | [ROADMAP_MACRO.md](./ROADMAP_MACRO.md) |
| **ローカル本線（L0–L12 履歴 + M1–M3）** | [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) |
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
| 大枠 | Phase 1–3 完了。ローカル本線は **M2監査・修正中** |
| ローカル | **L12 / M1 完了**。保存snapshot→generated feedは **#13完了**、feed trust unknown保持は **#16完了**。actual pathとsame-feed catalogは未完 |
| 次の契約ゲート | [Issue #12](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) model-id contract review |
| 次の縦貫通監査 | [Issue #14](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/14) actual HTTP/executor proof |
| 並列可能なsite作業 | [Issue #15](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/15) exact same feed catalog |

```text
M1 正しいルーティング  →  M2 データ縦貫通（監査・修正中）
     T-044–046              T-039,024,050,051
                                  ↓
                         #12契約 / #13完了 / #16完了
                                  ↓
                              #14     #15
                                  ↓
                Phase 3+ anomaly governance + M3 security gate
                                  ↓
                    Phase 4 日次レビュー・公開運用
```

コミット `fd8fb47` と `62244eb` により、保存した価格fixtureからprovenance付きfeedを決定論的に生成する経路は監査済みとなった。実providerのprivate-code trustは根拠がなければfeedへ出力しない。

コミット `2adcefc` と `03c56da` により、feed由来providerのmissing trustはProxyでも`undefined`のまま保持され、private modeではexplicit `true`だけを許可する。#16は完了し、#14の安全上のblockは解除された。ただしactual HTTP/executor pathとsame-feed catalogが未証明のため、M2全体はまだ`done`ではない。

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
  design/                  ← 厚い設計・契約
  catalog/                 ← 静的モデルカタログ prototype
```

- **Phase** = 製品全体の到達段階
- **L** = 利用者向け到達段階の履歴（L0–L12完了）
- **M** = ローカル本線の依存マイルストーン
- **P3+ / P4** = Phase内の設計・運用ゲート
- **T** = エージェントへ渡す閉じた作業単位

横断Docs Syncと `done` 判定は統括担当の責務。実装担当は局所docs以外のロードマップ状態を独断で変更しない。詳細は [AGENTS.md](../AGENTS.md)。