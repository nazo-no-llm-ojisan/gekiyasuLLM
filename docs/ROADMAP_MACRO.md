# 大枠ロードマップ（MVP を超える全体像）

**これは「製品としてどこへ行くか」の地図。**  
細かいタスク番号は書かない。いまのピン位置だけ更新する。

最終更新: 2026-07-12

関連: [ローカル節](./ROADMAP_LOCAL.md) · [実装ギャップ表](./IMPLEMENTATION_STATUS.md) · [設計 Phase 表](./design/03-stack-roadmap-and-adrs.md)

---

## いまの位置（大枠）

```text
Phase 0 設計 ████████████ 完了
Phase 1 個人Proxy ████████████ 完了
Phase 2 静的フィード ████████████ 完了（フィードファイル読み込み対応）
Phase 3 health/統計 ██████████░░ ほぼ（fallback・L9–L12・circuit 済）
[==== YOU ARE HERE ====]
Phase 3c request-aware + feed 信頼境界 ░░░░░░░░░░░░ ローカル L13〜（製品中核）
Phase 4 中央集計・日次 ░░░░░░░░░░░░ 未（L24 Pages 最小は先に触ってよい）
Phase 5 OSS 利用性成熟 ███░░░░░░ ライセンス・公開・CI あり。貢献ガイド等は後
Phase 6 月額 ░░░░░░░░░░░░░ 任意・未着手
Phase 7 広告・法人 ░░░░░░░░░░░░ 任意・未着手
```

**一言:** 中継箱としては使える（L12）。次の価値は **L13 request-aware routing**（model↔offering + `upstreamModelId`）。公開フィードは **L17 署名 + L18 DNS pin** が必須ゲート。  
詳細段: [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md)。POST 自動 fallback はしない。

---

## Phase 一覧

| Phase | 名前 | ゴール（ユーザー価値） | 状態 |
|---|---|---|---|
| **0** | 調査・設計 | 何を作るか・何をしないかが文書化されている | **完了** |
| **1** | 個人用ローカル Proxy | IDE からローカル経由で LLM が使える | **完了** |
| **2** | 静的ルーティングフィード | 一覧を差し替えて経路が変わる | **完了** |
| **3** | health / 統計 / fallback | 落ちたら次へ、自分の利用が見える | **ほぼ完了**（L12 + T-036 circuit。request-aware は 3c） |
| **3b** | 境界 hardening | 公開フィード前に潰す | T-033 **done** · T-031 **done** · 残 T-034 DNS · T-035 署名 |
| **3c** | request-aware + 縦貫通 | 正しい model ID で最安互換へ送る | **次本線**（ローカル L13–L22） |
| **4** | 中央集計・日次 | サイト・RSS・可用性ヘッドライン | 未（L24 Pages 最小は実験可） |
| **5** | OSS として使いやすい | 他人が README どおり install できる | 部分（Apache-2.0・public） |
| **6** | 月額情報（任意） | 鮮度の高いフィード等 | 未・任意 |
| **7** | 広告・法人（任意） | 開示付きスポンサー、監視 | 未・任意 |

---

## 大枠の依存（飛ばさない）

```text
0 設計
 └─ 1 ローカル中継が自分の環境で通る
      └─ 2 フィードで候補が差し替わる
           └─ 3 失敗時 fallback とローカル統計
                └─ 3c request-aware（正しい model ID）+ 縦貫通
                     └─ 4 中央の日次・公開情報（Pages 最小は 3c と並行可）
                          └─ 5 他人が再現できる OSS 体験
                               └─ 6/7 金・広告は「やる」と決めてから
```

**3c（L13 request-aware）なしに「製品として安い方へ流れる」とは言わない。**  
Phase 4 本番（日次収集・自動公開）の前に L17/L18。静的 Pages の最小実験は L24 として先に触ってよい。

---

## 大枠で「やらない」（今）

- 中央でユーザーのプロンプトを中継する
- 保証付きの最安表示
- スクレイピング本番量産
- 月額・広告のコード先行

---

## ピンの更新ルール

- Phase を跨いだらこのファイルの「いまの位置」を直す
- 細かい done/todo は [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) と [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) 台帳
