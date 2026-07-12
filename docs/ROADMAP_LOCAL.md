# ローカル節ロードマップ（Phase 1–3 と次セクション）

**自分の PC 上で「使える中継＋選び方」まで、その先で「正しく安い方へ送る」まで。**  
大枠全体は [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)。

最終更新: 2026-07-12（次セクション L13〜 起票。出典: 外部監査会話 `.agents/talk.md`）

---

## いまの位置（ローカル）

```text
── Phase 1–3（中継箱 → 選び方 → 統計）────────────────
L0  設計・契約・公開方針          ████ 完了
L1  中継箱 (passthrough)         ████ 完了（127.0.0.1:16191）
L2  境界ガード                   ████ 完了（token / allowlist / timeout / body）
L3  共有型 + fixture 1本         ████ 完了（schema Offering parse）
L4  RoutePlan スタブ + テスト    ████ 完了（sole offering）
L5  Executor が plan.primary     ████ 完了（T-023）
L6  複数候補 + hard filter       ████ 完了（T-027）
L7  fallback 実行                ████ 完了（T-028）
L8  静的フィード読込             ████ 完了（T-029; Phase 2）
L9  CostEstimate 最小            ████ 完了（input/output）
L10 ローカル統計                 ████ 完了（JSONL metadata。本文・キーなし）
L11 実キー E2E「IDE から1通」    ████ 最小 curl 確認済（IDE は利用者側）
L12 静的 dashboard UI            ████ 完了（dashboard/ + /dashboard/）

── 次セクション: request-aware + feed 信頼境界 ──────
L13 request-aware routing        ░░░░ 未（model→候補 + upstreamModelId 書換）
L14 apiCompat fail-closed        ░░░░ 未
L15 private-code trust fail-closed ░░░░ 未
L16 CORS 全経路 + origin allowlist ░░░░ 未
L17 feed 署名検証 (T-035)        ░░░░ 未（公開フィード必須ゲート）
L18 DNS resolve-and-pin (T-034)  ░░░░ 未（公開フィード必須ゲート）
L19 test 検出 / CI build 硬化    ░░░░ 未
L20 health 情報最小化            ░░░░ 未
L21 circuit breaker (T-036)      ████ 完了
L22 縦貫通 2–3 provider          ░░░░ 未（「ただの proxy」脱出）
L23 model-id 正規化 pure TS      ░░░░ 未（T-039。収集層・Proxy 非混入）
L24 GitHub Pages 最小カタログ    ░░░░ 未（同一 feed。大枠 Phase 4 接続）
```

**ピン:** **L12 まで完了。次は L13（request-aware routing）が本線。**  
中継としては使えるが、まだ **「フィード内で最安候補を選ぶ OpenAI 互換中継器」** に近い。製品価値（正しく安い方へ送る）は L13 以降。

公開／自動更新フィード: **L17+L18 なしでは不可。** 本番利用: 不可。

---

## 次セクションのゴール（ユーザー言葉）

| 節 | 完了のイメージ |
|---|---|
| **L13–L16** | 要求した model / 能力に合う offering だけが候補になり、上流には **正しい model ID** で飛ぶ。未対応 API や unknown trust で誤送しない。ブラウザ CORS も壊れない |
| **L17–L18** | 署名済みフィードと DNS pin が揃い、「フィードを信頼境界に載せる」準備ができる |
| **L22** | OpenAI 互換 **2〜3 provider** で、価格→Offering→候補→書換→実疎通が一本通る（ただの proxy から脱出） |
| **L23–L24** | 同一モデルの同定規則がコードに載り始め、同じ feed から GitHub Pages の根拠付き比較が出せる |

### セクション完成条件（監査合意の一文）

> **指定した同一モデルについて、複数 provider の価格を出典付きで比較し、互換性を満たす最安 offering へ正しい upstreamModelId で送れる。**

大量スクレイピングの横展開より、この縦一本を先に閉じる。

---

## L13〜 詳細（何を・なぜ・done_when）

出典: 外部監査（ChatGPT 5.6 Sol / 2026-07-12）および自己認識。会話ログ: `.agents/talk.md`（作業メモ。正本は本ファイルと台帳）。

### L13 — request-aware routing（**本線・機能最優先**）

| 項目 | 内容 |
|---|---|
| **問題** | `server.ts` が body を見る前に `preferFree: true` だけで RoutePlan を作る。client の `model` / stream / tools / vision / private / max cost が使われない。`upstreamModelId` も request body に書換えない → 最安 offering を選んでも **別 provider に元の model 名を送る** 事故 |
| **やること** | body を上限付きで読む → internal request 正規化 → requested model/alias で候補化 → hard filter（tools/vision/stream/context/private/cost）→ 選択後 `model = target.upstreamModelId` → upstream へ |
| **done_when** | フィード複数 offering で「要求 model A → 対応 offering のみ」「upstream に届く model は `upstreamModelId`」の赤緑。不整合の回帰テストあり |
| **台帳** | 新規起票（下記 T-044 案）。`contract_changes` は body 正規化型が要れば `proposed` |

### L14 — unsupported `apiCompat` の拒否

| 項目 | 内容 |
|---|---|
| **問題** | schema は `anthropic_messages` / `gemini` 等を受理するが、catalog は `apiCompat` を保持せず、executor は常に OpenAI path/body |
| **やること** | MVP 中は OpenAI-compatible 以外を catalog から **fail-closed 除外**。未対応は明示エラー |
| **done_when** | 非 openai 系 endpoint の fixture で候補に入らない / または明確な reject |
| **台帳** | T-045 案（L13 と並列可。path が catalog 中心なら L13 と順序調整） |

### L15 — `allowsPrivateCode` fail-closed

| 項目 | 内容 |
|---|---|
| **問題** | `provider?.trust?.allowsPrivateCode?.value ?? true` が unknown を true 扱い（fail-open） |
| **やること** | `=== true` のみ許可。可能なら `allowed` / `denied` / `unknown` の三値。private mode は allowed のみ |
| **done_when** | trust 欠落 provider が privateMode で落ちるテスト緑 |
| **台帳** | T-046 案。小さく赤緑 |

### L16 — CORS 全経路 + origin allowlist

| 項目 | 内容 |
|---|---|
| **問題** | OPTIONS/JSON エラーには CORS があるが、upstream **成功応答**に proxy CORS が付かない。任意 Origin 反射 + credentials。課金後にブラウザだけ読めない状態があり得る |
| **やること** | 成功・失敗・stream 同一ポリシー。既定は CORS 無効 or loopback dashboard のみ。`GEKIYASU_CORS_ORIGINS` 明示 allowlist。Private-Network は無条件にしない |
| **done_when** | actual response の CORS 回帰テスト + 既定で任意 Origin 反射しない |
| **台帳** | T-047 案 |

### L17 — feed 署名検証（**公開フィード必須ゲート** / T-035）

| 項目 | 内容 |
|---|---|
| **問題** | catalog がフィード内 hostname を `allowedUpstreamHosts` に自動追加。未署名 feed = 実質 allowlist 拡張 |
| **やること** | Ed25519 等。unsigned は開発モード以外拒否。publisher / key id / 期限 / rollback。**feed host と user-approved host を分離**（書いただけでは allowlist に足さない） |
| **done_when** | 署名不正・欠落で拒否。手動ローカル file は明示フラグでのみ緩和可 |
| **台帳** | **T-035**（既存）。`contract_changes: proposed` |

### L18 — DNS resolve-and-pin（**公開フィード必須ゲート** / T-034）

| 項目 | 内容 |
|---|---|
| **問題** | IP literal は見るが hostname の解決結果を見ていない → rebinding / 私有 IP 返し |
| **やること** | 接続前 A/AAAA 全件検査 → public policy → 解決 IP に pin。redirect 後も再解決・再検査 |
| **done_when** | allowlist host が `127.0.0.1` / link-local / RFC1918 等を返したら拒否するテスト |
| **台帳** | **T-034**（既存） |

### L19 — test 検出と CI 硬化（監査 P2）

| 項目 | 内容 |
|---|---|
| **問題** | proxy `package.json` が test ファイル明示列挙。新規 `*.test.ts` を忘れると CI スルー。build が CI に無い |
| **やること** | glob または「検出一覧 ≡ package.json 一覧」検査。CI に `npm run build`。Actions の SHA pin は任意強化 |
| **done_when** | 列挙漏れを CI が落とす、または glob で常に全 test 実行 |
| **台帳** | T-048 案 |

### L20 — health 情報最小化

| 項目 | 内容 |
|---|---|
| **問題** | 無認証 `/health` が `upstreamBaseUrl` 全文を返す。query/fragment 付き URL も拒否していない |
| **やること** | 公開は hostname/provider 程度。詳細は token 必須。base URL の query/fragment 拒否 |
| **done_when** | 無認証 health にフル base URL が出ない |
| **台帳** | T-049 案 |

### L21 — circuit breaker（T-036）**done**

| 項目 | 内容 |
|---|---|
| **実装** | `route/circuit.ts` + executor skip/record + `createServer` で共有。config: `GEKIYASU_CIRCUIT_FAILURES`（既定 3）/ `GEKIYASU_CIRCUIT_OPEN_SECONDS`（既定 300） |
| **done_when** | N 失敗で skip、half-open、server 配線、`circuit.test.ts` が test script に含まれる |
| **台帳** | **T-036** **done**（2026-07-12 salvage） |

### L22 — 縦貫通（OpenAI 互換 2〜3 provider）

| 項目 | 内容 |
|---|---|
| **ねらい** | 全社スクレイピング先行を避け、「価格取得 → Offering → feed 検証 → model 要求 → 候補 → upstreamModelId 書換 → 実疎通 → usage 照合」を **少数 provider で閉じる** |
| **前提** | L13 必須。L14–L15 推奨。実キーは手動（有償 API は承認制） |
| **done_when** | fixture または手動手順で 2 provider 以上が同一論理モデル比較〜正しい ID 送信まで再現可能 |
| **台帳** | T-050 案。T-024 parser 実験と合流可 |

### L23 — model-id / developer 正規化 pure TS（T-039）

| 項目 | 内容 |
|---|---|
| **境界** | 収集・正規化層。**Proxy ホットパスに混入しない**（design/06） |
| **done_when** | `:free` 先取り等のユニットテスト緑。canonical key の最小実装 |
| **台帳** | **T-039**（既存）。T-041 Lua は後 |

### L24 — GitHub Pages 最小カタログ

| 項目 | 内容 |
|---|---|
| **ねらい** | 中央の最初の公開面。README ではなく **同じ正規化 feed から** 根拠付き比較を静的生成 |
| **出すもの（最小）** | 価格比較、無料/キャンペーン期限、tools/vision/stream/context、private 根拠、as_of・出典・confidence、COI、訂正、`feed/latest.json`（+ 署名は L17 後） |
| **責務分離** | `/dashboard/` = 自分のルート・統計。Pages = 公開カタログ・フィード配布 |
| **やらない（今）** | 「最安」だけの煽り UI。異常差分の自動公開（レビュー待ち） |
| **台帳** | T-051 案。大枠 Phase 4 と接続。ローカル節の「触らない」を一部緩和（**静的 Pages のみ**。中央中継は引き続き禁止） |

---

## 推奨順（迷ったらこれ）

```text
【本線 — ただの proxy から脱出】
1. L13  request-aware routing（model + upstreamModelId）   ← いま推奨
2. L14  apiCompat fail-closed
3. L15  allowsPrivateCode fail-closed
4. L16  CORS 全経路
5. L22  縦貫通 2–3 provider（L13 後。収集は最小）

【公開フィードを始める決断のあと — 必須ゲート】
6. L17  T-035 署名  （feed host ≠ 自動 allowlist）
7. L18  T-034 DNS pin

【品質・運用・横】
8.  L19 test/CI 硬化 · L20 health 最小化 · L21 circuit（いつでも並列可）
9.  L23 T-039 model-id · T-024 parser
10. L24 GitHub Pages 最小（同一 feed）
11. T-037 stats CLI · T-038 IDE メモ · T-042 配布 · T-043 herding NFR
```

監査の三点要約（十分これだけ見てもよい）:

1. **model と upstreamModelId を結ぶ**（L13）  
2. **未対応 apiCompat を拒否する**（L14）  
3. **公開フィード前に署名と DNS pin**（L17–L18）

---

## 起票済み・起票案バックログ

台帳詳細: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)。  
**新規 ID（T-044〜）は案。** 契約変更が要るものは `proposed` で直列マージしてから並列実装。

| ID | 対応 L | 内容 | 優先 | 状態 |
|---|---|---|---|---|
| **T-044**（案） | L13 | request-aware routing + upstreamModelId 書換 | **本線最優先** | todo |
| **T-045**（案） | L14 | 非 OpenAI-compatible apiCompat を catalog 除外 | P1 | todo |
| **T-046**（案） | L15 | allowsPrivateCode fail-closed / 三値 | P1 | todo |
| **T-047**（案） | L16 | CORS actual response + origin allowlist | P1 | todo |
| **T-035** | L17 | feed 署名検証 | 公開必須ゲート | todo |
| **T-034** | L18 | DNS rebinding / resolve-and-pin | 公開必須ゲート | todo |
| **T-048**（案） | L19 | test 自動検出 or 列挙一致 CI + build | P2 | todo |
| **T-049**（案） | L20 | health 最小化 + base URL query/fragment 拒否 | P2 | todo |
| **T-036** | L21 | circuit breaker | Phase 3 残り | **done** |
| **T-050**（案） | L22 | 2–3 provider 縦貫通 | 製品脱出 | todo |
| **T-039** | L23 | model-id / developer pure TS | 収集層 | todo |
| **T-051**（案） | L24 | GitHub Pages 最小カタログ（同一 feed） | 公開面 | todo |
| **T-031** | — | tenant headers origin-scope | 境界 | **done**（実装ツリー） |
| **T-033** | — | IPv6 SSRF | 境界 | **done** |
| **T-037** | — | stats CLI | 後段 | todo |
| **T-038** | — | IDE 一通 docs | 任意 | todo |
| **T-040** | — | design/06 | 収集契約 | **done** |
| **T-041** | — | Lua hook 評価 | T-039 後 | todo |
| **T-042** | — | 単一実行ファイル | 配布 | todo |
| **T-043** | — | herding NFR | docs | todo |
| **T-024** | L22 合流可 | pricing parser 実験 | 本線外可 | todo |

---

## Phase 1–3 ゴール（振り返り）

| 節 | 完了のイメージ（ユーザー言葉） | 状態 |
|---|---|---|
| **Phase 1 入口** | 接続先を `http://127.0.0.1:16191/v1` にして会話が通る | **達した** |
| **Phase 1 選択** | 「どれに送るか」の計画が出せて、その通りに送る | **部分**（plan はあるが request model 非連動 → L13） |
| **Phase 2** | フィード JSON を差し替えると候補が変わる | **達した**（静的 file） |
| **Phase 3** | 落ちたら次へ。成功・失敗がローカルに残る | **ほぼ**（fallback・stats・circuit 済。request-aware は L13） |

### Phase 1–3 チェックリスト

- [x] Proxy 経由 models + 最小 completion（実キー・curl）  
- [ ] IDE/SDK から一通（利用者。手順 [L11_MANUAL_E2E.md](./L11_MANUAL_E2E.md)）  
- [x] RoutePlan → Executor が primary に従う  
- [x] 失敗時 fallback（GET/HEAD。POST 禁止）  
- [x] 静的フィード差し替え  
- [x] ローカル統計 JSONL  
- [ ] **（次セクション）** request model と offering が一致し upstreamModelId で送る ← L13  

L13 が入るまで「大枠 Phase 1–3 を完全完了して Phase 4 へ」とはみなさない（監査: 中核未接続）。

---

## ステップと台帳の対応（L12 以前）

| ローカル段 | 台帳 | 状態 |
|---|---|---|
| L1–L2 | T-020 | **done** |
| L3 | T-021 | **done** |
| L4 | T-022 | **done** |
| L5 | T-023 | **done** |
| L6 | T-027 | **done** |
| L7 | T-028 | **done** |
| L8–L9 | T-029 | **done** |
| L10 | T-032 | **done** |
| L11 | L11_MANUAL_E2E | curl 最小 **done** |
| L12 | dashboard | **done** |
| credential isolation | T-030 | **done** |
| IPv6 SSRF | T-033 | **done** |
| tenant headers | T-031 | **done** |

---

## 触らない（次セクション中も）

- 中央でユーザープロンプトを中継する
- 保証付きの最安表示・煽りヘッドラインのみのサイト
- 全社スクレイピング量産（L22 の縦貫通より先に横を広げない）
- 月額・Stripe・広告 UI
- 署名なし自動取得フィードを本番相当で読む

**緩和:** L24 の **GitHub Pages 静的カタログ**は「サイト本番」ではなく feed の読み物面として着手可。中央中継は引き続き禁止。

---

## 三本柱（見通し）

監査会話での最終像。ローカル節は主に ②、L22–L24 で ①③ に接続する。

```text
① 収集・正規化パイプライン（出典付き Offering）
② ローカルルーター / proxy（request-aware + 境界）
③ 同じ feed から生成する GitHub Pages 比較サイト
```

```text
公式ページ/API
  → 収集 → 出典付き正規化 → モデル同一性
  → 価格・能力・期限の検証 → 署名フィード
  → ローカルで候補絞り込み
  → model を upstreamModelId に変換
  → 実績をローカル統計へ
```

詳細ギャップ: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)  
並列の投げ方: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)  
設計（同定）: [design/06-model-identity-and-normalization.md](./design/06-model-identity-and-normalization.md)
