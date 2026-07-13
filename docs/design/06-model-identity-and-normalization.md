# 06 — モデル同定・正規化（収集層の契約メモ）

**版:** 0.2-proposed
**日付:** 2026-07-13

**目的:** 将来のフィード収集・Offering 正規化で使う **同一モデル同定・価格メタの扱い** を、Proxy 実行経路と混同せず固定する。

関連: [05 アダプタ境界](./05-adapters-normalization-routing.md) · [02 アーキ](./02-architecture-routing-and-security.md) · 実装ギャップ [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)

---

## 0. 出典と取り込み方針（重要）

| 項目 | 方針 |
|---|---|
| 知識の源泉 | メンテナ私有の multi-router モデル観測ツール（**非公開**。本 monorepo 外） |
| 公開リポとの関係 | **依存・submodule・raw データの取り込みはしない** |
| コード化 | `packages/schema/src/model-id.ts` の pure TypeScript 実装を正本とする |
| 本ファイル | 公開型・正規化規則・保守条件の局所契約。図鑑 UI・画像・仕掛かりバグ修正は対象外 |

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

`ParsedModelId` の provider 関連fieldは次の意味で固定する。

| field | 契約 |
|---|---|
| `rawProvider` | 最初の `/` より前の入力断片をそのまま保持する。`/`なしは`unknown` |
| `normalizedProvider` | `rawProvider`から先頭`~`、大小文字・空白、既存aliasを正規化した値 |
| `provider` | `rawProvider`と常に同値の互換alias。**deprecated**であり、normalized値として読んではならない |
| `developer` | 重みの開発元。hosting/`unknown`はfamily表から解決し、direct providerは`normalizedProvider`を使う |

`provider`の削除時期やversionは本契約では定めない。新規コードは目的に応じて`rawProvider`または`normalizedProvider`を使用する。

---

## 3. 実装済みの正規化契約

実装は`packages/schema/src/model-id.ts`、公開exportは`packages/schema/src/index.ts`、契約fixtureは`packages/schema/src/model-id.test.ts`に置く。

### 3.1 Model ID パース順序

生 ID 例: `openai/gpt-4o-mini:free`、`fireworks/glm-5.2:flex`

1. **`:` 以降を access variant に先取り**（`:free` / `:flex` / `:discounted` 等）  
   → free 経路を通常版と同一 canonical に潰さない（過去バグの再発防止）
2. 最初の`/`で`rawProvider/rest`を分離（スラッシュ無しは`rawProvider=unknown`）し、`normalizedProvider`を作る
3. `@region` サフィックス除去（family から）
4. 日付サフィックス退避 → 後で version 候補
5. colon 無しのaccess系**単語末尾**（`-instruct` / `-chat`）を先に抽出
6. **derivative** 抽出（mini / flash / coder / `27b` 等。複合可）
7. 数値 version 抽出（例外: `o1` / `o3` / `hy3` 等は family の一部として残す）
8. version 未確定なら日付を version に

colon形式とcolon無し形式は同じ`accessVariant`を生成する。たとえば`foo:instruct`と`foo-instruct`は同じcanonical keyを持つ。access除去でfamilyが空になる、または区切り文字で終わる場合は抽出せず、元の未知familyとしてfail-safeに保持する。モデル名途中の`chat`/`instruct`はaccessとして扱わない。

### 3.2 Developer 解決

1. `rawProvider`から`normalizedProvider`を作る（先頭`~`除去、lowercase/trim、エイリアス表）
2. `normalizedProvider`が **インフラ/ホスティング**（fireworks, groq, bedrock, …）なら **family から developer を解決**
3. そうでなければ`normalizedProvider`をdeveloperとする
4. 推論不能は `unknown`（黙って別 Species に分裂させないようログ・品質用）

**ねらい:** 同一重みを複数ホストが載せても Model が分裂しない。

### 3.3 Canonical key

```text
developer|family|version|derivative
```

- 構成順は正確に`developer|family|version|derivative`
- access variant、raw/normalized provider、regionは**含めない**
- 欠けたversion/derivativeは空文字としてpipe位置を維持する
- accessだけが異なるIDは同じcanonical keyを持ち、`accessVariant`だけが異なる

Offering ID は別体系（例: `openrouter:…:free`）。混同しない。

| raw ID | rawProvider | normalizedProvider | developer | family / version / derivative | accessVariant | canonicalKey |
|---|---|---|---|---|---|---|
| `zhipu/glm-5.2` | `zhipu` | `z-ai` | `z-ai` | `glm-5.2` / `5.2` / - | - | `z-ai|glm-5.2|5.2|` |
| `~openai/gpt-4o` | `~openai` | `openai` | `openai` | `gpt-4o` / `4o` / - | - | `openai|gpt-4o|4o|` |
| `gpt-4o` | `unknown` | `unknown` | `openai` | `gpt-4o` / `4o` / - | - | `openai|gpt-4o|4o|` |
| `fireworks/glm-5.2:flex` | `fireworks` | `fireworks` | `z-ai` | `glm-5.2` / `5.2` / - | `flex` | `z-ai|glm-5.2|5.2|` |
| `meta-llama/llama-3.1-70b-instruct` | `meta-llama` | `meta-llama` | `meta-llama` | `llama-3.1` / `3.1` / `70b` | `instruct` | `meta-llama|llama-3.1|3.1|70b` |

### 3.4 Rule tableの保守契約

provider aliases、hosting provider、family-to-developer、derivative、access suffixは`model-id.ts`内のTypeScript定数・正規表現として維持する。外部設定、provider registry、plugin、動的rule engineは導入しない。

- provider aliasは観測済みの表記ゆれだけを正規化し、modelの実体同一性を主張しない
- hosting provider追加は、その主体が複数developerのmodelを提供し、family解決が必要な場合に限る
- family-to-developer追加は根拠があるfamilyだけとし、名前の類似だけでdeveloperを推測しない
- derivative/access ruleは単語末尾の構文を対象とし、抽出したmetadataを結果から消失させない
- entry/rule追加時はraw入力、provider三字段、developer、family/version/derivative/access、canonical keyを確認するunit fixtureを追加する
- raw表現は証拠保持用、canonical keyはModel identity用であり、相互に代用しない

### 3.5 フラグ（正規化時）

| フラグ | 判定の種（例） |
|---|---|
| `is_free` | 入出力単価 0、`:free`、表示名、ルータ固有 isFree |
| `is_discounted` | `:discounted` / `:flex`、pricing 上の discount |
| `is_latest` / `is_preview` / `is_deprecated` | サフィックス・表示名 |

gekiyasu Offering の `free` やキャンペーン表現に写像する。

### 3.6 価格・キャッシュ指標（収集後分析）

| 指標 | 概要 |
|---|---|
| **PRICE_MISMATCH** | 同一 canonical で prompt 単価が閾値以上（例: max/min ≥ 3） |
| **CACHE 有無分裂** | 同系統で cache_read 対応がルータ間で割れる |
| **effective price @ N** | `(prompt + cache_write + (N-1)*cache_read) / N` |
| **break-even N** | キャッシュが得になる再利用回数の目安 |

用途: フィード品質、[CORRECTIONS.md](../CORRECTIONS.md) の種、CostEstimate の cache 拡張。  
**Proxy の L9 最小見積を置き換えない。** 拡張時の式の参照。

### 3.7 数値クリーニング

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

## 5. 実装と将来拡張の境界

| 時期 | やること |
|---|---|
| **現在** | `packages/schema`のpure TypeScript parserとunit fixtureを局所契約とする |
| **rule更新** | TypeScript定数と対応fixtureを同じ変更で更新する |
| **フィード本格化** | collectors: Fetcher/Parser、アノマリー → フィード生成。T-024 周辺と合流可 |
| **公開フィード前** | 署名 T-035。収集成果の改ざん耐性 |

本契約はProxy hot path、feed generator、Offering IDを変更しない。公開型の変更は統括レビューまで`proposed`として扱う。

### 5.1 Lua hook 評価（任意・薄く）

Issue #12ではLua hook、外部rule data、plugin systemを導入しない。将来それらを評価する場合も、本節の公開fieldとcanonical keyを暗黙に変更してはならない。

---

## 6. 非目標（明示）

- ポケモン図鑑 UI・種族名・画像パイプライン
- 私有ツールの POSTMORTEM / 仕掛かり UI 修正を本リポのタスクにしない
- Proxy の credential isolation / POST fallback 規則を本メモで再定義しない（正本はコードと 02 / T-030）

---

## 7. 変更履歴

| 日付 | 内容 |
|---|---|
| 2026-07-13 | Issue #12 proposed contract。raw/normalized provider、deprecated互換alias、colon-less access保持、canonical key、rule保守条件を実装と同期 |
| 2026-07-12 | 初版。メンテナ私有観測ツールの経験を契約メモとして固定。コード未移植 |
