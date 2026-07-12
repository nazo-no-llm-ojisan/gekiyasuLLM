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
| T-024 | parser | **M2** Pricing parser one saved HTML fixture | - | fixtures/**, 将来 packages/collectors/** | parser test | 1 test green from offline HTML | forbidden | todo（**M2**） |
| T-025 | ci | npm test runs schema and proxy | T-020 | package.json / 将来 .github | root `npm test` | both packages test | forbidden | **done** |
| T-026 | docs | failure taxonomy table as canonical | - | docs/** | FAILURE_TAXONOMY.md | table canonical | forbidden | **done** |
| T-027 | proxy | multi-candidate hard filter + soft rank | T-022 | packages/proxy/src/route/** | plan.test.ts | 2+ candidates green | forbidden | **done** |
| T-028 | proxy | Executor walks plan.fallbacks on failure | T-023,T-027 | packages/proxy/src/route/**, upstream* | executor fallback test | 1 fail→2nd green | forbidden | **done** |
| T-029 | proxy/schema | Static feed loading (L8) | - | packages/schema/**, packages/proxy/**, fixtures/** | feed loading test | load static JSON feed to catalog | proposed | **done** |
| T-030 | proxy | P0 credential isolation + P1 no POST fallback | T-028 | packages/proxy/src/** | executor + upstream header tests | client key only on configured origin; POST never fallbacks | forbidden | **done** |
| T-031 | proxy | Origin-scope tenant headers + endpoint credential map | T-030 | packages/proxy/src/** | header origin-scope tests | org/project/idempotency only on configured origin; keys by origin/endpoint | forbidden | **done** |
| T-032 | proxy | L10 local request stats JSONL | T-028 | packages/proxy/src/stats/**, server*, config* | store.test.ts | append metadata-only events; no bodies/keys | forbidden | **done** |
| T-033 | proxy | Block IPv6 ULA / link-local / v4-mapped in SSRF filter | T-020 | packages/proxy/src/security* | security.test.ts IPv6 cases | fc00::/7 fe80::/10 ::ffff:10.x rejected | forbidden | **done** |
| T-034 | proxy | **M3** DNS rebinding / resolve-and-pin | T-033 | packages/proxy/src/security*, upstream* | rebind-focused tests | resolved address re-checked vs private ranges; pin before connect | forbidden | todo（**M3** 公開必須） |
| T-035 | proxy/schema | **M3** Feed signature verification (F-SEC-05) | T-029 | packages/schema/**, packages/proxy/** | verify signed feed fixture | unsigned/invalid rejected when required; feed host ≠ auto allowlist | proposed | todo（**M3** 公開必須） |
| T-036 | proxy | **品質レーン** Circuit breaker | T-028 | packages/proxy/src/route/** | circuit open/half-open tests | N fails → skip offering for T seconds | forbidden | **done** |
| T-037 | proxy | **品質レーン** Stats CLI / summary (no bodies) | T-032 | packages/proxy/src/stats/**, index* | summary test | `stats` or local summary without secrets | proposed（CLI サブコマンド追加。後方互換） | todo |
| T-038 | docs/proxy | **品質レーン** IDE one-shot E2E note | T-032 | docs/L11*, ROADMAP* | — | ROADMAP IDE checkbox when user confirms | forbidden | todo |
| T-039 | schema | **M2** model-id + developer normalize pure TS | - | packages/schema/src/** | model-id / developer unit tests | parse `:free` first; infra→family developer; no proxy coupling | proposed | todo（**M2**。設計 06） |
| T-040 | docs | Design 06 model identity contract memo | - | docs/design/06* | — | 06 が索引・05 からリンク | forbidden | **done** |
| T-041 | schema | **品質レーン** thin Lua hook for model identity | T-039 | packages/schema/src/**, docs/design/06* | hook contract test or spike note | TS matcher default; optional Lua removable without data migration | proposed | todo |
| T-042 | ci/release | **品質レーン** single-file binary release spike | T-025 | package.json, packages/proxy/**, .github/**, docs/** | release packaging smoke test | Win/macOS/Linux approach + checksum plan documented | proposed | todo |
| T-043 | docs | **品質レーン** herding / self-reference NFR | - | docs/** | — | herding risk + local-routing mitigation documented | forbidden | todo |
| T-044 | proxy | **M1** request-aware routing + upstreamModelId rewrite | T-030 | packages/proxy/src/** | plan/executor request-model tests | request model/alias selects offerings; body model = upstreamModelId | proposed | todo（**M1 本線**） |
| T-044-prep | proxy | **M1** M1 prerequisites: RequestFacts, PreparedRequest, apiCompat, trust unknown | T-030 | packages/schema/src/route.ts, packages/proxy/src/route/** | request-facts / prepared-request / catalog apiCompat / fail-closed trust tests | see T-044-prep row below | proposed | doing（前提プロポーズ） |
| T-045 | proxy | **M1** reject unsupported apiCompat in catalog | T-044-prep | packages/proxy/src/route/** | catalog apiCompat test | non-openai_chat (MVP) excluded fail-closed | forbidden | todo（**M1**。T-044 と並列可） |
| T-046 | proxy | **M1** allowsPrivateCode fail-closed | T-044-prep | packages/proxy/src/route/** | privateMode unknown trust test | missing trust ≠ allows private; privateMode only explicit true | forbidden | todo（**M1**） |
| T-047 | proxy | **品質レーン** CORS actual responses + origin allowlist | - | packages/proxy/src/server*, executor* | CORS success-path test | success/error/stream same policy; default no open origin reflect | proposed（env/config/API 動作変更。後方互換のみ） | todo |
| T-048 | ci | **M3** test discovery or list-sync + proxy build in CI | T-025 | packages/proxy/package.json, .github/** | CI fails on missing test / runs glob | all `*.test.ts` run; `npm run build` in CI | forbidden | todo（**M3**） |
| T-049 | proxy | **品質レーン** minimize unauthenticated /health | - | packages/proxy/src/server*, config*, security* | health leakage test | no full upstreamBaseUrl without token; reject query/fragment in base URL | proposed（/health response contract 縮小。後方互換なし） | todo |
| T-050 | proxy/fixtures | **M2** vertical slice 2–3 OpenAI-compatible providers | T-044 | packages/proxy/**, fixtures/**, docs/** | vertical slice fixture or manual note | same logical model: price→offering→plan→rewrite for ≥2 providers | proposed | todo（**M2**。要 M1） |
| T-051 | docs/site | **M2** GitHub Pages min catalog from same feed | T-029 | docs/**, 将来 site/**, fixtures/feeds/** | — | static pages from feed JSON + evidence; not signed production feed; no central relay | proposed | todo（**M2**） |

#### マイルストーン対応（正本: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)）

| M | 完了条件（要約） | タスク |
|---|---|---|
| **M1** 正しく振り分ける | fixture 同一論理モデル → 適合最安 Offering → 正しい upstreamModelId | T-044-prep, T-044, T-045, T-046 |

#### T-044-prep（M1 前提プロポーズ・直列で確定）

M1 本線に入る前に **契約だけ** 確定する 1 コミット。実装は本体 T-044 に残し、ここでは 4 つだけ足す:

1. **`RequestFacts`**（`packages/schema/src/route.ts` 新規エクスポート）
   ```ts
   export type RequestFacts = {
     requestedModel?: string;   // client body の model、または X-Gekiyasu-Model 等の正規化後
     streaming?: boolean;
     requiresTools?: boolean;
     requiresVision?: boolean;
   };
   ```
2. **`PreparedRequest`**（`executor.ts` `ExecutePlanInput` 拡張・後方互換）
   ```ts
   export type PreparedRequest = { body?: Buffer; facts: RequestFacts };
   ```
   - `preparedBody` 未指定時は executor が従来通り `readBody()` する（既存テストを壊さない）。
3. **`OfferingTarget.apiCompat`** を `catalog.ts` で保持（`passthrough:default` は `"openai_chat"`、feed の endpoint から `parseFeedJson` 経由で伝搬）。
4. **`trust unknown` fail-closed**: `RouteCandidate.allowsPrivateCode` が `undefined` の場合、`privateMode=true` で除外。`privateMode=false` 時は除外しない（現状動作）。

**境界（厳守）**:
- `plan.ts` は HTTP / body / request ヘッダを一切読まない純粋関数のまま。`RequestFacts → HardConstraints` の変換は **server.ts（または新規 `request-facts.ts`）** で 1 回だけ行う。
- body は **1 回だけ読み、所有権は server → executor へ明示的に渡す**。`PreparedRequest.body` を渡せば executor は再読しない。
- `rewriteModelForOffering(body, target)` は純粋関数として別ファイルに置き、attempt ごとに元 Buffer から書き換える（元 body の破壊的使い回しはしない）。
- モデル同一性は **厳密一致** のみ（`requestedModel == logical modelId` または `aliases`）。`developer|family|version` の高度化は T-039 へ残す。

**done_when**:
- `npm run typecheck` 緑、`npm test` 緑（既存全テスト無変更で通る）
- `RequestFacts` / `PreparedRequest` を使うテストは T-044 本体で書く（ここでは型の追加 + 既存挙動の維持のみ）
| **M2** データ縦貫通 | 公式由来の同一 feed を Pages と Proxy が共有 | T-039, T-024, T-050, T-051 |
| **M3** 安全な自動公開 | 自動更新公開 feed を Proxy が安全に取得・ルーティング | T-035, T-034, T-048 |
| **品質レーン** | 本線を進めない並列 | T-047, T-049, T-037, T-038, T-042, T-036 done, … |

#### バックログ注記

- **いまの本線:** **M1 / T-044**（request-aware）。T-045・T-046 は M1 内で並列可。
- **M2** は M1 後が本筋。T-039/T-024 は schema・fixtures なら M1 と path 非重複で先行可（Proxy 非混入）。
- **M3** は公開フィード開始の必須ゲート。M1 なしでは「安全だが振り分けが嘘」。
- **品質レーン**はマイルストーン番号を持たない。CORS/health/stats/配布など。
- T-031 / T-033 / T-036 **done**。T-040 design/06 **done**。
- Pages（T-051）は M2 の静的カタログ。署名本番は M3。中央中継は禁止のまま。

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
