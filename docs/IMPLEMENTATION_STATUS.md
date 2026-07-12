# 実装状況（設計との同期）

監査指摘: 設計表の「MVP ○」と実コードが乖離していた。  
**○ = 設計上の目標 / 実装 = いまのコード** をここに書く。チャットよりこのファイルが正。

最終更新: 2026-07-12

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
| F-SEC-04 allow/deny list | ○ 目標 | **部分** 上流 base URL の scheme/allowlist のみ |
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
| リクエスト body ストリーム | **未**（全読みバッファ。NFR-02 未達） |

## 次に足す順（フィード駆動の前に必須）

1. ~~設計と実装の同期表~~（本ファイル）
2. ~~body 上限・fetch timeout・placeholder 制限・upstream URL 最低ガード~~
3. プロキシ層ローカルトークン（任意強化）
4. フィードの `base_url` 動的採用時の **厳格 allowlist / DNS**
5. redaction・audit・circuit

## テスト

```bash
cd packages/proxy && npm test
```

現状: `security.test.ts`（URL / loopback / placeholder 可否）
