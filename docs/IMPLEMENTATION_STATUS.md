# 実装状況（設計との同期）

**○ = 設計上の目標 / 実装 = いまのコード。** チャットよりこのファイルが正。

**ピン:** [ROADMAP.md](./ROADMAP.md) · 失敗分類: [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)

最終更新: 2026-07-12（L7 + CI glob 修正後と同期）

## 総評

| 層 | 状態 |
|---|---|
| 設計 docs | 先行・厚い |
| Proxy | **中継 + 境界 + plan filter/rank + executor fallback**（catalog はまだ実質1本） |
| ルーティング | **L7 まで**（circuit 未。実候補複数はフィード後） |
| フィード収集 | 未 |
| Dashboard | 静的デモ（`/dashboard/`） |
| 本番利用 | **不可** |
| CI | **Actions あり**（test はファイル明示列挙） |

## セキュリティ

| 項目 | 実装 |
|---|---|
| F-SEC-01 キー保管 | 部分（env / Bearer） |
| F-SEC-02 redaction | 未 |
| F-SEC-03 private path | 未 |
| F-SEC-04 allowlist | 上流 host + redirect 再検査 + 私有IPv4 |
| F-SEC-05 feed 署名 | 未 |
| F-SEC-08 自動実行しない | 済 |
| `/v1/v1` join | 済 `joinUpstreamUrl` |
| redirect SSRF | 済 `redirect: "manual"` |
| 非loopback | 済 token 必須（または危険フラグ） |
| body 上限 | 済 413（destroy 前に reject） |
| stream backpressure | 済 pipeline + client abort → upstream abort |

## ルーティング

| 項目 | 実装 |
|---|---|
| RoutePlan filter+rank | 済 |
| Executor plan.primary | 済 |
| Executor fallbacks | **済**（5xx/429/timeout 等で次候補。circuit 未） |
| maxCostPerRequest | estimatedCostPerRequest のみ（$/M と混同しない） |
| preferLowCachePrice | 死コードバグ修正。既定は inputPerMillion で安定ソート |

## 次

1. **L9** CostEstimate（本線候補）  
2. L11 実キー E2E（任意・手動）  
3. L8 静的フィード（catalog を複数にする本命）  
4. redaction / audit / DNS pin / circuit  

