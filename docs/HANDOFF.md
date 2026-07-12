# gekiyasuLLM セッション引き継ぎ規約 & コンテキスト

## 1. HANDOFF 規約 (Handoff Rules)

セッション引き継ぎ（Handoff）を行う際、以下のルールを遵守します。

1. **ドキュメントの作成と更新**
   - セッションの終了時、または新しいエージェントへ作業を引き継ぐ際は、必ず `docs/HANDOFF.md` を作成または更新する。
   - リポジトリの最新のピン状態（`docs/ROADMAP.md`、`docs/ROADMAP_LOCAL.md`、`docs/IMPLEMENTATION_STATUS.md`）と整合した情報を記述する。
2. **情報の最小化とセキュリティ**
   - 秘密鍵、個人 API キー、本番環境の認証情報などは絶対に `docs/HANDOFF.md` を含むリポジトリ内に記述・コミットしない。
   - マシン固有の運用メモ（pm2 resurrect 担当、OpenWebUI ポート等）は **gitignore の `docs/LOCAL_NOTES.md`** に書く（テンプレ: `docs/LOCAL_NOTES.example.md`）。秘密の値は `.env` のみ。
3. **作業の明確化**
   - 現在のコミットハッシュ、完了したタスク、未完了のタスク、および次に着手すべき本線候補（T-0xx 含む）を明記する。
   - ユーザーとの合意事項や保留中の設計決定があれば記録する。

---

## 2. 現在の引き継ぎコンテキスト (2026-07-12)

### リポジトリ & 環境
- **パス:** `C:\dev\project\gekiyasuLLM`
- **Remote:** `https://github.com/nazo-no-llm-ojisan/gekiyasuLLM.git`
- **ブランチ:** `main` (公開前提)
- **最新同期コミット:** L10 実装後に更新
  - P0/P1 正本: `e2b3d14` · L11 curl: `d6326a9` 記録

### 現在のピン
- **大枠 (ROADMAP_MACRO.md):** Phase 2 完了。Phase 3 進行中（fallback・L9・L10・L11 curl 済。circuit 未）
- **ローカル (ROADMAP_LOCAL.md):** **L10 完了**
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

### ローカル proxy 運用（2026-07-12 以降）
- **常用起動:** リポジトリルート `ecosystem.config.cjs` + **pm2**（headless / `dist/index.js`）
- **アプリ名:** `gekiyasu-proxy` · bind `127.0.0.1:16191`
- コード変更後: `npm --prefix packages/proxy run build` → `pm2 restart gekiyasu-proxy`
- **resurrect / ログイン後復旧:** ローカル運用者（詳細は `docs/LOCAL_NOTES.md`）
- 公開手順: `packages/proxy/README.md`（pm2 節）

### L11 手動確認（2026-07-12）
- **方式:** `packages/proxy/.env`（gitignore）を process env に注入 → 起動 → curl  
- **キー・token・Authorization 実値はログ/git に出していない**  
- **結果:**
  - `GET /health` → **200**（`proxyTokenRequired: true`）
  - `GET /v1/models` without token → **401**（proxy token 必須の確認）
  - `GET /v1/models` + proxy 認証 → **200**
  - `POST /v1/chat/completions` 最小 1 回 → **200**
- **起動先:** `http://127.0.0.1:16191`（loopback）  
- **IDE / OpenWebUI:** 他 IDE・OpenWebUI 疎通確認済（マシン詳細は `docs/LOCAL_NOTES.md`）

### L10 ローカル統計（実装済）
- JSONL append: 既定 `{cwd}/data/stats.jsonl`（gitignore）
- 記録: ts, method, path（query 除去）, offeringId, attempts, status, latencyMs, ok, errorCode?
- **非記録:** プロンプト、応答本文、API キー、Authorization
- 無効化: `GEKIYASU_STATS_FILE=off`
- コード: `packages/proxy/src/stats/store.ts` + server 配線

### 起票済みバックログ（2026-07-12 監査反映）

| 優先 | ID | 内容 |
|---|---|---|
| **推奨次** | **T-031** / **T-036** | tenant headers · circuit breaker |
| 境界 | ~~T-033~~ **done** | IPv6 ULA / link-local / v4-mapped SSRF |
| 公開前ゲート | T-034 → T-035 | DNS pin → feed 署名 |
| 後段 | T-037 / T-038 | stats CLI / IDE docs |
| 収集層 | **T-040 done** / **T-039 todo** | [design/06](./design/06-model-identity-and-normalization.md) 契約メモ。Proxy と分離 |

詳細: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) · [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)

台帳: T-032 (L10) **done** · T-033 **done** · T-031/T-036 等 todo · T-040 **done**。
