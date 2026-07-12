# 失敗分類（正本）

**型の正本:** `packages/schema/src/probe.ts` の `ProbeFailureClass`。  
本表は人間向けの短い写し。設計 docs（02/05）の旧名は本表に寄せる。  
二値（ok/ng）に潰さない。

## ProbeFailureClass

| class | 意味 |
|---|---|
| `ok` | 成功（失敗ではないが分類に含む） |
| `dns_error` | DNS 解決失敗 |
| `connect_timeout` | TCP/TLS 接続タイムアウト |
| `timeout` | クライアント設定時間超過（接続後含む） |
| `network_error` | その他ネットワーク/TLS 失敗 |
| `http_429` | レート制限 |
| `http_5xx` | 上流 5xx |
| `upstream_error` | 5xx 以外の provider error body 等 |
| `auth_error` | 401/403（鍵問題。可用性分子から除外可） |
| `invalid_json` | 応答 JSON パース不能 |
| `empty_response` | 成功形式だが中身空 |
| `stream_interrupted` | SSE/ストリーム途中切断 |
| `tool_schema_invalid` | tool_calls 構造破損・不正 |
| `model_not_found` | モデル不存在 |
| `model_mismatch_suspected` | 要求 model と応答メタ不一致（確証は別） |

## Proxy error `code`（現状実装メモ）

OpenAI 風 `{ error: { message, type, code } }`。`type` は多く `proxy_error`。

| code | いつ |
|---|---|
| `missing_proxy_token` / `invalid_proxy_token` | プロキシ層トークン |
| `missing_api_key` | 上流鍵なし |
| `upstream_not_allowed` | allowlist / 私有 IP 拒否 |
| `upstream_timeout` | 上流タイムアウト |
| `upstream_unreachable` | 上流到達不能 |
| `not_found` | 未知パス |
| `internal_error` | 予期せぬ内部エラー |

## 設計 docs との対応（旧 → 正本）

| 旧（design 02 等） | 正本 `ProbeFailureClass` |
|---|---|
| `rate_limited` | `http_429` |
| `tool_call_corrupt` | `tool_schema_invalid` |
| `network_error`（DNS 含む） | `dns_error` / `connect_timeout` / `network_error` に細分 |
| `http_ok` / `api_ok` / … | 成功判定用。失敗分類ではない（可用性定義は design 02 §10.2） |
