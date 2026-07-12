# 04 — ライセンス・利益相反・訂正方針

**版:** 0.4-draft  
**日付:** 2026-07-12  

関連: [01](./01-product-mvp-and-business.md) · [02](./02-architecture-routing-and-security.md) · [03](./03-stack-roadmap-and-adrs.md) · [CORRECTIONS.md](../CORRECTIONS.md) · [TRADEMARKS.md](../../TRADEMARKS.md) · [LICENSE](../../LICENSE)

公開情報サービスとして早期に固定する三点。ChatGPT 等の外部レビュー指摘を取り込み、設計として確定する。

---

## 1. ライセンスとブランドの分離

### 採用

| 対象 | 扱い |
|---|---|
| Proxy / CLI / ツール / CI | **Apache License 2.0** |
| フィードスキーマ、型定義、サンプルフィード構造 | **Apache License 2.0**（同一） |
| 名称・ロゴ・ブランド表示 | **商標ポリシー**（`TRADEMARKS.md`）。Apache は商標権を原則付与しない |
| サイトの宣伝文（将来） | 公開時にラベル。コードライセンスと混同しない |

### なぜ Apache-2.0 か

- 明示的な特許許諾条項があり、プロキシ／互換レイヤ向き
- 企業・個人の両方が扱いやすい
- スキーマとコードを同一ライセンスにすると貢献と再利用が単純

### なぜコードと商標を分けるか

「フォークして検査・改変してよい」ことと、「gekiyasuLLM という名の公式サービスに見せかけてよい」ことは別問題。信用サービスは **検査可能性** を開きつつ、**なりすまし** を抑える。

---

## 2. 利益相反（COI）の機械可読フィールド

サイト表示だけでなく **フィードにも必須** とする。ローカル Proxy の既定ランキングは商業フィールドを読まない（または `editorial_rank_influence != "none"` を除外）。

### Provider 上の必須形

```typescript
type EditorialRankInfluence = "none";
// 将来拡張するなら "display_only" 等を検討するが、
// 既定コスト順ソートへの影響は常に禁止。

interface CommercialRelationship {
  /** 有償のスポンサー枠・掲載料など */
  sponsored: boolean;
  /** 紹介報酬・アフィリエイト契約の有無 */
  affiliate: boolean;
  /**
   * 編集上の既定ランキング（コスト・能力・可用性ソート）への影響。
   * 既定ルーターは "none" 以外を候補から除外するか、別レーンに隔離する。
   */
  editorial_rank_influence: EditorialRankInfluence;
  /** 人間可読の開示文 */
  disclosure?: string;
  disclosure_url?: string;
  as_of?: string; // ISO-8601
}
```

### 例

```json
{
  "sponsored": false,
  "affiliate": true,
  "editorial_rank_influence": "none",
  "disclosure": "Affiliate link may be used on the website.",
  "as_of": "2026-07-12"
}
```

### ルール

| ルール | 内容 |
|---|---|
| R1 | `sponsored` / `affiliate` はブールで必須（不明なら掲載しないか `unknown` を別途検討） |
| R2 | `editorial_rank_influence` の既定値は `"none"` のみを本番許可 |
| R3 | UI のスポンサー枠は **別セクション**。コスト順リストに混ぜない |
| R4 | 開示文はフィードとサイトで矛盾させない |

---

## 3. 訂正方針

詳細手順・テンプレートは [docs/CORRECTIONS.md](../CORRECTIONS.md)。

### 要約

- 誤情報は **消して終わりにしない**
- **影響期間（UTC）・原因・該当フィード版・訂正後版** を残す
- フィードに `corrections[]` を載せ、人間向けログも残す

### フィードへの載せ方（案）

```typescript
interface CorrectionRecord {
  id: string; // e.g. COR-20260712-001
  impact_start: string;
  impact_end: string;
  feed_versions_affected: string[];
  summary: string;
  root_cause: string;
  affected_paths: string[];
  corrected_in_feed_version?: string;
  corrected_at: string;
  evidence_urls?: string[];
}

interface FeedDocument {
  // ...
  feed_version: string; // e.g. v1.0.15
  corrections?: CorrectionRecord[];
}
```

### 例文（人間向け）

```text
2026-07-12 09:00–14:20 UTC の間、入力価格を誤表示。
原因: provider ページの通貨単位解釈ミス。
該当フィード版: v1.0.14
訂正: v1.0.15
```

---

## 4. 設計思想との整合

信頼度の低い第三者エンドポイントを候補に含めうるサービス自身が不透明では成立しない。

- **最初から public** → 履歴と方針を外部が検査できる  
- **中継しない** → 鍵とプロンプトの境界が明確  
- **COI をフィードに載せる** → 表示だけの「誠実そうな UI」に依存しない  
- **訂正履歴** → 「いま正しい」だけでなく「いつまで誤っていたか」が残る  

メッセージは「われわれを信用してください」ではなく、**信用できるか自分で検査してください**。
