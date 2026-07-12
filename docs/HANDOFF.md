# gekiyasuLLM セッション引き継ぎ規約 & コンテキスト

## 1. HANDOFF 規約 (Handoff Rules)

セッション引き継ぎ（Handoff）を行う際、以下のルールを遵守します。

1. **ドキュメントの作成と更新**
   - セッションの終了時、または新しいエージェントへ作業を引き継ぐ際は、必ず `docs/HANDOFF.md` を作成または更新する。
   - リポジトリの最新のピン状態（`docs/ROADMAP.md`、`docs/ROADMAP_LOCAL.md`、`docs/IMPLEMENTATION_STATUS.md`）と整合した情報を記述する。
2. **情報の最小化とセキュリティ**
   - 秘密鍵、個人 API キー、本番環境の認証情報などは絶対に `docs/HANDOFF.md` を含むリポジトリ内に記述・コミットしない。
3. **作業の明確化**
   - 現在のコミットハッシュ、完了したタスク、未完了のタスク、および次に着手すべき本線候補（T-0xx 含む）を明記する。
   - ユーザーとの合意事項や保留中の設計決定があれば記録する。

---

## 2. 現在の引き継ぎコンテキスト (2026-07-12)

### リポジトリ & 環境
- **パス:** `C:\dev\project\gekiyasuLLM`
- **Remote:** `https://github.com/nazo-no-llm-ojisan/gekiyasuLLM.git`
- **ブランチ:** `main` (公開前提)
- **最新同期コミット:** `d26fcca437e1658587727b6337dd3d72d7934d01`

### 現在のピン (ROADMAP.md より)
- **大枠 (ROADMAP_MACRO.md):** Phase 1 進行中（Phase 0 完了。Phase 2 以降はローカル完了後）
- **ローカル (ROADMAP_LOCAL.md):** L7 (fallback 実行) 完了 → 次 L9 (CostEstimate) または L8 (フィード) / L11 (実キー E2E)
- **中継先:** `http://127.0.0.1:16191/v1`
- **静的 UI:** `http://127.0.0.1:16191/dashboard/` (認証なし・sample JSON のみ)

### コード配置
- `packages/proxy` — ローカル Proxy (TypeScript)
- `packages/schema` — 共有型 + parseOfferingJson
- `dashboard/` — 静的ダッシュボード
- `fixtures/` — テスト用
- `.github/workflows/ci.yml` — CI 設定

### テスト実行方法
- リポジトリルート: `npm test`
- `packages/schema` 単体: `cd packages/schema && npm test`
- `packages/proxy` 単体: `cd packages/proxy && npm test`

### 重要な実装済みガード
- `joinUpstreamUrl`（`/v1/v1` 二重防止）
- `redirect: "manual"`（Location 再検査）
- 非 loopback は `GEKIYASU_PROXY_TOKEN` 必須（または `GEKIYASU_ALLOW_UNAUTHENTICATED_REMOTE=true`）
- hard filter fail-closed
- `maxCostPerRequest` は `estimatedCostPerRequest` のみで判定
- Executor: primary → fallbacks（5xx/429/timeout 等でフォールバック）

### 次の本線候補
1. **L9 CostEstimate 最小 (T-029)**
   - input/output トークン数に基づく最小限の見積もりロジックの実装。
2. **L8 静的フィード読込 (T-030)**
   - 複数 catalog を実現するための本命。静的な価格一覧フィードの読み込み。
3. **L11 実キー E2E (T-031)**
   - ローカル Proxy を経由した実際の API キーによる手動 E2E 疎通確認。

台帳 `docs/PARALLEL_AGENTS.md` の直近タスクは `T-028` まで完了しており、新規のタスクは `T-029` 以降となります。
