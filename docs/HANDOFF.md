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
- **最新同期コミット:** `e2b3d141eeaf58422616bc8394bb6dadfefb4323`
  - `fix(proxy): isolate client credentials and block POST fallback`
  - 直前の疑義コミット `4bbc1fb` は CI failure の未完成状態。follow-up で修正済み。

### 現在のピン
- **大枠 (ROADMAP_MACRO.md):** Phase 2 完了。Phase 3 進行中（fallback 骨格・CostEstimate 済。統計・E2E 未）
- **ローカル (ROADMAP_LOCAL.md):** **L9 完了 → 次 L10（ローカル統計）または L11（実キー E2E）**
- **中継先:** `http://127.0.0.1:16191/v1`
- **静的 UI:** `http://127.0.0.1:16191/dashboard/` (認証なし・sample JSON のみ)

### コード配置
- `packages/proxy` — ローカル Proxy (TypeScript)
- `packages/schema` — 共有型 + parseOfferingJson / feed
- `dashboard/` — 静的ダッシュボード
- `fixtures/` — テスト用
- `.github/workflows/ci.yml` — CI 設定

### テスト実行方法
- リポジトリルート: `npm test`
- `packages/schema` 単体: `npm --prefix packages/schema test`
- `packages/proxy` 単体: `npm --prefix packages/proxy test`
- typecheck / build: `npm --prefix packages/proxy run typecheck` / `build`

### 重要な実装済みガード
- `joinUpstreamUrl`（`/v1/v1` 二重防止）
- `redirect: "manual"`（Location 再検査）
- 非 loopback は `GEKIYASU_PROXY_TOKEN` 必須（または `GEKIYASU_ALLOW_UNAUTHENTICATED_REMOTE=true`）
- hard filter fail-closed
- `maxCostPerRequest` は `estimatedCostPerRequest` のみで判定
- **Executor fallback:** GET/HEAD のみ（5xx/429/timeout 等）。**POST 等は fallback 禁止**
- **Credential isolation (P0):** client `Authorization` は configured `upstreamBaseUrl` の exact origin のみ。別 origin は `providerApiKeys` のみ
- **Header allowlist:** cookie / x-api-key / proxy token 等を upstream に client 入力として転送しない

### 直近完了
- L8 静的フィード、L9 CostEstimate
- P0/P1 セキュリティ修正（`e2b3d14`）— CI green

### 次の本線候補
1. **L10 ローカル統計** — 成功/失敗/目安コストのローカル記録
2. **L11 実キー E2E** — 手動疎通（有料 API は承認必須）
3. redaction / audit / circuit（境界強化の続き）

台帳 `docs/PARALLEL_AGENTS.md` は `T-030`（credential isolation）まで **done**。新規本線は `T-031` 以降または未採番 L10。
