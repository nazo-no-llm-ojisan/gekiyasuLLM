# 02 — 要件・アーキテクチャ・ルーティング・セキュリティ

**文書**: gekiyasuLLM 設計 第2部  
**版**: 0.3-draft  
**取得・調査基準日**: 2026-07-12  
**更新**: 2026-07-12 — GitHub 公開前提、表現の見直し

関連: [01 企画・MVP](./01-product-mvp-and-business.md) · [03 スタック・ADR](./03-stack-roadmap-and-adrs.md)

---

## 5. 機能要件

### 5.1 API 互換

| ID | 要件 | MVP | 後続 |
|---|---|---|---|
| F-API-01 | OpenAI `/v1/chat/completions` | ○ | |
| F-API-02 | OpenAI `/v1/models` | ○ | |
| F-API-03 | OpenAI `/v1/responses` | | ○ |
| F-API-04 | Anthropic `/v1/messages` | | ○ |
| F-API-05 | streaming (SSE) | ○ | |
| F-API-06 | tool calling 透過 | △（passthrough） | 完全検証 |
| F-API-07 | multimodal input 透過 | | ○ |
| F-API-08 | model alias（`budget`, `free`, `code` 等。意味は設定で定義） | ○ | |
| F-API-09 | provider 固有パラメータ変換 | △ | ○ |

### 5.2 ルーティング・制御

| ID | 要件 | MVP |
|---|---|---|
| F-RT-01 | context-window 制約 | ○ |
| F-RT-02 | capability 制約（tools/vision/json） | ○ |
| F-RT-03 | コスト推定（入力/出力/キャッシュ/定額） | ○ |
| F-RT-04 | 予算制限（日/月） | ○ |
| F-RT-05 | timeout / retry / fallback | ○ |
| F-RT-06 | circuit breaker | ○ |
| F-RT-07 | rate limit 尊重（429 時 backoff） | ○ |
| F-RT-08 | prompt caching 価格考慮 | △ |
| F-RT-09 | token estimation（tiktoken 系 / 近似） | ○ 近似可 |

### 5.3 セキュリティ・ポリシー

| ID | 要件 | MVP |
|---|---|---|
| F-SEC-01 | API key は OS キーチェーン or 環境変数 or ローカル暗号化ファイル | ○ |
| F-SEC-02 | secret redaction（ログ・telemetry） | ○ ログ |
| F-SEC-03 | private repository / path policy | ○ 簡易 |
| F-SEC-04 | provider allowlist / denylist | ○ |
| F-SEC-05 | feed signature verification | 公開時 ○ |
| F-SEC-06 | telemetry opt-in | 後続（既定 off） |
| F-SEC-07 | local audit log | ○ |
| F-SEC-08 | 生成コマンド/パッチの自動実行をしない | ○ 設計原則 |

### 5.4 運用・UX

| ID | 要件 | MVP |
|---|---|---|
| F-OPS-01 | config hot reload | △ |
| F-OPS-02 | stale feed 時: warn + last-known-good | ○ |
| F-OPS-03 | offline: キャッシュ済みフィードで動作 | ○ |
| F-OPS-04 | Windows / macOS / Linux | ○ |
| F-OPS-05 | IDE 利用手順ドキュメント | ○ |
| F-OPS-06 | Docker 任意提供 | 任意 |
| F-OPS-07 | 実課金額差分記録 | 後続（手動 import 可） |

### 5.5 rtk 評価

**rtk**（Rust Token Killer, Apache-2.0）は CLI 出力を LLM 前に圧縮するツールで、開発者コマンドのトークン 60–90% 削減を公称。エージェントの Bash フック経由で動作し、本体 Read/Grep ツールは通過しない等の制約あり。telemetry は既定 off。

| 観点 | 結論 |
|---|---|
| 実現性 | 高い（独立 CLI として成熟） |
| Proxy 必須化 | **不適切**（関心が異なる層） |
| 推奨 | **optional adapter / 推奨併用**。Proxy は「送信前 token 削減」の拡張ポイントを用意 |
| 安全性 | 出力フィルタで重要エラーを落とすリスク。失敗時 full output tee 等の設計を踏襲。Proxy 側は rtk を spawn しない（ユーザー環境で併用） |

---

## 6. 非機能要件

| ID | 項目 | 目標 |
|---|---|---|
| NFR-01 | レイテンシ追加 | 非ストリーム overhead p95 < 50ms（ローカル） |
| NFR-02 | ストリーム | 初回 chunk を可能な限り透過。バッファ最小 |
| NFR-03 | メモリ | アイドル < 100MB 目標（TS 実装） |
| NFR-04 | 可用性 | ローカルプロセスとして利用者責任。自動再起動は OS サービス任意 |
| NFR-05 | 移植性 | Win/macOS/Linux x64+arm64 |
| NFR-06 | 設定 | 人間が読める YAML/TOML |
| NFR-07 | 可観測性 | ローカルログ + stats。中央は opt-in のみ |
| NFR-08 | セキュリティ | 既定 bind `127.0.0.1` のみ。LAN 公開は明示 opt-in |
| NFR-09 | 供給連鎖 | 依存最小、lockfile、checksum 付き release |
| NFR-10 | フィード鮮度 | 公開日次、有料は時間単位（将来） |
| NFR-11 | 正確性 | 価格は保証せず「last_verified」表示 |

---

## 7. アーキテクチャ案

```text
┌─────────────────────────────────────────────────────────────┐
│  IDE / Agent / SDK                                          │
│   baseURL = http://127.0.0.1:8787/v1                        │
└───────────────────────────┬─────────────────────────────────┘
                            │ OpenAI-compatible
┌───────────────────────────▼─────────────────────────────────┐
│  gekiyasuLLMProxy (local)                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ API GW   │→│ Router   │→│ Executor │→│ Stats / Audit  │ │
│  └──────────┘ └────┬─────┘ └────┬─────┘ └────────────────┘ │
│       Policy/Secrets│           │                            │
│  ┌──────────────────▼──┐   ┌────▼─────────────────────────┐ │
│  │ Feed cache + verify │   │ Upstream providers (direct)  │ │
│  └──────────▲──────────┘   └──────────────────────────────┘ │
└─────────────┼───────────────────────────────────────────────┘
              │ pull signed JSON (no user prompts)
┌─────────────┴───────────────────────────────────────────────┐
│  gekiyasuLLM.com (central, no request relay)                │
│  Collectors → Normalize → Feed builder → CDN/GitHub Pages   │
│  Optional: aggregate anonymous telemetry (opt-in)           │
│  Optional later: probes → availability headlines            │
└─────────────────────────────────────────────────────────────┘
```

**信頼境界**:

- **Zone A (最信頼)**: 利用者 PC、API keys、プロンプト、private code
- **Zone B (中)**: 署名検証済みフィード
- **Zone C (低〜可変)**: 各 LLM プロバイダ
- **Zone D (非信頼入力)**: 未署名フィード、任意 URL、スポンサー文案

---

## 8. データフロー

### 8.1 通常リクエスト

1. Client → Proxy: chat completion
2. Policy: private? allowlist? budget?
3. Token estimate（近似）
4. Router: candidates filter → rank → pick
5. Cost estimate pre-request
6. Executor: upstream call（stream 透過）
7. Post: 成功/失敗、TTFT、tokens、estimated cost を記録
8. 失敗時: circuit 更新 → fallback

### 8.2 フィード更新

1. Proxy が定期 pull（ETag/If-Modified-Since）
2. 署名検証（公開鍵はバイナリ同梱 + ピン）
3. schema version チェック
4. 原子的に cache 置換
5. stale 超過なら warn、last-known-good 継続

### 8.3 任意 telemetry（将来）

送信してよい例: model id、provider id、latency bucket、success/fail class、estimated cost bucket  
**禁止**: プロンプト、応答本文、ファイルパス、API key、repo 名（opt-in でも本文禁止）

---

## 9. ルーティングアルゴリズム

### 9.1 候補比較

| 方式 | 概要 | 長所 | 短所 | 採用時期 |
|---|---|---|---|---|
| **制約充足 + 辞書順ランク** | hard filter 後、key で sort | 説明可能・デバッグ容易 | 重み調整が粗い | **MVP** |
| 重み付きスコア | 正規化特徴の線形結合 | 柔軟 | 重みの根拠が弱い | Phase 3 |
| ルールベース DSL | `if private then ...` | 企業向き | 複雑化 | Phase 6–7 |
| bandit / 学習 | 成功率で探索 | 適応的 | データ・倫理・再現性 | 研究的将来 |

### 9.2 MVP アルゴリズム（採用）

**Step A — Hard constraints（いずれか不満足で除外）**

- `context_window >= estimated_input_tokens + reserve`
- required capabilities ⊆ model.capabilities
- provider ∈ allowlist かつ ∉ denylist
- private_mode ⇒ `trust.allows_private_code == true` かつ data_retention 条件
- `estimated_cost <= max_cost_per_request`
- circuit が open でない
- feed 上 `status != discontinued`

**Step B — Soft rank（安定ソート）**

1. `is_free_now`（無料残高/キャンペーン有効）を優先（設定で切替可）
2. `estimated_cost_usd` 昇順
3. `observed.availability_24h` 降順（無い場合は中立）
4. `observed.ttft_p50_ms` 昇順
5. `trust.score` 降順
6. ユーザー `fallback_priority`
7. model id 文字列（決定性）

**Step C — 実行**

- primary 失敗（timeout / 5xx / 空応答 / 形式不正）→ 次候補
- 429 → backoff 後同候補 or 次（設定）
- circuit: 連続 N 失敗で open、T 秒後 half-open

### 9.3 コスト推定（MVP）

```text
est = in_tokens * price_in
    + cache_read_tokens * price_cache_read   # 分かれば
    + out_tokens_est * price_out
    + request_flat_fee
```

無料枠がある場合は `est_effective = 0`（残量不明なら `unknown_free` フラグでユーザー設定に従う）。

### 9.4 将来拡張

- キャッシュヒット率のローカル学習
- タスク種別（code / long-context / vision）プロファイル
- multi-armed bandit（明示 opt-in）
- 企業向け OPA/Rego 風ポリシー

---

## 10. 可用性測定方式

### 10.1 結果クラス

| class | 意味 |
|---|---|
| `http_ok` | 2xx |
| `api_ok` | JSON/SSE が仕様上パース可能 |
| `valid_model_response` | 非空の assistant 内容 or 正当な tool_calls |
| `stream_started` | 最初の SSE event 到達 |
| `timeout` | クライアント設定時間超過 |
| `rate_limited` | 429 |
| `upstream_error` | 5xx / provider error body |
| `empty_response` | 成功形式だが中身空 |
| `tool_call_corrupt` | tool_calls 構造破損 |
| `model_mismatch_suspected` | 要求 model と応答メタが不一致（確証は別） |
| `auth_error` | 401/403（probe 鍵の問題。可用性分子から除外可） |
| `network_error` | DNS/TLS/接続失敗 |

### 10.2 可用性の定義（再現可能）

**公開ヘッドライン用（例）**:

```text
availability_24h =
  count(valid_model_response OR stream_started_with_valid_end)
  / count(eligible_probes)
```

- **eligible**: auth_error を除外（鍵問題を可用性に混ぜない）
- **成功**: 非ストリームは `valid_model_response`、ストリームは `stream_started` かつ正常終了（または最低 1 token）
- **窓**: 直近 24h
- **点推定 + 信頼**: 試行数 n を併記。n < 10 は `low_confidence`

**TTFT**: リクエスト送信完了 → 最初の content/tool token までの時間。中央値と p95。  
**tokens/sec**: 出力トークン / （完了時刻 − 最初の token）。  
**完了時間**: 全体 wall time。

### 10.3 測定メタデータ必須

- `probe_region`（例: `jp-nrt`, `us-sfo`, `local-user`）
- `probe_count`, `interval`
- `client_version`
- `prompt_fixture_id`（本文は固定・公開可能な短文）
- `max_tokens` は **最小**（1〜8）

### 10.4 規約・負荷を守る測定方針

1. **公式の health / models エンドポイントを優先**（生成を避ける）
2. 生成 probe は **低頻度**（例: モデルあたり 1–6 回/日、jitter 付き）
3. 同一 IP からのバースト禁止
4. 無料枠を食い潰さない **共有プローブ鍵は使わない**（中央 probe は専用有料極小 or 提携）
5. ローカル probe は **ユーザーの鍵・ユーザーの設定でのみ**
6. robots/利用規約で禁止のスクレイピングはしない。価格は **公式 pricing ページ / API** を優先
7. 「負荷試験」にならないよう **同時実行上限 1**
8. ヘッドラインは **サンプルバイアス**（地域・鍵種別）を明記

### 10.5 ヘッドライン例の生成規則

```text
{provider} {model} {campaign_tag}: 直近24時間の可用性 {avail}%（n={n}, region={r}）、中央値TTFT {ttft}秒
```

推定やスポンサーは別ラベル。`avail` は小数点以下四捨五入、n と region 必須。

---

## 11. データスキーマ案

### 11.1 設計原則

- **source provenance**: `official` | `observed` | `estimated` | `community` | `sponsored_copy`
- 値は `{ value, unit, source, as_of, confidence, evidence_url? }` のラップを推奨
- 商業関係はデータ本体と分離

### 11.2 TypeScript 型（案）

```typescript
type Provenance = "official" | "observed" | "estimated" | "community" | "sponsored_copy";
type Confidence = "high" | "medium" | "low" | "unknown";

interface Provenanced<T> {
  value: T;
  source: Provenance;
  as_of: string;          // ISO-8601
  confidence: Confidence;
  evidence_url?: string;
  notes?: string;
}

interface FeedDocument {
  schema_version: "1.0.0";
  feed_id: string;
  generated_at: string;
  expires_at?: string;
  publisher: { name: string; homepage: string };
  signature?: { alg: "ed25519"; key_id: string; sig_b64: string };
  providers: Provider[];
  models: Model[];
  campaigns: Campaign[];
  observations?: ObservationSeries[];
}

interface Provider {
  id: string;                 // 例: "openai", "example-gateway"
  display_name: string;
  homepage: string;
  operator_notes?: string;
  trust: {
    score: Provenanced<number>;          // 0-100 editorial
    allows_private_code: Provenanced<boolean>;
    data_retention_notes: Provenanced<string>;
    training_use_notes: Provenanced<string>;
  };
  relationships?: {
    sponsored?: boolean;
    affiliate?: boolean;
    disclosure?: string;
  };
  endpoints: Endpoint[];
}

interface Endpoint {
  id: string;
  base_url: string;
  api_compat: "openai_chat" | "openai_responses" | "anthropic_messages" | "other";
  regions?: string[];
}

interface Model {
  id: string;                 // feed-global unique
  provider_id: string;
  endpoint_id: string;
  upstream_model_id: string;  // 実際に送る model 名
  display_name: string;
  status: "active" | "degraded" | "discontinued" | "unknown";
  capabilities: {
    tools: Provenanced<boolean>;
    streaming: Provenanced<boolean>;
    vision: Provenanced<boolean>;
    json_mode?: Provenanced<boolean>;
  };
  context_window: Provenanced<number>;
  pricing: {
    input_per_mtok: Provenanced<number>;      // USD
    output_per_mtok: Provenanced<number>;
    cache_read_per_mtok?: Provenanced<number>;
    cache_write_per_mtok?: Provenanced<number>;
    request_flat_fee?: Provenanced<number>;
    currency: "USD";
  };
  free_tier?: {
    kind: "daily" | "monthly" | "trial_credit" | "campaign";
    remaining_unknown?: boolean;
    credit_usd?: Provenanced<number>;
    requires_credit_card?: Provenanced<boolean>;
  };
  last_verified_at: string;
}

interface Campaign {
  id: string;
  model_ids: string[];
  title: string;
  starts_at?: string;
  ends_at?: string;
  terms_url?: string;
  risk_notes?: string; // 終了・停止リスク
}

interface ObservationSeries {
  model_id: string;
  window: "24h" | "7d";
  region: string;
  n: number;
  availability: number;       // 0-1
  ttft_p50_ms?: number;
  ttft_p95_ms?: number;
  tps_p50?: number;
  classes: Record<string, number>;
  as_of: string;
  source: "central_probe" | "opt_in_client";
}
```

### 11.3 JSON Schema

上記を `draft-2020-12` で機械検証可能にする。`additionalProperties: false` は version 進化を考え **主要 object のみ厳格**。

### 11.4 ローカル設定スキーマ（要約）

```yaml
listen: 127.0.0.1:8787
feed:
  urls:
    - https://gekiyasuLLM.com/feed/v1/latest.json
  local_path: ./feed.json
  max_age_hours: 48
  require_signature: false   # 配布フィードでは true 推奨
routing:
  mode: cheapest_free_first
  max_cost_usd: 0.05
  private_mode: false
  allowlist: []
  denylist: []
providers:
  openai: { api_key_env: OPENAI_API_KEY }
budget:
  daily_usd: 1.0
circuit_breaker:
  failure_threshold: 3
  open_seconds: 300
```

---

## 16. セキュリティ脅威モデル

| 脅威 | 影響 | 対策 |
|---|---|---|
| private code / prompt の保存漏洩 | 高 | 中央非中継、telemetry 本文禁止、private_mode |
| API key 漏洩 | 高 | ローカルのみ、ログ redaction、`127.0.0.1` 既定 |
| 悪意あるレスポンス | 中〜高 | 自動実行しない、tool 結果の検証はクライアント責任を明記 |
| tool call 改変（中間者プロバイダ） | 高 | 高信頼 allowlist、レスポンス integrity ログ |
| モデル偽装 | 中 | 観測・ヒューリスティック警告、決定はユーザー |
| MITM | 高 | HTTPS のみ、証明書検証、ピン留めは慎重に |
| feed 改ざん | 高 | Ed25519 署名、key pin、stale 制限 |
| telemetry 漏洩 | 中 | opt-in、最小化、本文禁止 |
| SSRF（Proxy 経由） | 高 | 任意 URL 禁止、allowlist DNS、内網ブロック |
| 任意 URL 登録 | 高 | 設定で明示 allow の base_url のみ |
| ログ秘密混入 | 中 | redaction、本文ログ既定 off |
| IDE 権限境界 | 中 | Proxy は LLM API のみ。ファイル権は IDE 側 |
| 自動生成コードの自動適用 | 高 | **しない**。適用は人間/IDE 明示操作 |
| 不正スポンサー情報 | 中 | disclosure 必須、監査ログ |
| supply-chain | 高 | lockfile、再現ビルド、checksum、最小依存 |

**設計原則**: Proxy は **ルーターでありエージェント実行器ではない**。
