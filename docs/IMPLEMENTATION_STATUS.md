# 実装状況（設計との同期）

**○ = 設計上の目標 / 実装 = いまのコード。** チャットよりこのファイルが正。

**ピン:** [ROADMAP.md](./ROADMAP.md) · 失敗分類: [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)

最終更新: 2026-07-12（L10 ローカル統計 JSONL 後と同期）

## 総評

| 層 | 状態 |
|---|---|
| 設計 docs | 先行・厚い |
| Proxy | **中継 + 境界 + plan/filter/fallback + フィード + CostEstimate + credential isolation + ローカル統計 JSONL** |
| ルーティング | **L10 まで**（circuit 未。GET/HEAD fallback 済。POST 等は fallback 禁止） |
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
| **tenant / correlation headers** | **部分** — `openai-organization` / `openai-project` / `idempotency-key` は allowlist に入り **全 origin に転送され得る**（API key ではない。P0 ではない residual）。将来: configured upstream origin のみに限定 |

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
| ローカル統計 (L10) | **済** — append-only JSONL（既定 `data/stats.jsonl`）。method/path/offering/attempts/status/latency/ok。本文・キーなし。`GEKIYASU_STATS_FILE=off` で無効 |

## 次（本線）

1. IDE 一通（任意）— [L11_MANUAL_E2E.md](./L11_MANUAL_E2E.md)  
2. circuit breaker / stats CLI・集計 UI（後段）

## 将来タスク（本線外・境界強化）

| 項目 | メモ |
|---|---|
| **origin-scoped headers + credential mapping** | (1) `openai-organization` / `openai-project` / `idempotency-key` を **configured upstream origin にだけ**転送し、feed-driven 別 origin には送らない。(2) `providerApiKeys` を endpoint/origin 単位 mapping へ移行。同一パッケージで扱うとよい。**今すぐの P0 ではない**。`idempotency-key` は POST fallback 未実装の現段階では必須ではない |
| POST fallback opt-in | idempotency サポート + ユーザー明示 opt-in 設計後に再検討 |
| redaction / audit / DNS pin / circuit | 境界・運用の続き |

**P0/P1 正本コミット:** `e2b3d14`（docs 同期 `d4880d8`）。`4bbc1fb` は未完成扱い。  
