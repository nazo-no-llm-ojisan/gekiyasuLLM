# 実装状況（設計との同期）

監査指摘: 設計表の「MVP ○」と実コードが乖離していた。  
**○ = 設計上の目標 / 実装 = いまのコード** をここに書く。チャットよりこのファイルが正。

最終更新: 2026-07-12（トークン＋allowlist / 失敗分類表）

失敗分類（probe / proxy error）: **[FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)**（型正本 `ProbeFailureClass`）

## 総評

| 層 | 状態 |
|---|---|
| 設計 docs | 先行・厚い |
| Proxy | **passthrough MVP**（1 上流透過） |
| ルーティング | RoutePlan スタブのみ |
| フィード収集 | 未 |
| 本番利用 | **不可**（README どおり） |

## セキュリティ F-SEC（design 5.3）

| ID | 設計MVP | 実装 |
|---|---|---|
| F-SEC-01 キー保管 | ○ 目標 | **部分** env / クライアント Bearer のみ。OSキーチェーン未 |
| F-SEC-02 secret redaction | ○ 目標 | **未** |
| F-SEC-03 private path policy | ○ 目標 | **未** |
| F-SEC-04 allow/deny list | ○ 目標 | **部分** 上流 host allowlist（base+env）+ 私有IP拒否。provider 単位 deny は未 |
| F-SEC-05 feed 署名 | 公開時 | **未** |
| F-SEC-06 telemetry | 後続 off | **未**（送らない） |
| F-SEC-07 audit log | ○ 目標 | **未** |
| F-SEC-08 自動実行しない | ○ | **済**（プロキシは実行しない） |

## ルーティング F-RT

| ID | 実装 |
|---|---|
| F-RT-05 timeout | **済** 上流 fetch タイムアウト（既定 120s） |
| F-RT-05 retry | **未** |
| F-RT-06 circuit breaker | **未** |
| F-RT-07 rate limit 尊重 | **未**（ヘッダは透過） |
| body 上限 | **済** 既定 20MiB（413） |
| プレースホルダ鍵 | **済** ループバック bind 時のみ `Bearer local\|gekiyasu\|sk-local` → env 鍵 |
| プロキシ層トークン | **済** `GEKIYASU_PROXY_TOKEN` → `X-Gekiyasu-Token`（未設定時は /v1 開放・起動時注意） |
| 上流 allowlist | **済** base host + `GEKIYASU_UPSTREAM_ALLOWLIST`。fetch 前に `resolveUpstreamUrl`。私有IP拒否 |
| リクエスト body ストリーム | **未**（全読みバッファ。NFR-02 未達） |

## 次に足す順

1. ~~設計と実装の同期表~~
2. ~~body 上限・timeout・placeholder・URL ガード~~
3. ~~プロキシ層トークン + allowlist 本体~~
4. フィード動的 `base_url` を Executor に渡すとき **必ず** `resolveUpstreamUrl`（既に用意）
5. redaction・audit・circuit・DNS pin（任意強化）

## テスト

```bash
cd packages/proxy && npm test
```

現状: `security.test.ts`（token / allowlist / private IP / loopback）
