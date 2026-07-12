# gekiyasuLLM

[日本語の詳細 README](./README.ja.md) · [Roadmap / いまどこ](./docs/ROADMAP.md) · [docs](./docs/) · [AGENTS.md](./AGENTS.md)

---

## English

**gekiyasuLLM** is a **local OSS LLM proxy** plus a **routing information feed**.

- The local proxy (`gekiyasuLLMProxy`) will expose an OpenAI-compatible API for IDEs and coding agents.
- The central service is intended to **publish signed routing feeds** (pricing, capabilities, campaigns, availability) and **not relay** your LLM requests by default.
- Routing runs on your machine, using **your API keys** and **your policies** (cost, capabilities, trust, allowlists).

**Status:** Phase 1 in progress (see [docs/ROADMAP.md](./docs/ROADMAP.md)). Local pin: after RoutePlan stub, next Executor uses `plan.primary`. Default **`127.0.0.1:16191`**. Not production-ready.

**Disclaimer:** We do **not** guarantee prices, availability, quality, or security. Upstream choice and what you send (including private code) are **your responsibility**. Free tiers and campaigns change without notice. Sponsored / affiliate relationships are machine-readable in feeds (`sponsored`, `affiliate`, `editorial_rank_influence: "none"`) and must not bias default ranking. Corrections keep impact window, cause, and feed version ([docs/CORRECTIONS.md](./docs/CORRECTIONS.md)).

**License:** [Apache-2.0](./LICENSE). Names/logos: [TRADEMARKS.md](./TRADEMARKS.md).

---

## 日本語

**gekiyasuLLM** は **ローカル OSS の LLM プロキシ** と、それを支える **ルーティング情報フィード** のプロジェクトです。

- ローカルプロキシ（`gekiyasuLLMProxy`）が OpenAI 互換 API を提供し、IDE / コーディングエージェントから接続する想定です。
- 中央は **署名付きルーティングフィード**（価格・能力・キャンペーン・可用性など）を配信し、原則として **ユーザーの LLM リクエストは中継しません**。
- ルーティングは利用者の PC 上で、**自分の API キー**と**自分のポリシー**（コスト・能力・信頼度・allowlist 等）に従って行います。

**現状:** 大枠 **Phase 1 進行中**。ローカル **L4→次 L5**（[docs/ROADMAP.md](./docs/ROADMAP.md)）。既定 **`127.0.0.1:16191`**。まだ本番向けではありません。

**注意:** 価格・可用性・品質・セキュリティは **保証しません**。上流の選定と送信内容（非公開コード含む）の責任は **利用者** にあります。無料枠・キャンペーンは予告なく変わります。スポンサー / 紹介はフィード上で機械可読に開示し、既定ランキングを歪めません。訂正は影響期間・原因・フィード版を残します（[docs/CORRECTIONS.md](./docs/CORRECTIONS.md)）。

**ライセンス:** [Apache-2.0](./LICENSE)。名称・ロゴは [TRADEMARKS.md](./TRADEMARKS.md)。

```bash
cd packages/proxy && npm install && npm run dev
# client base URL: http://127.0.0.1:16191/v1
```

詳細は [README.ja.md](./README.ja.md)、[packages/proxy/README.md](./packages/proxy/README.md)、[docs/design/](./docs/design/) を参照してください。
