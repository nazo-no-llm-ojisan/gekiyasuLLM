# ロードマップ索引

「いまどこ？」の入口。長い設計は `design/`、作業チケットは台帳。

| 見たいもの | ファイル |
|---|---|
| **大枠（Phase 0–7）とピン** | [ROADMAP_MACRO.md](./ROADMAP_MACRO.md) |
| **ローカル（L0–L12 履歴 + M1–M3）** | [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) |
| 設計とコードのギャップ表 | [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) |
| 並列タスク台帳 T-0xx | [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) |
| 短いユーザ報告 | [USER_STATUS_TEMPLATE.md](./USER_STATUS_TEMPLATE.md) |

---

## いま（両方まとめて一言）

| 地図 | 位置 |
|---|---|
| 大枠 | Phase 1–3 完了 → **次は M2（データ縦貫通）** |
| ローカル | **L12 完了** · 本線 **M1 完了**（T-044–046 request-aware）→ **M2** |

```text
M1 正しいルーティング  →  M2 データ縦貫通  →  M3 安全な自動公開
     T-044–046              T-039,024,050,051     T-035,034,048
```

中継・fallback・静的 feed・統計・circuit あり。要求 model で候補絞り込み → `upstreamModelId` 書換済み（M1 完了）。  
詳細は [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)。作業単位は [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)。

---

## ドキュメントの役割分担

```text
docs/
  ROADMAP.md              ← この索引
  ROADMAP_MACRO.md        ← 製品全体の相
  ROADMAP_LOCAL.md        ← 利用者向け段階 (L) + 本線マイルストーン (M)
  PARALLEL_AGENTS.md      ← T 番号・owned_paths・done_when
  IMPLEMENTATION_STATUS.md← 機能ごとの実装/未実装
  design/                 ← 厚い設計
```

- **L** = 到達段階の履歴（L0–L12 完了）  
- **M** = これから進む依存マイルストーン（線形の L13–L24 は使わない）  
- **T** = エージェント作業単位  
