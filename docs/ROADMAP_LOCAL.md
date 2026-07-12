# ローカル節ロードマップ（Phase 1–3）

**自分の PC 上で「使える中継＋選び方」まで。**  
大枠全体は [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)。

最終更新: 2026-07-12

---

## いまの位置（ローカル）

```text
L0  設計・契約・公開方針          ████ 完了
L1  中継箱 (passthrough)         ████ 完了（127.0.0.1:16191）
L2  境界ガード                   ████ 完了（token / allowlist / timeout / body）
L3  共有型 + fixture 1本         ████ 完了（schema Offering parse）
L4  RoutePlan スタブ + テスト    ████ 完了（sole offering）
L5  Executor が plan.primary     ████ 完了（T-023）
L6  複数候補 + hard filter       ████ 完了（T-027）
L7  fallback 実行                ████ 完了（T-028; circuit は未）
L8  静的フィード読込             ████ 完了（T-029; Phase 2）
L9  CostEstimate 最小            ████ 完了（T-029; input/output）
L10 ローカル統計                 ████ 完了（JSONL metadata。本文・キーなし）
L11 実キー E2E「IDE から1通」    ████ 最小 curl 確認済（2026-07-12・IDE 接続は利用者側）
L12 静的 dashboard UI            ████ 完了（dashboard/ + /dashboard/）
```

**ピン:** **L10 完了。** 次の起票済みバックログは下表（推奨: **T-033 IPv6 SSRF**）。

---

## 起票済みバックログ（L12 以降・監査残）

外部監査（2026-07-12）と自己認識の一致分。台帳詳細は [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)。

| ID | 内容 | 優先・ゲート | 状態 |
|---|---|---|---|
| **T-033** | IPv6 ULA / link-local / v4-mapped を SSRF でブロック | **推奨次**（小さく赤緑可） | todo |
| **T-031** | tenant headers origin-scope + endpoint credential map | 境界強化・P0 ではない。T-033 と並列可 | todo |
| **T-036** | circuit breaker | Phase 3 残り | todo |
| **T-034** | DNS rebinding / resolve-and-pin | **公開フィード前** | todo |
| **T-035** | フィード署名検証 (F-SEC-05) | **公開署名フィード必須ゲート** | todo |
| **T-037** | stats CLI / 集計（本文なし） | 後段 | todo |
| **T-038** | IDE 一通（利用者が確認したら docs 更新） | 任意 | todo |
| **T-040** | design/06 モデル同定・正規化契約 | 収集層の境界固定 | **done** |
| **T-039** | model-id / developer pure TS（schema） | 収集層の次の赤緑。Proxy と分離 | todo |
| T-024 | pricing parser 実験 | 本線外・並列可（06/T-039 と合流可） | todo |

```text
推奨順（迷ったら）:
  T-033 IPv6 SSRF
  → T-031 tenant header origin-scope（任意並列）
  → T-036 circuit
  → （公開フィードを始める決断）→ T-034 DNS pin → T-035 署名
  → T-037 stats CLI / T-038 IDE メモ
  収集層（Proxy と別）: T-040 done → T-039 pure TS
```

---

## ローカル節のゴール

| 節 | 完了のイメージ（ユーザー言葉） |
|---|---|
| **Phase 1 入口** | ツールの接続先を `http://127.0.0.1:16191/v1` にして会話が通る |
| **Phase 1 選択** | 「どれに送るか」の計画が出せて、その通りに送る |
| **Phase 2** | フィード JSON を差し替えると候補が変わる |
| **Phase 3** | 落ちたら次へ。自分の成功・失敗・目安コストがローカルに残る |

---

## ステップと台帳の対応

| ローカル段 | 台帳 (PARALLEL_AGENTS) | 状態 |
|---|---|---|
| L1–L2 中継・境界 | T-020 | **done** |
| L3 Offering fixture | T-021 | **done** |
| L4 RoutePlan sole | T-022 | **done** |
| L5 Executor primary | T-023 | **done** |
| L6 hard filter + rank | T-027 | **done** |
| L7 fallback 実行 | T-028 | **done** |
| （parser 実験） | T-024 | todo（並列可・本線外でも可） |
| ルート test + GHA | T-025 | **done**（CI glob 修正済） |
| 失敗分類 docs | T-026 | **done** |
| L8 フィード | T-029 | **done** (Phase 2) |
| L9 コスト見積もり | T-029 | **done** |
| L11 実キー E2E | 手順 [L11_MANUAL_E2E.md](./L11_MANUAL_E2E.md) | **curl 最小合格**（2026-07-12）。IDE は利用者設定。キーは `packages/proxy/.env`（gitignore） |
| L10 ローカル統計 | T-032 | **done**（JSONL `data/stats.jsonl`） |
| credential isolation + POST no-fallback | T-030 | **done**（正本 `e2b3d14`） |
| origin-scope tenant headers + key map | T-031 | todo（起票済） |
| IPv6 SSRF 拡張 | T-033 | todo（起票済・推奨次） |
| DNS rebinding | T-034 | todo（公開フィード前） |
| feed 署名 | T-035 | todo（公開フィード必須ゲート） |
| circuit breaker | T-036 | todo（Phase 3） |
| stats CLI | T-037 | todo |
| IDE 一通 docs | T-038 | todo（利用者任意） |

---

## 推奨順（迷ったらこれ）

```text
1. ~~L7 fallback 実行~~ done（GET/HEAD。POST 等は fallback 禁止 = P1）
2. ~~L8 静的フィード~~ done
3. ~~L9 CostEstimate（input/output だけ）~~ done
4. ~~L11 実キー E2E（curl 最小）~~ done
5. ~~L10 ローカル統計~~ done（JSONL。CLI/SQLite は後段可）
6. T-033 IPv6 SSRF  ← いま推奨
7. T-031 / T-036 …
8. 公開フィード前: T-034 → T-035
```

L11 手順: [L11_MANUAL_E2E.md](./L11_MANUAL_E2E.md)。credential isolation **done**（T-030）。

---

## ローカル節の完了条件（Phase 1–3 まとめて）

- [x] Proxy 経由で models + 最小 completion 成功（実キー・curl、2026-07-12）← L11 最小  
- [ ] IDE/SDK から同じ Proxy へ接続して一通（利用者設定。手順は L11_MANUAL_E2E）
- [x] RoutePlan → Executor が primary に従う（コード+テスト）
- [x] 失敗時 fallback ロジック（コード+ユニット。catalog 複数は L8 後に実効）
- [x] 静的フィード差し替えで候補が変わる ← L8
- [x] ローカルに成功/失敗・offering・attempts・status・latency が残る ← L10（目安コスト紐付けは後段可）

全部チェック入ったら **大枠 Phase 1–3 完了** とみなし、[ROADMAP_MACRO.md](./ROADMAP_MACRO.md) のピンを Phase 4 手前に進める。

---

## 触らない（ローカル節の間）

- サイト本番・日次ニュースレター
- 月額・Stripe
- 広告 UI
- 中央中継

詳細ギャップ: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)  
並列の投げ方: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
