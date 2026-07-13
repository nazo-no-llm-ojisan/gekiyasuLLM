# 実装状況（設計との同期）

**設計目標、コード着地、監査済み完了を区別する。** チャットや実装担当の自己申告より本ファイルが正。

**ピン:** [ROADMAP.md](./ROADMAP.md) · 台帳: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) · 失敗分類: [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)

最終更新: 2026-07-13（Issue #14・#15監査完了・closed。main CI green。M2は#12待ち）

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
| M2収集・feed生成 | **済** — #13で保存fixture→parser→provenance付きgenerated feedを監査完了 |
| M2 model identity | **着地・未監査** — #12で契約レビュー待ち |
| M2 feed trust取込 | **済** — #16でmissing/false/trueを保持しprivate modeをfail-closed化 |
| M2 vertical slice | **済** — #14でactual HTTP→executor attemptを監査完了 |
| M2静的catalog | **済** — #15でProxyとexact same feedの機械生成・stale検出を監査完了 |
| Phase 3+ | 未実装 — schema / ledger / active projection / overlay |
| Phase 4 | 未実装 — review queue / evidence collector / operator UI / daily publication |
| 本番利用 | **不可** — M2の#12未完、M3署名/DNS pin未完、Phase 3+ publication governance未完 |
| CI | **green** — mainのGitHub Actions `ci` が統合後およびDocs Sync後の各pushで成功。recursive test discovery、proxy build + dist smokeを実行 |

## M2監査結果

最初のコミット `34a01e1` は、parser、手書きfeed、helper-level vertical test、static catalog prototypeを一括で追加した。監査fixは以下。

```text
#12 model-id contract review                         未完
#13 saved snapshots → deterministic generated feed  完了
#16 feed trust unknownをProxyでunknownのまま保持     完了
#14 actual HTTP/executor vertical proof              完了
#15 exact same feed → static catalog                 完了
```

### Issue #13 完了証拠

コミット `fd8fb47` と `62244eb` を監査し、次を確認した。

- 保存したOpenAI価格HTMLから価格をparseし、checked feedを決定論的に生成する
- OpenRouter価格は実価格と偽装せずsynthetic fixtureとして明示する
- raw/normalized/provenance/parser metadataを保持する
- zeroとmissingを構造上区別する
- checked artifactの陳腐化をtestで検出する
- scoped evidenceのない実providerには`allowsPrivateCode`を出力しない

当時の直接main pushにはPR-triggered runがなかったため、当該コミット単体のtests/typecheck/build greenは実装担当のローカル報告として記録した。後続の統合mainではGitHub Actions `ci` greenを確認済み。

### Issue #16 完了証拠

コミット `2adcefc` と `03c56da` を監査し、次を確認した。

- feed由来providerのmissing trustは`undefined`のまま保持される
- explicit `false`は`false`、explicit `true`は`true`のまま保持される
- private modeはexplicit `allowsPrivateCode: true`だけを許可する
- local passthrough offeringの明示的trust既定値と、任意feed providerのtrustを分離する
- generated feed contract、schema、POST fallbackを変更していない

142 tests / typecheck / build greenは実装担当のローカル報告として監査し、差分とtest codeにblocking findingなし。後続の統合mainではGitHub Actions `ci` greenを確認済み。

### Issue #14 完了証拠

コミット `f278593`、`6779ae0`、`afd8f59`、`fa1047e`、`60c7631` とmain統合 `e4ac4d0` を監査し、次を確認した。

- localhostへのactual HTTP requestが`readBody`→`extractRequestFacts`→model narrowing→hard filters→`buildRoutePlan`→`executeRoutePlan`→injected `AttemptFn`を通る
- #13のgenerated feedから安いeligible Offeringを選ぶ
- injected attemptでOffering ID、endpoint/base URL、provider credential、書換前後のmodelを観測する
- 元のrequest Bufferを変更しない
- tools/vision/streaming/private trust/unknown model/credential unavailableをactual pathでfail-closed化し、必要ケースでattempt 0回を証明する
- trust専用fixtureは全providerをsyntheticとして明示する
- live provider call、schema/feed/model-id契約変更、POST fallback変更はない

150 proxy tests、typecheck、build greenは実装担当のローカル報告として監査し、blocking findingなし。統合後のmain GitHub Actions `ci` greenを確認済み。

### Issue #15 完了証拠

コミット `00c2d7f`、表示安全化 `031b92c`、改行差対応 `01d6521` とmain統合 `e4ac4d0` を監査し、次を確認した。

- `fixtures/feeds/vertical-slice-2providers.json`をProxy testとPages catalogの同一正本にする
- generatorはfeed全体を直接`FEED_DATA`へ埋め込み、第二のcatalog schemaを作らない
- generated headerと再生成commandを持つ
- checked-in artifactと再生成結果を内容比較し、CRLF/LFだけを正規化する
- feed変更→stale検出→再生成→greenのround tripをtestする
- offlineかつ決定論的である
- synthetic/real、missing/false/true trust、evidence不足を表示時に勝手に補完しない
- static unsigned non-production / no request relay disclaimerを維持する

catalog/schema/proxy testsとbuild greenは実装担当のローカル報告として監査し、blocking findingなし。`01d6521`以降のmain GitHub Actions `ci` greenを確認済み。

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
| generated feedのreal-provider trust | **済 #13** — scoped evidenceがなければ省略・unknown |
| feed trustのProxy取込 | **済 #16** — missingはunknownのまま、private modeはexplicit trueのみ許可 |

## ルーティング

| 項目 | 実装 |
|---|---|
| RoutePlan filter+rank | 済 |
| request model→Offering候補 | 済（M1/T-044） |
| upstreamModelId body rewrite | 済（M1/T-044、元Buffer不変） |
| tools/vision/stream hard filter | 済 |
| private hard filter | 済（T-046/#16）。feed取込でもunknownをtrustedへ変換しない |
| apiCompat fail-closed | 済（T-045） |
| actual HTTP→executor vertical proof | **済（T-050/#14）** |
| Executor primary/fallback | 済。GET/HEADのみfallback、POST禁止 |
| Circuit breaker | 済（T-036） |
| CostEstimate最小 | 済 |
| 静的feed→catalog | **済（T-051/#15）**。同一feedから機械生成・stale検出 |
| local stats | 済（L10） |

## M2構成要素

| ID | 現状 | 次 |
|---|---|---|
| T-039 | model-id実装着地・未監査 | #12で契約レビュー |
| T-024 | 保存HTML parser + generated feed接続を監査済み | #13完了 |
| T-046 trust consumer fix | feed trust三値保持を監査済み | #16完了 |
| T-050 | actual HTTP/executor vertical proofを監査済み | #14完了 |
| T-051 | exact same feed static catalogを監査済み | #15完了 |

## 次（正本Issue/台帳）

| 順 | 作業 | 状態 |
|---|---|---|
| 契約 | [#12 model-id normalization contract](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) | todo・直列 |
| 完了 | [#13 saved snapshots→generated feed](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/13) | **done / closed** |
| 完了 | [#16 preserve unknown feed trust](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/16) | **done / closed** |
| 完了 | [#14 actual HTTP/executor vertical proof](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/14) | **done / closed** |
| 完了 | [#15 exact same feed static catalog](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/15) | **done / closed** |

#12は公開model-id契約の独立ゲートとして残る。#14のテストは現在のgenerated feed契約を消費しており、#12を暗黙に再定義していない。M2全体の`done`判定は#12完了後に行う。

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
- #13のevidence-backed feed generationは成立
- #16のfeed trust unknown保持とprivate-mode fail-closedは成立
- #14のactual HTTP/executor縦貫通は成立
- #15のsame-feed static catalogとstale検出は成立
- 統合後およびDocs Sync後のmain GitHub Actions `ci` はgreen
- M2全体は#12だけが残るため未完
- 本線は #12 contract review → M2判定 → Phase 3+ / M3 → Phase 4
- CORS/health/circuit等の品質レーンを本線完了と混同しない
