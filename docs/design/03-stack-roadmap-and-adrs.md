# 03 — 技術スタック・サービス・ロードマップ・ADR

**文書**: gekiyasuLLM 設計 第3部  
**版**: 0.3-draft  
**取得・調査基準日**: 2026-07-12  
**更新**: 2026-07-12 — GitHub 公開前提、表現見直し、ADR-012

関連: [01 企画・MVP](./01-product-mvp-and-business.md) · [02 アーキテクチャ](./02-architecture-routing-and-security.md)

---

## 12. 技術スタック比較

### 12.1 ローカル Proxy 言語

| 候補 | 費用 | 開発速度 | 配布 | 性能 | エコシステム | 評価 |
|---|---|---|---|---|---|---|
| **TypeScript/Node** | 無料 | 最速 | node 依存 or bun 梱包 | 十分（個人） | OpenAI SDK 豊富 | **MVP 推奨** |
| **Go** | 無料 | 速い | 単一バイナリ◎ | 優秀 | HTTP 強い | 公開安定版向き |
| **Rust** | 無料 | 遅い | 単一バイナリ◎ | 最優秀級 | 学習コスト高 | 性能特化時 |
| **Python** | 無料 | 速い | 配布が重い | 普通 | LLM ゲートウェイ系と役割が重なりやすい | MVP では非優先（既存エコシステムとの重複を避ける） |

### 12.2 中央 API・収集

| 候補 | 向き |
|---|---|
| **TS/Node** | サイト・Workers・スキーマ共有に最適 |
| **Python** | 収集・解析・ノートブック向き（バッチ） |
| **Go** | 高頻度 probe ワーカー向き |

### 12.3 データストア

| 候補 | 費用感 | 運用 | 向き |
|---|---|---|---|
| **GitHub 静的 JSON** | 公開無料 | 最低 | **Phase 0–5** |
| **SQLite（ローカル）** | 無料 | なし | Proxy 統計 |
| **Cloudflare D1** | Free あり | 低 | Workers 密結合 |
| **Neon Postgres** | Free: 100 CU-h, 0.5GB/project | 低 | 商用 API |
| **Supabase** | Free あり | 中 | Auth 込み将来 |
| **PostgreSQL on VPS** | $5〜 | 中〜高 | 完全制御 |

### 12.4 ホスティング

| 候補 | 無料枠 | ロックイン | 評価 |
|---|---|---|---|
| **GitHub Pages** | 公開リポ向き | 低 | 静的フィード |
| **Cloudflare Pages/Workers** | 100k req/day 等 | 中 | **推奨** |
| Vercel | Hobby あり | 中 | 商用制限確認 |
| Fly.io / Railway / Render | 低額〜 | 中 | 常駐ワーカー |
| GCP Cloud Run | 無料枠あり | 中 | 法人期 |
| VPS | $3–6 | 低 | probe 常駐 |

### 12.5 定期処理

| 候補 | 評価 |
|---|---|
| **GitHub Actions**（public free） | フィード生成に最適 |
| Cloudflare Cron Triggers | Free で 5 cron/account |
| Vercel Cron | Hobby 制限あり |
| 外部 uptime | サイト監視用 |
| 自前 VPS cron | probe 本格化時 |

### 12.6 通知

| 手段 | MVP 後の優先 |
|---|---|
| **RSS/Atom** | 最高（実装容易・ロックイン低） |
| Email（Resend 等） | 購読者向け |
| Discord/Slack/Telegram webhook | コミュニティ |
| Web Push | 中期 |
| LINE | 国内向け後期 |

---

## 13. 推奨技術スタック

| 層 | 推奨 | 理由 |
|---|---|---|
| Proxy MVP | **TypeScript + Node 20+**（Fastify/Hono 等） | 速度・互換・貢献者 |
| Proxy 統計 | **SQLite** | ゼロ運用 |
| 設定 | **TOML/YAML + Zod** | 検証容易 |
| フィード | **JSON + JSON Schema + Ed25519 署名** | 検証可能 |
| 中央静的 | **GitHub repo + Actions + Cloudflare Pages** | ほぼ $0 |
| 収集バッチ | Actions 内 **TS or Python** | 用途で分割可 |
| サイト | **静的 SSG**（Astro/Next static） | 安価 |
| 将来 API | **Cloudflare Workers + D1** または **Neon** | 段階拡張 |
| エラー監視 | Sentry free（中央のみ） | Proxy はローカルログ優先 |
| Analytics | Cloudflare Web Analytics | cookie レス・無料 |
| パッケージマネージャ | pnpm | monorepo 想定 |

**Docker**: 必須にしない。CI と貢献者向けに任意提供。

---

## 14. 外部サービス比較（要約）

| 用途 | 優先候補 | 代替 | 注意（2026-07-12 時点） |
|---|---|---|---|
| ドメイン | **Cloudflare Registrar**（at-cost） | お名前.com 等 | 取得可能性は都度確認 |
| DNS | **Cloudflare DNS** | | |
| 静的サイト | **CF Pages** / GitHub Pages | Vercel | |
| API | **CF Workers** | Cloud Run | Free 100k req/day |
| DB | 初期なし → **D1 / Neon** | Supabase | Neon Free は 0.5GB 等 |
| 認証 | 後期 **Clerk / Auth.js + GitHub** | Supabase Auth | 月額サービス時 |
| メール | **Resend** Free 3k/mo, 100/day | Postmark, SES | ニュースレターは Broadcast 別 |
| 日次 NL | Buttondown / Resend Broadcast / Ghost | | 低コスト優先 |
| RSS | 自前生成 | | 依存ゼロ |
| Web 監視 | 価格ページ change detection は自前+Actions | Visualping 等 | 規約注意 |
| Uptime | **UptimeRobot** free 50 monitors | Better Stack | 商用利用は規約確認 |
| Analytics | **CF Web Analytics** | Umami self-host | |
| Error | **Sentry** Developer free | GlitchTip | |
| 広告 | 後期 Carbon / 自前スポンサー枠 | | 編集分離必須 |
| Affiliate | 各プロバイダ公式 | PartnerStack 等 | 開示必須 |
| 決済 | **Stripe** | | 日本対応要確認 |
| OSS 配布 | **GitHub Releases** | | |
| 自動更新 | **GitHub Releases + checksum** | winget/brew/scoop | |
| コード署名 | 後期: sigstore / OS 署名 | Authenticode, Apple notarize | コスト・手間 |
| 比較データ参考 | Artificial Analysis（有料 API あり） | 手動公式 | **有料 API は使わず**公式優先 |

---

## 15. 推奨サービス構成

### Phase 1–5（サイト・フィード運用まで）

リポジトリ自体は **最初から public**。以下はサイトとフィード配信の構成案。

```text
GitHub 公開リポ（ソース + フィード JSON）
  → Actions（検証、署名、commit/publish）
  → Cloudflare Pages（サイト + /feed/v1/*.json）
  → 利用者がフィードを取得
  → 任意: サイトを UptimeRobot で監視
  → CF Web Analytics
```

**月額**: ドメインのみ（目安 **$10–15/年**）。それ以外 **$0** を目標。数値は概算であり保証しない。

### Phase 6+（情報有料・運用強化）

```text
上記に加え Workers API + D1/Neon + Resend + Stripe + Sentry
```

**月額**: 目安 **$5–30**（Workers Paid $5 + メール/Sentry 超過時）。従量と契約内容で変動。

---

## 18. ロードマップ

| Phase | 成果物 | 依存 | 完了条件 | 主要リスク |
|---|---|---|---|---|
| **0 調査設計** | 本設計書、スキーマ草案、領域整理 | なし | ADR 合意（**達成済み**）。リポは公開前提 | スコープ肥大 |
| **1 個人 Proxy** | OpenAI 互換 serve、設定、基本 route | Phase0 | IDE から 1 成功 | 互換バグ |
| **2 静的フィード** | provider JSON、pull、stale 処理 | Phase1 | フィード差し替えで経路変更 | 価格陳腐化 |
| **3 health + 統計** | probe、circuit、SQLite stats | Phase1–2 | fallback 実証 | probe 規約 |
| **4 中央集計・日次** | サイト、RSS、headline | Phase2–3 | 日次更新 7 日連続 | 運用負荷 |
| **5 OSS 利用性の成熟** | ライセンス確定、CI、貢献ガイド、署名フィード既定化 | Phase1–4 | 外部ユーザーがドキュメント通り install 成功 | サポート負荷 |
| **6 月額（任意）** | 認証、Stripe、有料フィード | Phase5 | 有料 1 件でも運用可能 | 法務・税 |
| **7 広告・法人（任意）** | disclosure UI、法人向け API | Phase6 | 編集方針公開 | 信頼毀損 |

---

## 19. ADR 一覧

### ADR-001: 中央 Proxy ではなくローカル Proxy

- **選択肢**: 中央中継 / ローカル実行 / ハイブリッド
- **採用**: **ローカル Proxy + 中央フィード**
- **理由**: 鍵・プロンプトの信頼境界、個人利用の法務・運用が単純
- **却下**: 中央中継は既存のマネージド API アグリゲータと役割が重なり、本構想の信頼境界上の利点が薄れる

### ADR-002: 中央 DB か静的フィードか

- **採用**: **初期は静的 JSON**、商用で DB
- **理由**: $0 運用、監査可能（Git 履歴）、署名が容易
- **却下**: 初期から Postgres は過剰

### ADR-003: TypeScript / Go / Rust

- **採用 MVP**: **TypeScript**
- **将来**: 配布摩擦が問題なら **Go 再実装 or 部分移植**
- **却下 MVP Rust**: 速度より市場投入と API 互換の反復が優先

### ADR-004: telemetry 初期実装

- **採用**: **MVP では実装しない**（スキーマ予約のみ）
- **理由**: 信頼獲得が先。誤実装のリスクが高い

### ADR-005: Web UI 初期実装

- **採用**: **CLI のみ**
- **理由**: 価値はルーティング。UI は遅延

### ADR-006: OpenAI 互換のみから開始

- **採用**: **はい**
- **理由**: IDE/エージェントの接続面が最大
- **Anthropic ネイティブは直後に**

### ADR-007: rtk 必須か

- **採用**: **optional / 推奨併用**。Proxy 必須依存にしない
- **理由**: レイヤが違う。圧縮品質問題を Proxy 障害にしない

### ADR-008: 署名付きフィードを MVP に含めるか

- **採用**: **個人 MVP は任意、公開フィード（Phase2–5）で必須**
- **理由**: 個人ローカルファイルでは署名の利益が薄い。公開時は必須級

### ADR-009: 広告・affiliate の表現

- **採用**: **独立フィールド + UI 分離 + デフォルトソート非干渉**
- **却下**: 価格データへの暗黙バイアス

### ADR-010: Docker

- **採用**: **任意**。ネイティブバイナリ/Node 実行が主

### ADR-011: リポジトリに設計と MVP 実装を混在させるか

- **選択肢**: 設計専用リポ / 実装専用リポ / 同一リポ混在
- **採用**: **同一リポに設計 + 個人向け MVP 実装を混在**
- **理由**: Phase 0 完了後すぐに個人利用価値を出せる。ドキュメントとコードの乖離を減らせる
- **境界**: 当面の実装は Phase 1〜3。中央中継・商用課金本番・有料契約は承認後。秘密はコミットしない
- **却下**: 設計専用のまま実装を別リポに先送り（速度と一貫性で不利）

### ADR-012: GitHub を最初から public にするか

- **選択肢**: private で育てて後から公開 / 最初から public
- **採用**: **最初から public 前提**
- **理由**: 信頼境界・非中継・編集と広告の分離を最初から外部監査可能な形で示せる。フィード貢献や Issue の入口になる。履歴を後から sanitization するコストを避ける
- **条件**: 秘密を入れない、保証しない免責を README に置く、第三者への曖昧な貶め表現を避ける、ライセンスは早期に確定する
- **却下**: private で構想だけ温める（公開時の書き換えコストと vaporware 感が残る）

---

## 20. 未確定事項

1. 正式名称・ドメイン取得可否（gekiyasuLLM.com）
2. 初期対応プロバイダ集合（公式 API のみか、第三者の低価格 API 仲介も含むか → **候補には含め、trust / private 送信可否で分離**を推奨）
3. 価格収集の自動化度（完全手動 curated か、半自動）
4. 中央 probe の資金源（誰の API 課金か）
5. ライセンス（Proxy: MIT/Apache-2.0 推奨、フィードデータの二次利用条件）— **公開リポなので早期確定が望ましい**
6. 日本の景表法・アフィリエイト表示の具体文言（弁護士レビュー前）
7. `/v1/responses` の需要時期
8. Windows 署名の要否時期
9. monorepo 構成（proxy / feed / site）
10. 「無料残高」の正確な追跡可能性（多くのプロバイダで API 非公開 → `unknown` 設計が必須）

**合理的仮定（計画継続用）**:

- 初期は **人手 curated 価格** + 公式 URL 証跡
- 無料残高は **ユーザー自己申告 or 未知**
- 第三者の低価格 API 仲介は **除外せず**、公開情報に基づく `trust.score` と `allows_private_code` で利用可否を分ける

---

## 21. 次に実装エージェントへ渡す作業単位

**方針**: 本リポジトリで実装してよい。作業単位は上から順が望ましいが、A の最小骨格ができれば B 以降を並行してよい。設計と矛盾したら ADR または本ドキュメントを先に直す。

### 作業単位 A — リポジトリ骨格（実装開始時）

- monorepo（推奨: `packages/proxy`, `packages/schema`）または `proxy/` 単体
- ライセンス、`.editorconfig`（AGENTS.md は既存）
- `packages/schema` に JSON Schema + Zod

### 作業単位 B — プロキシ骨格

- `127.0.0.1` で `serve`
- `/v1/models`、`/v1/chat/completions` の上流 1 本透過（ルーティングなし）
- ストリーム透過テスト

### 作業単位 C — 設定と複数プロバイダ

- API キー解決
- モデルエイリアス
- 失敗時エラーマッピング

### 作業単位 D — ルーター v1

- ハード制約 + コスト昇順ソート
- fallback + timeout + circuit breaker

### 作業単位 E — フィード v1

- ローカル JSON 読込
- サンプル 3–5 モデル
- `feed pull`（未署名）

### 作業単位 F — 統計とポリシー

- SQLite/JSONL 統計
- 秘密情報のリダクション
- private_mode の allowlist

### 作業単位 G — IDE 向けドキュメント

- Cursor / Continue / OpenAI Python SDK の設定例

### 作業単位 H — 署名と配布フィード

- Ed25519 署名検証
- Actions で publish（リポジトリは既に public でも、配布フィードの署名をここで固める）

**各作業単位の完了定義**: 自動テスト + 手動 IDE 1 経路。

---

## 付録: 調査メモ（情報源の扱い）

- 類似プロダクト（LiteLLM / OpenRouter / Portkey 等）への言及は 2025–2026 の公開情報に基づく**市場構造の整理**であり、各製品の評価・価格の保証ではない。
- Cloudflare Workers Free: 100k requests/day 等（公式 docs, 確認日 2026-07-12）。
- GitHub Actions: public リポジトリの standard runner は free との公式説明（2026 価格改定でも public は free 維持の発表）。
- Resend Free: 3,000 emails/mo、100/day 程度（確認日 2026-07-12）。
- rtk: Apache-2.0、CLI 圧縮、telemetry 既定 off（GitHub rtk-ai/rtk, 確認日 2026-07-12）。
- Artificial Analysis 等の第三者ベンチは **参考**。本サービスの正は公式価格ページ + 自前観測。

---

## Phase 0 の位置づけ

- **Phase 0（調査と設計）は完了扱い**（設計書をリポジトリに格納済み）。
- リポジトリは **GitHub 公開前提**。以降は **Phase 1 実装を同一リポジトリで進めてよい**。
- 実装の進捗に応じて README / AGENTS.md / 本設計の「現状」を更新する。
- Phase 4 以降（中央本格運用・月額・広告）は、追加の方針合意を経てから本実装する。
- 公開後も、秘密情報・個人データ・保証めいた断定を増やさない。
