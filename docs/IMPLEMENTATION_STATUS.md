# 実装状況（設計との同期）

**○ = 設計上の目標 / 実装 = いまのコード。** チャットよりこのファイルが正。

**ピン:** [ROADMAP.md](./ROADMAP.md) · 失敗分類: [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)

最終更新: 2026-07-12（P0 credential isolation / P1 non-idempotent fallback 後と同期）

## 総評

| 層 | 状態 |
|---|---|
| 設計 docs | 先行・厚い |
| Proxy | **中継 + 境界 + plan filter/rank + executor fallback + 静的フィード + CostEstimate 最小 + credential isolation** |
| ルーティング | **L9 まで**（circuit 未。GET/HEAD fallback 済。POST 等は fallback 禁止） |
| フィード収集 | 未（静的ファイル読込は L8 済） |
| Dashboard | 静的デモ（`/dashboard/`） |
| 本番利用 | **不可** |
| CI | **Actions あり**（test はファイル明示列挙） |

## セキュリティ

| 項目 | 実装 |
|---|---|
| F-SEC-01 キー保管 | 部分（env / Bearer / `providerApiKeys`。キーチェーン・暗号化ファイルは未） |
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
| **client Authorization の送信先** | **済** — `config.upstreamBaseUrl` の **exact origin 一致時のみ** client key を転送。別 origin は `providerApiKeys[providerId]` のみ（無ければ `credential_unavailable` で送信前 skip） |
| **upstream request headers** | **済** — allowlist（`content-type` / `accept` 等）。`authorization` / `cookie` / `x-api-key` / `x-gekiyasu-token` / `proxy-authorization` は client からコピーしない |
| **placeholder 置換** | **済** — loopback かつ configured upstream origin のみ。別 origin に global key を送らない |

## ルーティング

| 項目 | 実装 |
|---|---|
| RoutePlan filter+rank | 済 |
| Executor plan.primary | 済 |
| Executor fallbacks | **済（GET/HEAD のみ）** — 408/429/5xx/timeout/network 等で次候補。**POST/PATCH/PUT/DELETE 等は fallback 禁止**（二重実行・二重課金防止）。circuit 未 |
| CostEstimate 最小 | **済**（input/output 等。L9） |
| maxCostPerRequest | estimatedCostPerRequest のみ（$/M と混同しない） |
| preferLowCachePrice | 死コードバグ修正。既定は inputPerMillion で安定ソート |
| 静的フィード → catalog | **済**（L8。`GEKIYASU_FEED_FILE`） |

## 次

1. **L10** ローカル統計  
2. **L11** 実キー E2E（任意・手動）  
3. redaction / audit / DNS pin / circuit  
4. POST fallback の将来設計（idempotency key + 明示 opt-in。現状は opt-in なし）  
