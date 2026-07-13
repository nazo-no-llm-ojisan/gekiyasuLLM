# 実装状況（設計との同期）

**設計目標、コード着地、監査済み完了を区別する。** チャットや実装担当の自己申告より本ファイルが正。

**ピン:** [ROADMAP.md](./ROADMAP.md) · 台帳: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) · 失敗分類: [FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)

最終更新: 2026-07-13（Issue #13・#16完了、Issue #14 unblock）

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
| M2収集・feed生成 | **部分的に済** — #13で保存fixture→parser→provenance付きgenerated feedを監査完了 |
| M2 model identity | **着地・未監査** — #12で契約レビュー待ち |
| M2 feed trust取込 | **済** — #16でmissing/false/trueを保持しprivate modeをfail-closed化 |
| M2 vertical slice | **着地・未監査** — #14でactual HTTP/executor attempt証明が必要 |
| M2静的catalog | **着地・未監査** — #15でProxyとexact same feedの機械生成 |
| Phase 3+ | 未実装 — schema / ledger / active projection / overlay |
| Phase 4 | 未実装 — review queue / evidence collector / operator UI / daily publication |
| 本番利用 | **不可** — M2未完、M3署名/DNS pin未完、Phase 3+ publication governance未完 |
| CI | Actions、recursive test discovery、proxy build + dist smokeあり（T-048済）。直近main commitのGitHub status/run証拠はなし |

## M2監査結果

最初のコミット `34a01e1` は、parser、手書きfeed、helper-level vertical test、static catalog prototypeを一括で追加した。監査fixは以下。

```text
#12 model-id contract review                         未完
#13 saved snapshots → deterministic generated feed  完了
#16 feed trust unknownをProxyでunknownのまま保持     完了
#14 actual HTTP/executor vertical proof              着手可
#15 exact same feed → static catalog                 着手可
```

### Issue #13 完了証拠

コミット `fd8fb47` と `62244eb` を監査し、次を確認した。

- 保存したOpenAI価格HTMLから価格をparseし、checked feedを決定論的に生成する
- OpenRouter価格は実価格と偽装せずsynthetic fixtureとして明示する
- raw/normalized/provenance/parser metadataを保持する
- zeroとmissingを構造上区別する
- checked artifactの陳腐化をtestで検出する
- scoped evidenceのない実providerには`allowsPrivateCode`を出力しない

直接mainへpushされたためPR-triggered GitHub Actionsの証拠はない。tests/typecheck/build greenは実装担当のローカル報告として記録した。

### Issue #16 完了証拠

コミット `2adcefc` と `03c56da` を監査し、次を確認した。

- feed由来providerのmissing trustは`undefined`のまま保持される
- explicit `false`は`false`、explicit `true`は`true`のまま保持される
- private modeはexplicit `allowsPrivateCode: true`だけを許可する
- local passthrough offeringの明示的trust既定値と、任意feed providerのtrustを分離する
- generated feed contract、schema、POST fallbackを変更していない
- helper/executor spyをactual HTTP/executor proofとは扱わず、#14の責務を残している

GitHub上にCI status/checkは見当たらないため、142 tests / typecheck / build greenは実装担当のローカル報告として扱う。差分とtest codeの監査にはblocking findingなし。

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
| Executor primary/fallback | 済。GET/HEADのみfallback、POST禁止 |
| Circuit breaker | 済（T-036） |
| CostEstimate最小 | 済 |
| 静的feed→catalog | 済（L8）。公開feed securityはM3 |
| local stats | 済（L10） |

## M2構成要素

| ID | 現状 | 次 |
|---|---|---|
| T-039 | model-id実装着地・未監査 | #12で契約レビュー |
| T-024 | 保存HTML parser + generated feed接続を監査済み | #13完了 |
| T-046 trust consumer fix | feed trust三値保持を監査済み | #16完了 |
| T-050 | 2-provider fixture/helper test着地・未監査 | #14でactual path証明 |
| T-051 | static catalog prototype着地・未監査 | #15でsame-feed generator |

## 次（正本Issue/台帳）

| 順 | 作業 | 状態 |
|---|---|---|
| 契約 | [#12 model-id normalization contract](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/12) | todo・直列 |
| 完了 | [#13 saved snapshots→generated feed](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/13) | **done / closed** |
| 完了 | [#16 preserve unknown feed trust](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/16) | **done / closed** |
| 縦貫通 | [#14 actual HTTP/executor vertical proof](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/14) | 着手可・actual path未証明 |
| site | [#15 exact same feed static catalog](https://github.com/nazo-no-llm-ojisan/gekiyasuLLM/issues/15) | 着手可 |

#12は公開契約の独立ゲート。#14と#15は#13/#16完了により作業上のblockを解除する。ただし#14の完了判定では、未確定のmodel-id契約を暗黙に固定していないか#12と照合する。

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
- M2全体は#12/#14/#15が残るため未完
- 本線は M2 audit fixes → Phase 3+ / M3 → Phase 4
- CORS/health/circuit等の品質レーンを本線完了と混同しない