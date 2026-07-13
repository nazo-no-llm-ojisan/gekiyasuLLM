# 並列エージェント運用（契約済みだけ並列）

**原則:** 設計判断は直列。契約済み実装は並列。  
各エージェントは「独立した赤テスト1本を緑にする閉じた変更」だけを行う。契約を勝手に増やさない。

脳レスTDD（[BRAINLESS_TDD.md](./BRAINLESS_TDD.md)）＋作業所有権＝複数エージェントを互いに賢くさせず働かせる。

---

## 責務と完了権限

### 統括・Docs Sync担当

- Phase / M / T / Issueの依存を決める
- `contract_changes: proposed`をレビューする
- `ROADMAP*.md`、`IMPLEMENTATION_STATUS.md`、本台帳を横断同期する
- 実装成果の証拠を監査し、`done`を宣言する

### 実装担当

- 指定されたTまたはIssueだけを実装する
- `owned_paths`と`done_when`を守る
- 直接必要な局所docsだけを更新する
- tests / typecheck / buildの結果を報告する

実装担当は、横断ROADMAP、IMPLEMENTATION_STATUS、台帳statusを独断で`done`へ変更しない。**コミット済み ≠ done。**

---

## 安全な構造

```text
中央の短い設計・契約（統括が確定）
├─ Agent A: schemaの赤1本 → 緑
├─ Agent B: proxyの赤1本 → 緑
├─ Agent C: fixture/parserの赤1本 → 緑
└─ Agent D: site/CIの独立作業
       ↓
統括: 境界・証拠・全体testを監査 → Docs Sync → done
```

無制限並列は境界が確定した作業だけ。設計を各エージェントに自由に生やさせると、全員が違う世界を完成させる。

---

## 並列化の条件（すべて満たすこと）

1. 触るpackage/pathが重ならない
2. 入出力契約がリポジトリに存在する
3. 各作業が単独でテスト可能
4. 統合順序と`depends_on`が台帳に明示されている
5. 先行`proposed`契約が統括レビュー済み

### 並列してよい例

| 例 | 理由 |
|---|---|
| schema: Offeringをfixtureから読む | 型契約あり |
| proxy: RoutePlanをExecutorが実行 | plan契約あり |
| collector: 保存HTMLから価格抽出 | fixture独立 |
| site: 確定feedから静的成果物を生成 | feed契約あり |
| CI: 各packageのtest/build | 実行境界あり |

### 衝突しやすい例（やらない）

- schema契約、parser、feed、proxy縦貫通、siteを一つのエージェント・一つのコミットへ無断で束ねる
- AがOffering型を設計し、BもOfferingを変更し、Cが独自価格型を作る
- 実装担当が自分の成果を理由にROADMAPを完了更新する
- 複数エージェントを同じworktree・同じbranchへ同時投入する

---

## 先に共有する薄い契約

| 契約 | 正本 |
|---|---|
| canonical types | `packages/schema` |
| public interfaces | schema + proxy exports / CLI env |
| error taxonomy | [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md) |
| fixture format | `fixtures/README.md` |
| model identity | [design/06-model-identity-and-normalization.md](./design/06-model-identity-and-normalization.md) |
| package ownership | 下表 |
| dependency direction | `proxy` → `schema`のみ。schemaは他packageに依存しない |

**契約変更は直列。実装の緑化は並列。**

---

## Package ownership

| Package | owned_paths | 触らない |
|---|---|---|
| schema | `packages/schema/**` | proxy実装、横断ROADMAP |
| proxy | `packages/proxy/**` | schemaの未承認変更 |
| collectors/parser | `packages/collectors/**`, `fixtures/pricing/**` | proxy routing |
| fixtures/feed generation | `fixtures/**`, 明示されたgenerator | 本番network、独自公開契約 |
| site | `docs/catalog/**`, 将来`site/**` | competing feed model |
| docs局所 | 指定されたdocs | 横断status/done宣言 |
| ci | `.github/**`, scriptsの指定範囲 | アプリ契約変更 |

同じpathを2エージェントが同時に持たない。同じpathを触らなくても、並列作業は別worktreeまたは別clone・別branchを使う。

---

## 作業台帳フォーマット

| 列 | 意味 |
|---|---|
| id | `T-0xx`または監査fix Issue |
| area | schema / proxy / parser / docs / ci / site |
| title | 一行 |
| depends_on | 先行id |
| owned_paths | 触ってよいglob |
| expected_red_test | 最初に赤にするtest |
| done_when | 緑の定義 |
| contract_changes | `forbidden` \| `proposed` |
| status | `todo` \| `doing` \| `landed-unverified` \| `done` |

- `landed-unverified` = 実装コミットはあるが、契約・境界・証拠の監査を通っていない
- `proposed`は直列。統括レビュー後に下流を開始
- `forbidden`は`depends_on`を満たせば並列可

---

## 台帳

| id | area | title | depends_on | owned_paths | expected_red_test | done_when | contract_changes | status |
|---|---|---|---|---|---|---|---|---|
| T-020 | proxy | security token + allowlist | - | packages/proxy/** | security.test.ts | npm test green | forbidden | **done** |
| T-021 | schema | Offering parses one fixed-price fixture | - | packages/schema/**, fixtures/** | parse-offering.test.ts | fixed feed parses | forbidden | **done** |
| T-022 | proxy | RoutePlan selects sole eligible offering | - | packages/proxy/src/route/** | plan.test.ts | one candidate selected | forbidden | **done** |
| T-023 | proxy | Executor uses plan.primary | T-022 | packages/proxy/src/route/**, upstream* | executor.test.ts | primary attempt used | forbidden | **done** |
| T-024 | parser | M2 pricing parser one saved HTML fixture | - | packages/schema/src/pricing-parser*, fixtures/pricing/** | pricing-parser.test.ts | saved HTML parses offline | forbidden | **done** (`fd8fb47`, `62244eb`, #13) |
| T-025 | ci | npm test runs schema and proxy | T-020 | package.json, .github/** | root npm test | both packages test | forbidden | **done** |
| T-026 | docs | failure taxonomy canonical | - | docs/** | FAILURE_TAXONOMY.md | table canonical | forbidden | **done** |
| T-027 | proxy | multi-candidate hard filter + soft rank | T-022 | packages/proxy/src/route/** | plan.test.ts | 2+ candidates | forbidden | **done** |
| T-028 | proxy | Executor walks fallbacks | T-023,T-027 | packages/proxy/src/route/**, upstream* | executor fallback test | fail→2nd | forbidden | **done** |
| T-029 | proxy/schema | Static feed loading | - | packages/schema/**, packages/proxy/**, fixtures/** | feed loading test | JSON feed→catalog | proposed | **done** |
| T-030 | proxy | credential isolation + no POST fallback | T-028 | packages/proxy/src/** | executor/upstream tests | credentials scoped | forbidden | **done** |
| T-031 | proxy | tenant headers + endpoint credential map | T-030 | packages/proxy/src/** | header tests | origin scoped | forbidden | **done** |
| T-032 | proxy | local request stats JSONL | T-028 | packages/proxy/src/stats/** | store.test.ts | metadata only | forbidden | **done** |
| T-033 | proxy | IPv6 private SSRF block | T-020 | packages/proxy/src/security* | security IPv6 | private ranges rejected | forbidden | **done** |
| T-034 | proxy | M3 DNS resolve-and-pin | T-033 | packages/proxy/src/security*, upstream* | rebind tests | resolved IP pinned/rechecked | forbidden | todo |
| T-035 | proxy/schema | M3 feed signature verification | T-029 | packages/schema/**, packages/proxy/** | signed feed fixture | invalid/unsigned rejected when required | proposed | todo |
| T-036 | proxy | circuit breaker | T-028 | packages/proxy/src/route/** | circuit tests | closed/open/half-open | forbidden | **done** |
| T-037 | proxy | stats CLI / summary | T-032 | packages/proxy/src/stats/** | summary test | no bodies/secrets | proposed | todo |
| T-038 | docs/proxy | IDE one-shot E2E note | T-032 | specified docs/proxy | manual | user confirms | forbidden | todo |
| T-039 | schema | M2 model-id + developer normalization | - | packages/schema/src/model-id* | model-id tests | approved contract implemented | proposed | **done** (`a4c1b81`, `6e11a83`, #12) |
| T-040 | docs | Design 06 model identity memo | - | docs/design/06* | — | linked contract memo | forbidden | **done** |
| T-041 | schema | optional thin Lua hook | T-039 | packages/schema/src/**, design/06 | hook test/spike | removable hook | proposed | todo |
| T-042 | ci/release | single-file release spike | T-025 | package.json, proxy, .github, docs | packaging smoke | approach+checksums | proposed | todo |
| T-043 | docs | herding / self-reference NFR | - | docs/** | — | risk documented | forbidden | todo |
| T-044-prep | proxy/schema | M1 request contract prerequisites | T-030 | schema route + proxy route | contract tests | RequestFacts/PreparedRequest | proposed | **done** |
| T-044 | proxy | M1 request-aware routing + rewrite | T-044-prep | packages/proxy/src/** | route request tests | actual HTTP path routes/rewrite | proposed | **done** |
| T-045 | proxy | reject unsupported apiCompat | T-044 | packages/proxy/src/route/** | apiCompat test | fail-closed | forbidden | **done** |
| T-046 | proxy | private trust fail-closed | T-044 | packages/proxy/src/route/** | privateMode test | only explicit true allowed | forbidden | **done** |
| T-047 | proxy | CORS allowlist all paths | - | packages/proxy/src/** | CORS tests | same policy all responses | proposed | **done** |
| T-048 | ci | test discovery + proxy build smoke | T-025 | scripts, package files, .github | CI discovery | all tests/build/smoke | forbidden | **done** |
| T-049 | proxy | minimize unauthenticated health | - | packages/proxy/src/** | leakage test | no full upstream URL | proposed | todo |
| T-050 | proxy/fixtures | M2 2-provider vertical slice | T-044,T-039,T-024 | proxy, generated feed fixture | real path integration | generated feed→HTTP/executor attempt | proposed | **done** (`f278593`–`60c7631`, #14) |
| T-051 | site | M2 static catalog from exact same feed | T-029,T-050 | docs/catalog, generator, feed fixture | stale-output test | ProxyとPagesが同一feed content | proposed | **done** (`00c2d7f`, `031b92c`, `01d6521`, #15) |

### M2監査fix（Issueが作業正本）

| id | area | title | depends_on | owned_paths | done_when | contract_changes | status |
|---|---|---|---|---|---|---|---|
| [#12](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) | schema/docs | model-id contract review | T-039 landed | model-id*, design/06 | raw/normalized/access semantics合意・test | **proposed** | **done / closed** |
| [#13](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/13) | parser/feed | saved snapshots→generated feed | T-024 landed | pricing fixtures/parser/generator/feed | provenance付きdeterministic feed | forbidden | **done / closed** |
| [#16](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/16) | proxy | preserve unknown private-code trust | #13 | packages/proxy/** | unknown保持・private mode fail-closed | forbidden | **done / closed** |
| [#14](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/14) | proxy | real HTTP/executor vertical proof | #13,#16 | proxy tests/必要最小実装 | injected attemptでendpoint/body証明 | forbidden | **done / closed** |
| [#15](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/15) | site | exact same feed→static catalog | #13 | docs/catalog + generator/check | stale output検出・same content | forbidden | **done / closed** |

#12、#13、#16、#14、#15は監査完了・closed。M2の公開契約、generated feed、trust consumer、actual HTTP/executor path、same-feed catalogはすべてdone。

---

## マイルストーン対応

| M | 完了条件 | タスク |
|---|---|---|
| M1 | fixture同一論理model→適合最安Offering→正しいupstreamModelIdをactual pathへ | T-044–046 ✅ |
| M2 | 保存source由来のexact same feedをProxyとPagesが利用し、actual HTTP/executor pathとmodel-id公開契約を証明 | T-039/024/050/051 + #12–#16 ✅ |
| M3 | candidate feedを署名・DNS pin・CI gateで安全に取得検証 | T-035/034/048（未完） |

---

## エージェントへの投げ方

```text
タスク: IssueまたはTを一つだけ
契約変更: 台帳どおり
owned_paths: 台帳/Issueどおり
やること: expected red testを赤→緑。done_whenの証拠を作る
やらない: 横展開、未承認contract、depends_on未完了、横断Docs Sync、done宣言
報告: 変更ファイル、test/typecheck/build、未達条件
```

---

## 統合担当

1. `proposed`契約を直列レビュー
2. `depends_on`とowned_pathsを確認
3. 全体tests/typecheck/build
4. fixture→generated artifact→consumerの接続を確認
5. 実装の自己申告ではなくdone_when証拠で判定
6. ROADMAP / IMPLEMENTATION_STATUS / 台帳を同期

---

## 口癖

- 設計判断は直列、契約済み実装は並列
- 1エージェント = 赤1本
- コミット済み ≠ done
- 契約を変えるならproposedを直列で
- Docs Syncと完了判定は統括担当