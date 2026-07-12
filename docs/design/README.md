# gekiyasuLLM 設計文書

**版:** 0.5-draft  
**日付:** 2026-07-12  

**前提:** 中央は原則としてユーザーの LLM リクエストを中継しない。ルーティング実行は利用者 PC 上のローカル Proxy が担う。

## リポジトリ方針

| 項目 | 内容 |
|---|---|
| 公開 | **最初から GitHub public**（検査可能性が設計の一部） |
| ライセンス | **Apache-2.0**（[LICENSE](../../LICENSE)）。名称は [TRADEMARKS.md](../../TRADEMARKS.md) |
| 訂正 | [CORRECTIONS.md](../CORRECTIONS.md) |
| 性格 | 設計と個人向け MVP 実装を同一リポに混在してよい |
| 当面の実装範囲 | Phase 1〜3（個人 Proxy・静的フィード・ローカル統計） |

### 公開時の表現・免責

- 価格・無料枠・可用性・速度は **保証しない**。`as_of` と情報源を付ける
- 第三者サービスを貶める曖昧語は使わず、検証可能な属性と trust で表す
- 利益相反はフィード上で機械可読（`sponsored` / `affiliate` / `editorial_rank_influence`）
- 誤情報は訂正履歴を残す（消して終わりにしない）
- 秘密鍵・API キー・実プロンプトをリポジトリに置かない

## 分割構成

| ファイル | 内容 |
|---|---|
| [01-product-mvp-and-business.md](./01-product-mvp-and-business.md) | 企画・MVP・事業 |
| [02-architecture-routing-and-security.md](./02-architecture-routing-and-security.md) | 要件・アーキ・ルーティング・スキーマ・セキュリティ |
| [03-stack-roadmap-and-adrs.md](./03-stack-roadmap-and-adrs.md) | スタック・ロードマップ・ADR |
| [04-licensing-coi-corrections.md](./04-licensing-coi-corrections.md) | **ライセンス・COI・訂正（早期固定）** |
| [05-adapters-normalization-routing.md](./05-adapters-normalization-routing.md) | **アダプタ境界・Evidence・Offering・RoutePlan** |

## 仮称

| 名称 | 役割 |
|---|---|
| **gekiyasuLLM.com** | 情報サイト + フィード配信（将来） |
| **gekiyasuLLMProxy** | ローカル OSS Proxy |

## 現状メモ

- Phase 0 設計は揃っている。Proxy 入口あり（`packages/proxy` / ポート 16191）
- ライセンス / COI / 訂正 / 境界型は固定済み
- メッセージは「信用して」ではなく **自分で検査できる**
- ユーザ向け短い報告: [../USER_STATUS_TEMPLATE.md](../USER_STATUS_TEMPLATE.md)
- 脳レスTDD: [../BRAINLESS_TDD.md](../BRAINLESS_TDD.md)
