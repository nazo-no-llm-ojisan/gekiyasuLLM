# 05 — アダプタ境界・正規化・ルーティング分離

**版:** 0.5-draft  
**日付:** 2026-07-12  

**目的:** MVP 実装を壊さず、後から掘り返しにくい概念境界を先に固定する。  
特に **Evidence / Offering / RoutePlan** は初期から置く。

関連: [02 スキーマ](./02-architecture-routing-and-security.md) · [03 ADR](./03-stack-roadmap-and-adrs.md) · 型: `packages/schema`

---

## 1. 優先して境界を切るもの（MVP 前）

1. 情報源取得と解析の分離（Fetcher ≠ Parser）  
2. 正規化 + 証拠（Evidence）モデル  
3. 上流 LLM API アダプタ（価格収集とは別系統）  
4. ポリシー（hard）とスコアリング（soft）の分離  
5. プローブと失敗分類  
6. Model / Provider / Endpoint / Offering / Campaign の ID 分離  
7. fixture / replay  

**今すぐフル実装しない。** 型・ディレクトリ・ADR で契約を先に置く。

---

## 2. 情報源アダプタ（価格・能力・規約の収集）

### 2.1 種類

```text
SourceAdapter
├─ OfficialPricingPageAdapter
├─ OfficialDocsAdapter
├─ JSONApiAdapter
├─ ProviderDashboardAdapter
├─ ManualOverrideAdapter
└─ CommunityReportAdapter
```

### 2.2 取得と解釈の分離

```text
Fetcher → RawSnapshot → Parser → NormalizedRecord
```

| 段階 | 責務 | 壊れる要因 |
|---|---|---|
| Fetcher | HTTP/ファイル取得のみ | ネットワーク、認証 |
| RawSnapshot | 生データ保存（hash 付き） | ストレージ |
| Parser | 単価・無料枠等の抽出 | DOM/JSON 形状変更 |
| NormalizedRecord | 内部単位への正規化 | 換算ロジック |

同じクラスに HTML 取得と「入力単価抽出」を同居させると、料金ページ DOM 変更で全部壊れる。  
**スナップショットを残せば、パーサー修正後に再取得なしで再解析できる。**

### 2.3 正規化価格（内部統一）

各社単位（1M / 1K / request / 一律 / キャッシュ作成・読取 / 通貨 / 税 / 無料残高 / 日次無料 / alias）を内部で統一する。

```ts
type NormalizedPricing = {
  currency: "USD" | "JPY" | "CNY";
  inputPerMillion?: number;
  cachedInputPerMillion?: number;
  cacheWritePerMillion?: number;
  outputPerMillion?: number;
  perRequest?: number;
  minimumCharge?: number;
  asOf: string;
};
```

### 2.4 追跡必須（正規化ミスが最悪）

各正規化値に必ず紐づける:

| 項目 | 意味 |
|---|---|
| raw value | 元表記 |
| normalized value | 内部値 |
| conversion formula | 換算式または識別子 |
| source / Evidence | 出典 |
| parser version | パーサー版 |

### 2.5 Evidence（証拠）— 後付け禁止級

価格だけでなく、context、CC 要否、無料枠、利用規約、データ保持の **すべて** に出典を付ける。

```ts
type Evidence = {
  sourceUrl: string;
  retrievedAt: string;
  sourceType: "official" | "provider_api" | "manual" | "observed";
  rawSnapshotHash?: string;
  parserId?: string;
  parserVersion?: string;
  confidence: "confirmed" | "inferred" | "unverified";
};
```

既存の `Provenanced<T>`（02）は Evidence を内包する形へ寄せる。

---

## 3. エンティティ分離（識別子）

モデル名文字列を主キーにしない。

```text
Model          — 論理モデル（canonical）
Provider       — 運営主体
Endpoint       — base_url + API 互換
Offering       — ある Endpoint 上の「提供経路」（課金・キャンペーン込み）
Campaign       — 期間付き条件
```

同じ論理モデルでも別 Offering:

- 公式 API  
- OpenRouter 経由  
- その他仲介  
- 無料キャンペーン経路  

```text
canonical model ID:  minimax/minimax-m3
provider model ID:   MiniMax-M3
endpoint alias:      minimax-m3:free
marketing name:      MiniMax M3 Free
offering ID:         openrouter:minimax/minimax-m3:free
```

**ルーターが選ぶ主キーは Offering ID。**

---

## 4. 上流 LLM アダプタ（実行経路・価格収集とは別）

```text
UpstreamAdapter
├─ OpenAICompatibleAdapter
├─ AnthropicCompatibleAdapter
├─ GeminiAdapter
└─ ProviderSpecificAdapter
```

内部共通リクエスト → 各 API 形式 → 共通レスポンス。

失わないもの:

- streaming  
- tool calling  
- usage  
- finish reason  
- reasoning tokens  
- cache hit 情報  
- provider 固有エラー  
- rate limit headers  

**「全部 OpenAI 互換に丸めればよい」は採らない。** Anthropic 等を足すと共通型が壊れる。  
OpenAI 互換は最初の Adapter 実装であり、共通型そのものではない。

### 公称能力と実測能力

```text
declaredCapabilities   — 公式・フィード上の公称
observedCapabilities   — プローブ・実トラフィックの観測
```

上書きせず併記。例: 「tools 対応」公称でも streaming 時のみ壊れる。

---

## 5. ヘルスプローブ

```text
Probe
├─ ConnectivityProbe
├─ CompletionProbe
├─ StreamingProbe
├─ ToolCallProbe
├─ ContextLengthProbe
└─ ModelIdentityProbe
```

結果は二値にしない。失敗分類例:

```text
dns_error
connect_timeout
http_429
http_5xx
invalid_json
empty_response
stream_interrupted
tool_schema_invalid
model_not_found
auth_error
network_error
```

「可用性 80%」は分類付きの集計で定義（02 の taxonomy と整合）。

---

## 6. ルーティング: 選択と実行の分離

```text
CandidateFilter   — hard constraints
→ CandidateScorer — soft preferences
→ RoutePlan       — 実行計画（HTTP をまだ送らない）
→ RouteExecutor   — 計画に従い UpstreamAdapter を呼ぶ
```

### RoutePlan 例

```json
{
  "primary": "zenmux/glm-5.2-free",
  "fallbacks": [
    "provider-b/minimax-m3",
    "official/glm-5.2"
  ],
  "reason": [
    "cost=0",
    "availability=0.83",
    "private_code_allowed=false"
  ]
}
```

（ID は Offering ID。例示名は仮。）

ルーターが直接 `fetch` する設計はテスト困難 → **Plan 生成を単体テスト可能にする。**

### ポリシー

```text
Hard constraints:   private 禁止, trust low 禁止, 最大コスト, tools 必須 …
Soft preferences:   無料優先, TTFT 短, キャッシュ単価安 …
```

制約判定と順位付けは別処理（02 の Step A / B と一致）。

---

## 7. コスト計算エンジン（独立）

```text
PricingRecord + UsageEstimate + AccountState → CostEstimate
```

考慮候補:

- 入出力トークン  
- キャッシュヒット率 / 書込価格  
- request 定額・最低課金  
- 無料残高・日次上限  
- 通貨換算・税  
- provider markup  

### アカウント状態（モデル価格と分離）

```ts
type AccountCredit = {
  providerId: string;
  remaining?: number;
  currency?: string;
  expiresAt?: string;
  verifiedAt?: string;
};
```

無料残高は Offering 価格表に埋めず、**AccountState** として持つ。

---

## 8. fixture / replay

```text
fixtures/
  pricing/<provider>/<date>.html
  api/openai-compatible/streaming.jsonl
  errors/rate-limit.json
  snapshots/<hash>/meta.json
```

パーサー・アダプタは **ネットなしでテスト**可能にする。  
毎回実 API を叩く CI は無料枠・規約・フレークの面で避ける。

---

## 9. 現状コードとの対応

| 概念 | 現状 (packages/proxy) | 次の置き場 |
|---|---|---|
| UpstreamAdapter | `upstream.ts` が OpenAI 透過のみ | `upstream/` + schema の共通型 |
| RoutePlan / Executor | 未分離（直 fetch） | `route/plan.ts`, `route/executor.ts` |
| SourceAdapter | 未実装 | 将来 `packages/collectors` 等 |
| Evidence / Offering | 型を `packages/schema` に先行配置 | フィード生成時に使用 |
| Probe | 未実装 | `probe/` |
| Cost engine | 未実装 | `cost/` |
| Policy | 未実装 | `policy/` |

**既定ポート `16191` は変えない。**

---

## 10. 実装順序（境界を壊さない）

1. schema 型（Evidence, Offering, RoutePlan, …）— **done / 本変更**  
2. RoutePlan 生成スタブ + 現行 1 Offering 透過 Executor  
3. CostEstimate 最小（input/output のみ）  
4. Policy hard filter 最小  
5. OpenAICompatibleAdapter へ `upstream.ts` を引っ越し  
6. fixture 置き場 + 1 本の replay テスト  
7. Source 系はフィード運用開始時  

スクレイピング本体は急がない。**Fetcher/Parser 境界と Evidence だけ先に。**
