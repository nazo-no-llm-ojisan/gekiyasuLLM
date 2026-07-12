# 実装状況（設計との同期）

**○ = 設計上の目標 / 実装 = いまのコード。** チャットよりこのファイルが正。

**ピン:** [ROADMAP.md](./ROADMAP.md) · 失敗分類: [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)

最終更新: 2026-07-12（次セクション L13〜 を ROADMAP_LOCAL に起票後）

## 総評

| 層 | 状態 |
|---|---|
| 設計 docs | 先行・厚い。ローカル本線 **M1–M3** は [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) |
| Proxy | **中継 + 境界 + plan/filter/fallback + フィード + CostEstimate + credential isolation + ローカル統計 JSONL + circuit** |
| ルーティング | plan は動くが **request model 未使用**（**M1 / T-044** 未）。GET/HEAD fallback 済。POST fallback 禁止 |
| フィード収集 | 未（静的ファイル読込は L8 済） |
| Dashboard | 静的デモ（`/dashboard/`）。公開カタログは L24 Pages 予定 |
| 本番利用 | **不可**。公開フィードは L17 署名 + L18 DNS pin 前は不可 |
| CI | **Actions あり**（test はファイル明示列挙 — L19 で硬化予定） |

## セキュリティ

| 項目 | 実装 |
|---|---|
| F-SEC-01 キー保管 | 部分（env / Bearer / `providerApiKeys`。キーチェーン・暗号化ファイルは未） |
| F-SEC-02 redaction | 未 |
| F-SEC-03 private path | 未 |
| F-SEC-04 allowlist | 上流 host + redirect 再検査 + 私有IPv4 + **IPv6 ULA/link-local/v4-mapped 私有** (T-033) |
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
| **tenant / correlation headers** | **済 (T-031)** — `openai-organization` / `openai-project` / `idempotency-key` は **configured upstream origin のみ**転送。foreign origin では drop |
| **`Content-Encoding` リーク防止** | **済 (issue #1)** — `copyResponseHeaders`（`executor.ts`）と `HOP_BY_HOP`（`upstream.ts`）で `content-encoding` を必ず strip。undici が自動展開した本文に元の `Content-Encoding: br` が残る問題を根治。ストリーム / 書換経路ともに同じ規則。回帰テスト: `response header hygiene after undici decompression` |
| **`Content-Length` strip** | **済** — undici 展開後の本体長は wire の `Content-Length` と一致しないため、hop-by-hop として落とす |
| **`/v1/models` 形正規化** | **済** — `normalizeModelsResponseJson` で `{object:"list", data:[…{object:"model", owned_by}…]}` に揃える。`owned_by` 欠落時は `provider` フォールバック → `upstream` |

## ルーティング

| 項目 | 実装 |
|---|---|
| RoutePlan filter+rank | 済（ただし **request 非連動** — 現状ほぼ `preferFree` 固定） |
| **request model → offering 候補化** | **未（M1 / T-044）** |
| **upstreamModelId への body 書換** | **未（M1 / T-044）** |
| tools/vision/stream/private を request から hard filter | **未（M1 / T-044）** |
| apiCompat fail-closed（非 OpenAI 除外） | **未（M1 / T-045）** |
| allowsPrivateCode fail-closed | **未（M1 / T-046）** — catalog が unknown を true 扱い |
| Executor plan.primary | 済 |
| Executor fallbacks | **済（GET/HEAD のみ）** — 408/429/5xx/timeout/network 等で次候補。**POST 等は fallback 禁止** |
| Circuit breaker (T-036) | **済** — per-offering closed/open/half-open。server 寿命で共有。`GEKIYASU_CIRCUIT_FAILURES` / `GEKIYASU_CIRCUIT_OPEN_SECONDS` |
| CostEstimate 最小 | **済**（input/output 等。L9） |
| maxCostPerRequest | estimatedCostPerRequest のみ（$/M と混同しない） |
| preferLowCachePrice | 死コードバグ修正。既定は inputPerMillion で安定ソート |
| 静的フィード → catalog | **済**（L8。`GEKIYASU_FEED_FILE`）。feed host の自動 allowlist 追加あり → **M3 / T-035** で分離 |
| ローカル統計 (L10) | **済** — append-only JSONL。本文・キーなし |

## 次（起票済み・台帳）

正本のチケット表: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) · ローカル表示: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)「起票済みバックログ」。

| ID | 内容 | 状態 |
|---|---|---|
| **T-033** | IPv6 ULA / link-local / v4-mapped SSRF ブロック | **done** |
| **T-031** | tenant headers origin-scope + endpoint credential map | **done** |
| **T-036** | circuit breaker | **done** |
| **T-034** | DNS rebinding / resolve-and-pin | todo（公開フィード前） |
| **T-035** | feed 署名検証 (F-SEC-05) | todo（**公開フィード必須ゲート**） |
| **T-037** | stats CLI / 集計 | todo |
| **T-038** | IDE 一通 docs | todo（利用者任意） |
| **T-040** | design/06 モデル同定・正規化契約 | **done** |
| **T-039** | model-id / developer pure TS | todo（収集。Proxy 非混入） |
| **T-041** | model identity Lua hook 評価 | todo（T-039 後。pure TS 既定、wasmoon 等は薄く評価） |
| **T-042** | 単一実行ファイル / Releases | todo（SEA/pkg、checksum、WASM 同梱は採用時確認） |
| **T-043** | 観測対象への反作用 NFR | todo（docs。herding / 自己参照リスク） |

| 項目（未採番・メモ） | メモ |
|---|---|
| POST fallback opt-in | idempotency + 明示 opt-in 後 |
| redaction / audit | 境界・運用 |
| deprecated 整理 | `assertSafeUpstreamBaseUrl` 等 |
| CI test 明示列挙 | **M3 / T-048** |
| CORS actual response | **品質レーン T-047** |
| health が upstream URL 全文 | **品質レーン T-049** |
| `Accept-Encoding: identity` で上流圧縮を禁止 | **未採用**（issue #1 検討）。上流が br/gzip/zstd で返してきても proxy 側で strip する前提（`copyResponseHeaders` + `HOP_BY_HOP`）で根治済み。`identity` を強制すると (a) 巨大 `/v1/models` で帯域が増える、(b) 一部 upstream は `Accept-Encoding: identity` を尊重せず依然 br を返す、(c) proxy 層で再度展開する必要はない。再開しない。`curl` で `Accept-Encoding: identity` を渡すのは個人診断用としては有用。 |

本線: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) **M1–M3** · 台帳 [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)。

## 外部監査メモ（2026-07-12）

- 個人 loopback MVP は条件付き可。まだ「最安候補を選ぶ中継器」。
- **本線は依存グラフ:** **M1**（T-044–046）→ **M2**（T-039/024/050/051）→ **M3**（T-035/034/048）。品質レーンは並列。
- CORS/health/circuit は本線から外す（ロードマップ線形化の再発防止）。

**P0/P1 正本コミット:** `e2b3d14`。  
