# 実装状況（設計との同期）

**設計目標、コード着地、監査済み完了を区別する。** チャットや実装担当の自己申告より本ファイルが正。

**ピン:** [ROADMAP.md](./ROADMAP.md) · 台帳: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) · 失敗分類: [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)

最終更新: 2026-07-13（コミット`34a01e1`のM2監査とIssue #12–#15を反映）

## 状態語

| 状態 | 意味 |
|---|---|
| 未実装 | 対象コード・fixtureがない |
| 着地・未監査 | 実装コミットはあるが、契約・境界・done_whenの証拠が不足 |
| 部分 | 一部の境界だけ成立 |
| 済 | 統括監査と全体検証を通過 |

## 総評

| 層 | 状態 |
|---|---|
| 設計docs | ローカル本線M1–M3、Phase 3+ anomaly governance、Phase 4日次reviewを分離済み |
| Proxy | 中継 + 境界 + plan/filter/fallback + 静的feed + CostEstimate + credential isolation + stats + circuit + fail-closed CORS |
| ルーティング | **M1済** — request model→候補→hard filter→最安→`upstreamModelId` rewriteが実HTTP経路で動作 |
| M2収集・正規化 | **着地・未監査** — model-id parserと保存HTML parserあり。契約とfeed接続は#12/#13で修正 |
| M2 vertical slice | **着地・未監査** — helper結合testあり。actual HTTP/executor attempt証明は#14 |
| M2静的catalog | **着地・未監査** — prototypeあり。Proxyとexact same feedの機械生成は#15 |
| Phase 3+ | 未実装 — schema / ledger / active projection / overlay |
| Phase 4 | 未実装 — review queue / evidence collector / operator UI / daily publication |
| 本番利用 | **不可** — M2未完、M3署名/DNS pin未完、Phase 3+ publication governance未完 |
| CI | Actions、recursive test discovery、proxy build + dist smokeあり（T-048済） |

## M2監査結果

コミット `34a01e1` は T-039 / T-024 / T-050 / T-051 のコード候補を一括で追加した。次の理由で各TとM2を`done`にしない。

```text
saved OpenAI HTML → parser test              （feedへ未接続）
hand-authored vertical-slice feed → route helper tests
sample-feed.json → manually copied data.js → static catalog
```

不足:

1. model-idのraw/normalized provider、colon-less access suffix、rule table契約
2. 保存snapshotから価格・provenance付きfeedを決定論的に生成する経路
3. generated feedを使ったactual HTTP/executor/injected attemptの証明
4. ProxyとPagesがexact same feed contentを使うgenerator/check
5. 実providerのprivate-code trustをgeneric policy URLだけで`confirmed`にしない境界

修正順:

```text
#12 model-id contract
  ↓
#13 snapshots → generated feed
  ├─ #14 actual HTTP/executor vertical test
  └─ #15 exact same feed → static catalog
```

## セキュリティ

| 項目 | 実装 |
|---|---|
| F-SEC-01 キー保管 | 部分（env / Bearer / `providerApiKeys`。keychain/暗号化fileは未） |
| F-SEC-02 redaction | 未 |
| F-SEC-03 private path | 未 |
| F-SEC-04 allowlist | 上流host + redirect再検査 + 私有IPv4 + IPv6 ULA/link-local/v4-mapped私有 |
| F-SEC-05 feed署名 | 未（T-035） |
| F-SEC-08 自動実行しない | 済 |
| redirect SSRF | 済 `redirect: "manual"` |
| 非loopback | token必須または明示危険flag |
| body上限 | 済 413 |
| stream backpressure | 済 pipeline + client abort |
| client Authorization送信先 | configured exact originのみ。別originはprovider keyのみ |
| upstream headers | allowlist。authorization/cookie/x-api-key等をclientからコピーしない |
| tenant headers | configured originのみ（T-031） |
| Content-Encoding/Length | undici展開後の不整合を防ぐためstrip済み |
| `/v1/models`形 | OpenAI風listへ正規化済み |
| real-provider private-code trust fixture | **要修正 #13**。根拠不足の`confirmed: true`を完了証拠にしない |

## ルーティング

| 項目 | 実装 |
|---|---|
| RoutePlan filter+rank | 済 |
| request model→Offering候補 | 済（M1/T-044） |
| upstreamModelId body rewrite | 済（M1/T-044、元Buffer不変） |
| tools/vision/stream/private hard filter | 済 |
| apiCompat fail-closed | 済（T-045） |
| allowsPrivateCode fail-closed | 済（T-046） |
| Executor primary/fallback | 済。GET/HEADのみfallback、POST禁止 |
| Circuit breaker | 済（T-036） |
| CostEstimate最小 | 済 |
| 静的feed→catalog | 済（L8）。公開feed securityはM3 |
| local stats | 済（L10） |

## M2構成要素

| ID | 現状 | 次 |
|---|---|---|
| T-039 | model-id実装着地・未監査 | #12で契約レビュー |
| T-024 | OpenAI風HTML parser着地・未監査 | #13でfeed生成へ接続 |
| T-050 | 2-provider fixture/helper test着地・未監査 | #13後、#14でactual path証明 |
| T-051 | static catalog prototype着地・未監査 | #13後、#15でsame-feed generator |

## 次（正本Issue/台帳）

| 順 | 作業 | 状態 |
|---|---|---|
| 1 | [#12 model-id normalization contract](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) | todo・直列 |
| 2 | [#13 saved snapshots→generated feed](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/13) | #12待ち |
| 3a | [#14 actual HTTP/executor vertical proof](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/14) | #13待ち |
| 3b | [#15 exact same feed static catalog](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/15) | #13待ち |

#14と#15だけは#13完了後に並列可。

## その他バックログ

| ID | 内容 | 状態 |
|---|---|---|
| T-034 | DNS resolve-and-pin | todo（M3） |
| T-035 | feed署名検証 | todo（M3） |
| T-037 | stats CLI | todo |
| T-038 | IDE一通docs | todo |
| T-041 | optional Lua hook | #12/T-039確定後 |
| T-042 | single-file release | todo |
| T-043 | herding NFR | todo |
| T-049 | health情報最小化 | todo |

## Docs Sync規則

- 実装担当は局所docsと実行手順を更新してよい
- 横断ROADMAP、IMPLEMENTATION_STATUS、台帳status、Milestone完了は統括・Docs Sync担当だけが更新する
- 実装コミット、test追加、prototype表示だけでは`done`にしない
- `proposed`契約をレビューしてから下流を並列化する

## 監査メモ（2026-07-13）

- 個人loopback MVPとM1は成立
- M2は「部品着地」まで。evidence-backed exact-same-feed verticalは未成立
- 本線は M2 audit fixes → Phase 3+ / M3 → Phase 4
- CORS/health/circuit等の品質レーンを本線完了と混同しない
