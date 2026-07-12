# 訂正方針（Corrections policy）

公開情報サービスとして、**誤情報を静かに消して終わりにしない**。影響期間・原因・対象フィード版を残す。

## 原則

1. **訂正は追記する。** 過去の誤表示を履歴から不可視にしない（秘密・個人情報の混入を除く）。
2. **機械可読 + 人間可読の両方**に残す（フィードの `corrections[]` と本ファイルまたは `docs/corrections/`）。
3. **影響期間を UTC で明示**する（いつからいつまで誤っていたか）。
4. **原因を具体的に書く**（例: 通貨単位の解釈ミス、ページのキャッシュ、転記ミス）。
5. **該当フィード版を書く**（例: `v1.0.14` / `generated_at` / git tag）。
6. 訂正後も **正確性は保証しない**。参考情報としての扱いを崩さない。

## 記録テンプレート

### 人間向け（本ファイルまたは `docs/corrections/YYYY-MM-DD-slug.md`）

```markdown
## COR-YYYYMMDD-001

- **影響期間:** 2026-07-12 09:00–14:20 UTC
- **要約:** 入力トークン価格を誤表示
- **原因:** provider 公式ページの通貨単位解釈ミス
- **該当フィード版:** v1.0.14
- **影響フィールド:** `models[].pricing.input_per_mtok`
- **影響 provider/model:** `example-gateway` / `example-model`
- **訂正後:** v1.0.15 で修正。旧値は corrections に残す
- **証跡:** (URL)
```

### 機械可読（フィード内）

```json
{
  "id": "COR-20260712-001",
  "impact_start": "2026-07-12T09:00:00Z",
  "impact_end": "2026-07-12T14:20:00Z",
  "feed_versions_affected": ["v1.0.14"],
  "summary": "Misstated input token price",
  "root_cause": "Currency unit misread on provider pricing page",
  "affected_paths": ["models[id=example].pricing.input_per_mtok"],
  "corrected_in_feed_version": "v1.0.15",
  "corrected_at": "2026-07-12T14:25:00Z",
  "evidence_urls": ["https://example.com/pricing"]
}
```

## 何を訂正対象にするか

| 対象 | 訂正記録 |
|---|---|
| 価格・無料枠・CC 要否・context 等の事実フィールド | **必須** |
| 可用性・TTFT 等の観測値の集計バグ | **必須**（再計算の窓を明記） |
| trust スコアなど編集判断の変更 | **推奨**（判断変更と誤記を区別） |
| タイポのみ（意味不変） | 任意（軽微なら CHANGELOG 一行でも可） |

## 禁止

- 誤表示期間を曖昧にしたまま「修正しました」だけ出す
- スポンサー都合で不利な訂正履歴を消す
- 訂正を「バージョンを飛ばして上書き」だけで済ませる（履歴フィールドなし）

## 実装メモ

- フィード `schema_version` と配信 `feed_version`（または `generated_at` + git sha）を分離する
- ローカル Proxy は任意で `corrections` をログまたは `stats` に残せる（ユーザー向け通知は後段）
