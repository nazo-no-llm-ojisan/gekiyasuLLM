# 並列エージェント運用（契約済みだけ並列）

**原則:** 設計判断は直列。契約済み実装は並列。  
各エージェントは「独立した赤テスト1本を緑にする閉じた変更」だけやる。  
契約を勝手に増やさない。賢く分岐させない。

脳レスTDD（[BRAINLESS_TDD.md](./BRAINLESS_TDD.md)）＋ **作業所有権** ＝ 複数エージェントを互いに賢くさせず働かせる。

---

## 安全な構造

```text
中央の短い設計・契約（リポジトリ正本）
├─ Agent A: schema  の赤1本 → 緑
├─ Agent B: proxy   の赤1本 → 緑
├─ Agent C: fixture/parser の赤1本 → 緑
└─ Agent D: docs/CI の独立作業
```

無制限並列は **実装のうち境界が確定した作業だけ**。  
設計を各エージェントに自由に生やさせると、型・命名・エラー・設定が枝分かれし、最後に人間がコンパイラになる。

---

## 並列化の条件（すべて満たすこと）

1. 触る **package / path が重ならない**
2. **入出力契約が既にリポジトリにある**（`packages/schema` 等）
3. 各作業が **単独でテスト可能**
4. **統合順序と depends_on** が台帳に明示されている

### 並列してよい例

| 例 | 理由 |
|---|---|
| schema: Offering を fixture から読める | 型契約あり |
| proxy: RoutePlan を Executor が実行 | plan 契約あり |
| collector: 保存 HTML から価格抽出 | fixture 独立 |
| docs: 失敗分類表を正本へ | コード非接触 |
| CI: 各 package の `npm test` | 実行のみ |

### 衝突しやすい例（やらない）

- A が Offering 型を設計、B も Offering を変更、C が独自価格型、D が前提にルーター  
→ 全員が違う世界を完成させる

---

## 先に共有する薄い契約（これ以外を勝手に増やさない）

| 契約 | 正本 |
|---|---|
| canonical types | `packages/schema` |
| public interfaces | schema + proxy の export / CLI env |
| error taxonomy | [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)（型正本: `packages/schema` `ProbeFailureClass`） |
| fixture format | `fixtures/README.md` |
| package ownership | 下表 |
| dependency direction | `proxy` → `schema` のみ。schema は他 package に依存しない |

**契約変更は直列。** 実装の緑化は並列。

---

## Package ownership（触ってよいパス）

| Package | owned_paths | 触らない |
|---|---|---|
| schema | `packages/schema/**` | proxy 実装 |
| proxy | `packages/proxy/**` | schema の破壊的変更（必要なら proposed 直列） |
| fixtures | `fixtures/**` | 本番ロジック |
| docs | `docs/**`, README* | 実行コード（マーカー更新は可） |
| ci | 将来 `.github/**` | アプリロジック |

同じ path を2エージェントが同時に持たない。

---

## 作業台帳フォーマット

各行 = 閉じた1サイクル。

| 列 | 意味 |
|---|---|
| id | `T-0xx` |
| area | schema / proxy / parser / docs / ci |
| title | 英語または日本語の一行 |
| depends_on | 先行タスク id（カンマ）。なければ `-` |
| owned_paths | 触ってよい glob |
| expected_red_test | 最初に赤にするテスト名 or ファイル |
| done_when | 緑の定義（1文） |
| contract_changes | `forbidden` \| `proposed` |
| status | `todo` \| `doing` \| `done` |

- **`contract_changes: proposed` だけ直列**（レビュー→契約マージ→他が並列再開）
- **`forbidden` は並列可**（depends_on を満たせば）

### 台帳（初期・追記していく）

| id | area | title | depends_on | owned_paths | expected_red_test | done_when | contract_changes | status |
|---|---|---|---|---|---|---|---|---|
| T-020 | proxy | security token + allowlist | - | packages/proxy/** | security.test.ts | npm test green | forbidden | **done** |
| T-021 | schema | Offering parses one fixed-price fixture | - | packages/schema/**, fixtures/** | parse-offering.test.ts | 1 test green | forbidden | **done** |
| T-022 | proxy | RoutePlan selects sole eligible offering | - | packages/proxy/src/route/** | plan.test.ts | 1 test green | forbidden | **done** |
| T-023 | proxy | Executor uses plan.primary for upstream | T-022 | packages/proxy/src/route/**, upstream* | executor.test.ts | 1 test green | forbidden | **done** |
| T-024 | parser | Pricing parser reads one saved HTML fixture | - | fixtures/**, 将来 packages/collectors/** | parser test | 1 test green | forbidden | todo |
| T-025 | ci | npm test runs schema and proxy | T-020 | package.json / 将来 .github | root `npm test` | both packages test | forbidden | **done** |
| T-026 | docs | failure taxonomy table as canonical | - | docs/** | FAILURE_TAXONOMY.md | table canonical | forbidden | **done** |
| T-027 | proxy | multi-candidate hard filter + soft rank | T-022 | packages/proxy/src/route/** | plan.test.ts | 2+ candidates green | forbidden | **done** |
| T-028 | proxy | Executor walks plan.fallbacks on failure | T-023,T-027 | packages/proxy/src/route/**, upstream* | executor fallback test | 1 fail→2nd green | forbidden | **done** |
| T-029 | proxy/schema | Static feed loading (L8) | - | packages/schema/**, packages/proxy/**, fixtures/** | feed loading test | load static JSON feed to catalog | proposed | **done** |

契約を触りたくなったら **新 id で `contract_changes: proposed`** を1本だけ立て、マージ後に実装タスクを並列化。

---

## エージェントへの投げ方（コピペ）

```text
タスク: T-0xx
契約変更: forbidden（packages/schema の公開型を変えるな）
owned_paths: （台帳どおり）
やること: expected_red_test を赤→緑だけ。done_when を満たしたらコミット。
やらない: 横展開、他 package、設計の新規概念、depends_on 未完了の前提
報告: USER_STATUS_TEMPLATE の短さ。「通った/通らない」
```

---

## 統合担当（人間 or 1エージェント）

1. `proposed` を先にマージ  
2. 並列ブランチ/作業を owned_paths で確認  
3. 全体 `npm test`（各 package）  
4. 衝突したら **契約側を勝ち** に戻す（勝手な型分岐を捨てる）

---

## 口癖

- 設計判断は直列、契約済み実装は並列  
- 1エージェント = 赤1本  
- 契約を変えるな。変えるなら proposed を直列で  
- 詳細はリポジトリ。ユーザは大枠だけ
