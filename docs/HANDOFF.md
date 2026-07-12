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
- **ローカル (ROADMAP_LOCAL.md):** **L9 完了 → 次 L11（実キー手動 E2E・推奨）→ その後 L10（統計）**
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
- P0/P1 セキュリティ修正（**正本 `e2b3d14`**、docs `d4880d8`）— 外部再監査でも合格。`4bbc1fb` の問題は実質解消
- 検証: unit（`upstream.test.ts` allowlist）+ executor の local HTTP server 実受信 header 検査あり。redirect またぎ `fetchUpstream` は未カバー

### 次の本線候補
1. **L11 実キー E2E（推奨）** — [L11_MANUAL_E2E.md](./L11_MANUAL_E2E.md)  
   - 利用者が **自分のキー** で health → models → 短い chat を一通  
   - routing / credential isolation / POST passthrough の実確認  
   - **エージェント・CI は有償 API を叩かない**（明示承認なしは禁止）  
   - 成功後: ROADMAP_LOCAL の L11 チェック + 本 HANDOFF に日付のみ（キー・本文なし）
2. **L10 ローカル統計** — L11 後推奨。L11 で見えた offering / attempts / status / latency / estimate を記録対象のたたき台にする

### 将来（本線外・P0 ではない）
- tenant/correlation headers（`openai-organization` / `openai-project` / `idempotency-key`）を configured upstream origin のみに限定
- `providerApiKeys` → endpoint/origin 単位 credential mapping（上と同一タスク束がよい）
- 詳細: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)「将来タスク」
- redirect またぎ `fetchUpstream` integration coverage

台帳 `docs/PARALLEL_AGENTS.md` は `T-030` まで **done**、`T-031` は本線外 todo。本線は L11 手動 → L10。
