# gekiyasuLLM

[日本語の詳細 README](./README.ja.md) · [Design docs (JA)](./docs/design/) · [AGENTS.md (JA)](./AGENTS.md)

---

## English

**gekiyasuLLM** is a **local OSS LLM proxy** plus a **routing information feed**.

- The local proxy (`gekiyasuLLMProxy`) will expose an OpenAI-compatible API for IDEs and coding agents.
- The central service is intended to **publish signed routing feeds** (pricing, capabilities, campaigns, availability) and **not relay** your LLM requests by default.
- Routing runs on your machine, using **your API keys** and **your policies** (cost, capabilities, trust, allowlists).

**Status:** design docs first; MVP implementation is welcome in this repo (Phases 1–3: local proxy, static feed, local stats). Not production-ready yet.

**Disclaimer:** We do **not** guarantee prices, availability, quality, or security. Upstream choice and what you send (including private code) are **your responsibility**. Free tiers and campaigns change without notice. Sponsored / affiliate content must be disclosed and must not bias default ranking.

**License:** TBD (MIT or Apache-2.0 candidates).

---

## 日本語

**gekiyasuLLM** は **ローカル OSS の LLM プロキシ** と、それを支える **ルーティング情報フィード** のプロジェクトです。

- ローカルプロキシ（`gekiyasuLLMProxy`）が OpenAI 互換 API を提供し、IDE / コーディングエージェントから接続する想定です。
- 中央は **署名付きルーティングフィード**（価格・能力・キャンペーン・可用性など）を配信し、原則として **ユーザーの LLM リクエストは中継しません**。
- ルーティングは利用者の PC 上で、**自分の API キー**と**自分のポリシー**（コスト・能力・信頼度・allowlist 等）に従って行います。

**現状:** 設計ドキュメントが中心。このリポジトリで MVP 実装を進めてよい（Phase 1〜3: ローカル Proxy、静的フィード、ローカル統計）。まだ本番利用向けではありません。

**注意:** 価格・可用性・品質・セキュリティは **保証しません**。上流の選定と送信内容（非公開コード含む）の責任は **利用者** にあります。無料枠・キャンペーンは予告なく変わります。スポンサー / 紹介は明示し、既定ランキングを歪めません。

**ライセンス:** 未確定（MIT または Apache-2.0 を候補）。

詳細は [README.ja.md](./README.ja.md) と [docs/design/](./docs/design/) を参照してください。
