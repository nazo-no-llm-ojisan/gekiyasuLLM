# ロードマップ索引

「いまどこ？」の入口。長い設計は `design/`、作業チケットは台帳。

| 見たいもの | ファイル |
|---|---|
| **大枠（Phase 0–7）とピン** | [ROADMAP_MACRO.md](./ROADMAP_MACRO.md) |
| **ローカル節（Phase 1–3 の段）とピン** | [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) |
| 設計とコードのギャップ表 | [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) |
| 並列タスク台帳 T-0xx | [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) |
| 短いユーザ報告 | [USER_STATUS_TEMPLATE.md](./USER_STATUS_TEMPLATE.md) |

---

## いま（両方まとめて一言）

| 地図 | 位置 |
|---|---|
| 大枠 | **Phase 2 完了 → Phase 3 進行中**（fallback・CostEstimate・統計・L11 curl 済。circuit 未） |
| ローカル | **L10 完了** · T-033 done → バックログ（推奨次 **T-031** / **T-036**） |

中継・plan/filter/fallback（GET）・静的フィード・CostEstimate・credential isolation・ローカル統計 JSONL あり。POST 自動 fallback はしない。  
起票一覧: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)「起票済みバックログ」· 台帳 [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) T-031–T-038。

---

## ドキュメントの役割分担

```text
docs/
  ROADMAP.md              ← この索引
  ROADMAP_MACRO.md        ← 製品全体の相
  ROADMAP_LOCAL.md        ← 今やってるローカル作業の相
  IMPLEMENTATION_STATUS.md← 機能IDごとの実装/未実装
  PARALLEL_AGENTS.md      ← 並列タスクと所有 path
  BRAINLESS_TDD.md        ← 赤緑コミットのやり方
  USER_STATUS_TEMPLATE.md ← ユーザ向け短報
  FAILURE_TAXONOMY.md     ← 失敗分類の正本
  CORRECTIONS.md          ← 訂正方針
  design/                 ← 厚い設計（01–05, ADR）
```
