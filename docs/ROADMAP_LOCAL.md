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
L6  複数候補 + hard filter       ░░░░ 次
L7  fallback / circuit           ░░░░ 未
L8  静的フィード読込             ░░░░ 未（Phase 2）
L9  CostEstimate 最小            ░░░░ 未
L10 ローカル統計                 ░░░░ 未（Phase 3）
L11 実キー E2E「IDE から1通」    ░░░░ 手動・未確認を想定
L12 静的 dashboard UI            ████ 完了（dashboard/ + /dashboard/）
```

**ピン:** **L5 完了・L12 静的 UI あり → 次は L6（複数候補）または L11 実キー E2E**  
中継は plan.primary → catalog → upstream。Dashboard は sample JSON のみ（認証なし）。

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
| （parser 実験） | T-024 | todo（並列可・本線外でも可） |
| ルート test | T-025 | **done** |
| 失敗分類 docs | T-026 | **done** |
| L6–L7 候補・fallback | 未採番 | 後 |
| L8 フィード | 未採番 | Phase 2 |
| L9–L10 コスト・統計 | 未採番 | Phase 1 後半〜3 |

---

## 推奨順（迷ったらこれ）

```text
1. ~~T-023 Executor = plan.primary~~ done
2. L6     候補2本 + hard filter     ← 次の一手（本線）
3. L11    実キーで中継 E2E（任意・手動）
4. L9     CostEstimate（input/output だけ）
5. L7     fallback 1段
6. L8     静的フィード pull
7. L10    ローカル統計
```

スクレイピング（T-024 本格）は **L8 の後でもよい**。fixture 遊びはいつでも並列可。

---

## ローカル節の完了条件（Phase 1–3 まとめて）

- [ ] IDE/SDK からローカル Proxy 経由で completion 成功（実キー）
- [ ] RoutePlan → Executor が primary（と fallback）に従う
- [ ] 静的フィード差し替えで候補が変わる
- [ ] 失敗時に次候補へ少なくとも1段
- [ ] ローカルに成功/失敗/目安コストが残る（形式は簡易で可）

全部チェック入ったら **大枠 Phase 1–3 完了** とみなし、[ROADMAP_MACRO.md](./ROADMAP_MACRO.md) のピンを Phase 4 手前に進める。

---

## 触らない（ローカル節の間）

- サイト本番・日次ニュースレター
- 月額・Stripe
- 広告 UI
- 中央中継

詳細ギャップ: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)  
並列の投げ方: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
