# gekiyasuLLM

価格・無料キャンペーン・能力・可用性などを踏まえ、利用者のポリシーに従って LLM API エンドポイントを選ぶ **ローカル OSS プロキシ** と、それを支える **ルーティング情報フィード** のプロジェクトです。

> **GitHub 公開前提**のリポジトリです。設計と個人向け MVP 実装を同一リポに置きます。
>
> 短い英日 README: [README.md](./README.md)

## 何をするか（要約）

- ローカルの `gekiyasuLLMProxy` が OpenAI 互換 API を提供し、IDE / エージェントから接続する
- 中央は原則として **ユーザーの LLM リクエストを中継しない**（鍵とプロンプトは利用者環境から上流へ）
- 価格・能力・観測データはフィードとして配信し、ローカルでルーティングする

## 現状（ピン）

| 地図 | 位置 |
|---|---|
| **大枠** | Phase 1 進行中（0 完了）。2 以降はローカル後 → [docs/ROADMAP_MACRO.md](./docs/ROADMAP_MACRO.md) |
| **ローカル** | L4 完了 → 次 L5 / T-023（Executor） → [docs/ROADMAP_LOCAL.md](./docs/ROADMAP_LOCAL.md) |

- 既定ポート **`16191`**（`http://127.0.0.1:16191/v1`）
- いまは上流 1 本透過が中心。自動最安選択はまだ
- 索引: [docs/ROADMAP.md](./docs/ROADMAP.md) · docs 一覧: [docs/README.md](./docs/README.md)

```bash
cd packages/proxy
npm install
npm run dev
# dashboard: http://127.0.0.1:16191/dashboard/
```

[AGENTS.md](./AGENTS.md) · [packages/proxy/README.md](./packages/proxy/README.md) · [USER_STATUS_TEMPLATE](./docs/USER_STATUS_TEMPLATE.md) · [BRAINLESS_TDD](./docs/BRAINLESS_TDD.md)

## 注意（必ず読む）

- 本プロジェクトは価格・可用性・品質・セキュリティを **保証しません**。記載値は時点付きの参考情報です
- 上流プロバイダの選定とデータ送信の責任は **利用者** にあります（特に非公開コード・秘密情報）
- 無料枠・キャンペーンは予告なく変わります。各サービスの利用規約を確認してください
- スポンサー・紹介はフィード上でも機械可読に開示し、既定ランキングを歪めない（`sponsored` / `affiliate` / `editorial_rank_influence`）
- 誤情報の訂正は影響期間・原因・フィード版を残す（[docs/CORRECTIONS.md](./docs/CORRECTIONS.md)）

## ドキュメント

| ファイル | 内容 |
|---|---|
| [AGENTS.md](./AGENTS.md) | コーディングエージェント向け指示 |
| [docs/design/](./docs/design/) | 設計書（日本語） |
| [01-product-mvp-and-business.md](./docs/design/01-product-mvp-and-business.md) | 企画・MVP・事業 |
| [02-architecture-routing-and-security.md](./docs/design/02-architecture-routing-and-security.md) | 要件・アーキ・スキーマ・セキュリティ |
| [03-stack-roadmap-and-adrs.md](./docs/design/03-stack-roadmap-and-adrs.md) | スタック・ロードマップ・ADR |
| [04-licensing-coi-corrections.md](./docs/design/04-licensing-coi-corrections.md) | ライセンス・COI・訂正 |
| [CORRECTIONS.md](./docs/CORRECTIONS.md) | 訂正方針 |
| [TRADEMARKS.md](./TRADEMARKS.md) | 名称・ブランド |

## 原則（要約）

- 中央は原則 **ユーザーの LLM リクエストを中継しない**
- ルーティングは各利用者 PC 上の Proxy が実行
- スポンサー / affiliate と編集評価を分離する
- 秘密情報・API キー・署名秘密鍵はリポジトリに入れない
- Proxy は既定で `127.0.0.1:16191` のみにバインドする

## ライセンス

- コード・スキーマ・ツール: **[Apache-2.0](./LICENSE)**
- 名称・ロゴ: **[TRADEMARKS.md](./TRADEMARKS.md)**（Apache は商標権を原則付与しない）
