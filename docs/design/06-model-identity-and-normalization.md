# 06 — モデル同定・正規化（収集層の契約メモ）

**版:** 0.1-draft  
**日付:** 2026-07-12  

**目的:** 将来のフィード収集・Offering 正規化で使う **同一モデル同定・価格メタの扱い** を、Proxy 実行経路と混同せず固定する。

関連: [05 アダプタ境界](./05-adapters-normalization-routing.md) · [02 アーキ](./02-architecture-routing-and-security.md) · 実装ギャップ [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)

---

## 0. 出典と取り込み方針（重要）

| 項目 | 方針 |
|---|---|
| 知識の源泉 | メンテナ私有の multi-router モデル観測ツール（**非公開**。本 monorepo 外） |
| 公開リポとの関係 | **依存・submodule・raw データの取り込みはしない** |
| コード化 | 必要になったら **TypeScript で in-tree 再実装**（`@gekiyasu/schema` または将来 `collectors`） |
| 本ファイル | **契約・規則のメモ**。図鑑 UI・画像・仕掛かりバグ修正は対象外 |

秘密・生 API レスポンス・私有リポのパスを正本としてコミットしない。

---

## 1. レイヤ境界（gekiyasu 内での置き場）

```text
[ 収集・正規化・同定 ]          ← 本ドキュメントの対象
  Fetcher → RawSnapshot → Parser → NormalizedRecord
  canonical model / anomaly / cache metrics
           │
           ▼ 署名付きフィード等（将来）
[ ローカル Proxy ]              ← 既に本線。混ぜない
  catalog → RoutePlan → executor → upstream
  credential isolation / POST no-fallback / stats
```

| やってよい | やらない |
|---|---|
| オフラインで Offering 候補・価格・free フラグを作る | Proxy ホットパスでルータ API をライブ収集 |
| 同一重み系統のクロスウォーク | 図鑑 UI / Species 画像を monorepo に入れる |
| フィード品質（価格アノマリー）の種 | 私有ツールの raw JSON を fixtures に丸ごと置く |

設計 05 の **Fetcher ≠ Parser** と一致。価格収集アダプタと **UpstreamAdapter（実行）は別系統**。

---

## 2. 識別子レイヤ（論理）

私有ツール側の経験を、gekiyasu の Model / Offering 語彙に対応させる。

```text
Developer     重みの開発元（anthropic, openai, z-ai, …）
  └─ Species / Model   同じ重み系統（family + version + derivative）
       └─ Access variant   free / flex / latest / preview 等（課金・経路の違い）
            └─ Habitat / Offering   ある Endpoint 上の具体提供（ルータ・base_url・価格）
```

| gekiyasu（05） | 同定メモでの意味 |
|---|---|
| **Model** | Developer + family + version + derivative（access を含めない） |
| **Offering** | Model × Endpoint × 課金・キャンペーン（access variant を含みうる） |
| **Provider** | 運営・仲介主体（ホスティング業者を Model キーに載せない） |

ルーターが選ぶ主キーは引き続き **Offering ID**。

---

## 3. 移植候補の規則（実装時の契約）

コードは未移植。**実装するときはこの節がテスト仕様の種**になる。

### 3.1 Model ID パース順序

生 ID 例: `openai/gpt-4o-mini:free`、`fireworks/glm-5.2:flex`

1. **`:` 以降を access variant に先取り**（`:free` / `:flex` / `:discounted` 等）  
   → free 経路を通常版と同一 canonical に潰さない（過去バグの再発防止）
2. `provider/rest` 分離（スラッシュ無しは provider=`unknown`）
3. `@region` サフィックス除去（family から）
4. 日付サフィックス退避 → 後で version 候補
5. **derivative** 抽出（mini / flash / coder / `27b` 等。複合可）
6. colon 無しの access 系末尾（instruct / chat 等）
7. 数値 version 抽出（例外: `o1` / `o3` / `hy3` 等は family の一部として残す）
8. version 未確定なら日付を version に

### 3.2 Developer 解決

1. provider 名の表記ゆれ正規化（エイリアス表）
2. provider が **インフラ/ホスティング**（fireworks, groq, bedrock, …）なら **family から developer を推論**
3. そうでなければ正規化済み provider を developer とする
4. 推論不能は `unknown`（黙って別 Species に分裂させないようログ・品質用）

**ねらい:** 同一重みを複数ホストが載せても Model が分裂しない。

### 3.3 Canonical key（案）

```text
developer|family|version|derivative
```

- access variant は **含めない**（Form / Offering 側）
- provider の `~` プレフィックス（エイリアスマーカー）は除去してから扱う

Offering ID は別体系（例: `openrouter:…:free`）。混同しない。

### 3.4 フラグ（正規化時）

| フラグ | 判定の種（例） |
|---|---|
| `is_free` | 入出力単価 0、`:free`、表示名、ルータ固有 isFree |
| `is_discounted` | `:discounted` / `:flex`、pricing 上の discount |
| `is_latest` / `is_preview` / `is_deprecated` | サフィックス・表示名 |

gekiyasu Offering の `free` やキャンペーン表現に写像する。

### 3.5 価格・キャッシュ指標（収集後分析）

| 指標 | 概要 |
|---|---|
| **PRICE_MISMATCH** | 同一 canonical で prompt 単価が閾値以上（例: max/min ≥ 3） |
| **CACHE 有無分裂** | 同系統で cache_read 対応がルータ間で割れる |
| **effective price @ N** | `(prompt + cache_write + (N-1)*cache_read) / N` |
| **break-even N** | キャッシュが得になる再利用回数の目安 |

用途: フィード品質、[CORRECTIONS.md](../CORRECTIONS.md) の種、CostEstimate の cache 拡張。  
**Proxy の L9 最小見積を置き換えない。** 拡張時の式の参照。

### 3.6 数値クリーニング

- `clean_float` / `clean_int`（`1.1M` / `256K`、空・`—`・null は欠測）
- 0 と欠測を混同しない

---

## 4. スナップショット運用（収集側）

私有ツールで有効だった型:

```text
data/raw/{source}/models_YYYY-MM-DD.json
data/raw/{source}_latest.json     ← 取得失敗時フォールバック
data/normalized/models_*.jsonl
```

gekiyasu に載せるなら **ローカル専用・gitignore**。公開フィードには正規化・署名済み成果のみ。

---

## 5. 実装ロードマップとの関係

| 時期 | やること |
|---|---|
| **今** | 本メモのみ（契約）。Proxy 本線（T-033 等）と並列で触らない |
| **次（任意）** | `packages/schema` に pure 関数 + 単体テスト（パース・developer・cache 式） |
| **フィード本格化** | collectors: Fetcher/Parser、アノマリー → フィード生成。T-024 周辺と合流可 |
| **公開フィード前** | 署名 T-035。収集成果の改ざん耐性 |

台帳: 実装着手時は `T-039`（model-id / developer normalize pure TS）等を立てる。  
**contract_changes:** 公開型を増やすなら `proposed`。

---

## 6. 非目標（明示）

- ポケモン図鑑 UI・種族名・画像パイプライン
- 私有ツールの POSTMORTEM / 仕掛かり UI 修正を本リポのタスクにしない
- Proxy の credential isolation / POST fallback 規則を本メモで再定義しない（正本はコードと 02 / T-030）

---

## 7. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-07-12 | 初版。メンテナ私有観測ツールの経験を契約メモとして固定。コード未移植 |
