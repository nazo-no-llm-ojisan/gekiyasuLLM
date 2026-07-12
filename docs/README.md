# docs 一覧

迷ったら上から。

## いまどこ？（必読）

| ファイル | 内容 |
|---|---|
| [ROADMAP.md](./ROADMAP.md) | ロードマップ索引 |
| [ROADMAP_MACRO.md](./ROADMAP_MACRO.md) | **大枠** Phase 0–7 と現在位置 |
| [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) | **ローカル節** L0–L12 と現在位置・次の一手 |

## 開発の型

| ファイル | 内容 |
|---|---|
| [BRAINLESS_TDD.md](./BRAINLESS_TDD.md) | 赤→緑→コミット。ユーザは大枠、詳細はエージェントが docs に残す |
| [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) | 並列は契約済みのみ。作業台帳 T-0xx |
| [USER_STATUS_TEMPLATE.md](./USER_STATUS_TEMPLATE.md) | 短い現状報告テンプレ |

## 実装・品質の正本

| ファイル | 内容 |
|---|---|
| [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) | 設計MVP vs 実装のギャップ（**コード同期の正本**） |
| [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md) | 失敗分類（`credential_unavailable` 等） |
| [HANDOFF.md](./HANDOFF.md) | セッション引き継ぎ（ピン・コミット・次の一手） |
| [CORRECTIONS.md](./CORRECTIONS.md) | 価格等の訂正の残し方 |

## 厚い設計

| 場所 | 内容 |
|---|---|
| [design/README.md](./design/README.md) | 設計 01–05 の索引 |
| design/01 … 05 | 企画・要件・ADR・ライセンス・アダプタ境界 |

## コード・UI

| 場所 | 内容 |
|---|---|
| `packages/proxy` | ローカル Proxy（`:16191`） |
| `packages/schema` | 共有型 |
| `fixtures/` | テスト用スナップショット |
| `dashboard/` | **ほぼ静的** UI（認証なし・上流なし）。`http://127.0.0.1:16191/dashboard/` |
