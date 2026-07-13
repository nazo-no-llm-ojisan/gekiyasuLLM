# 大枠ロードマップ（MVP を超える全体像）

**これは「製品としてどこへ行くか」の地図。**  
細かいタスク番号は書かない。いまのピン位置だけ更新する。

最終更新: 2026-07-13

関連: [ローカル本線](./ROADMAP_LOCAL.md) · [Phase 3+](./ROADMAP_LOCAL3plus.md) · [Phase 4](./ROADMAP_LOCAL4.md) · [実装ギャップ表](./IMPLEMENTATION_STATUS.md) · [設計 Phase 表](./design/03-stack-roadmap-and-adrs.md)

---

## いまの位置（大枠）

```text
Phase 0 設計 ████████████ 完了
Phase 1 個人Proxy ████████████ 完了
Phase 2 静的フィード ████████████ 完了
Phase 3 health/統計 ████████████ 完了（L12・circuit 済）

ローカル本線
  M1 正しいrouting ████████████ 完了
  M2 データ縦貫通 ███░░░░░░░░ 実装候補着地・監査修正中  ← YOU ARE HERE
  M3 安全な取得/検証 ░░░░░░░░░░░░ 未

Phase 3+ anomaly governance ░░░░░░░░░░░░ 未
Phase 4 中央集計・日次review ░░░░░░░░░░░░ 未
Phase 5 OSS 利用性成熟 ███░░░░░░ ライセンス・公開・CI あり
Phase 6 月額 ░░░░░░░░░░░░░ 任意
Phase 7 広告・法人 ░░░░░░░░░░░░ 任意
```

**一言:** 中継とM1は使える。コミット `34a01e1` にM2実装候補が着地したが、保存snapshot→generated feed、実HTTP/executor経路、ProxyとPagesの同一feed利用が未証明。Issue #12→#13→#14/#15を完了・監査するまでM2完了とはしない。POST自動fallbackはしない。

---

## Phase 一覧

| Phase | 名前 | ゴール（ユーザー価値） | 状態 |
|---|---|---|---|
| **0** | 調査・設計 | 何を作るか・何をしないかが文書化されている | **完了** |
| **1** | 個人用ローカル Proxy | IDE からローカル経由で LLM が使える | **完了** |
| **2** | 静的ルーティングフィード | 一覧を差し替えて経路が変わる | **完了** |
| **3** | health / 統計 / fallback | 落ちたら次へ、自分の利用が見える | **完了**（L12 + circuit） |
| **ローカル本線 M1–M3** | 正しいrouting・データ縦貫通・安全なfeed取得 | ローカルProxyを公開feedへ接続できる | **M1完了、M2監査修正中** |
| **3+** | anomaly governance | observation / evidence / assessment / ledger / overlayを監査可能にする | 未（詳細は ROADMAP_LOCAL3plus） |
| **4** | 中央集計・日次レビュー運用 | 収集・review queue・operator判断・site/RSS/feed公開を安全に日次運用する | 未（詳細は ROADMAP_LOCAL4） |
| **5** | OSS として使いやすい | 他人が README どおり install できる | 部分（Apache-2.0・public） |
| **6** | 月額情報（任意） | 鮮度の高いフィード等 | 未・任意 |
| **7** | 広告・法人（任意） | 開示付きスポンサー、監視 | 未・任意 |

**「Phase 3+」は anomaly governance だけを指す。** M1–M3はPhase番号ではなくローカル本線マイルストーンであり、同名にしない。

---

## 大枠の依存（飛ばさない）

```text
0 設計
 └─ 1 ローカル中継
     └─ 2 静的feed
         └─ 3 fallback / local stats
             └─ M1 正しいrouting
                 └─ M2 evidence-backed data vertical
                     ├─ Phase 3+ schema → ledger projection → feed overlay
                     └─ M3 signature / DNS pin / CI publication safety
                          （Phase 3+とM3の実装は契約確定後に並行可）
                             └─ Phase 4 daily collection / review / publication
                                 └─ Phase 5 OSS体験 / Phase 6–7 金・広告
```

- M2の静的Pages prototypeは署名前でも可。ただし**同一feedから機械生成されること**が条件。
- 自動公開・production相当のfeed運用開始は、M3だけでなくPhase 3+のpublication policy / overlay境界も満たしてから。
- anomaly governanceを自動公開開始より後に回さない。

---

## 大枠で「やらない」（今）

- 中央でユーザーのプロンプトを中継する
- 保証付きの最安表示
- スクレイピング本番量産
- 月額・広告のコード先行
- 未監査の実装コミットだけを根拠にPhaseやMilestoneを完了扱いする

---

## ピンの更新ルール

- Phaseを跨いだら本ファイルの「いまの位置」を統括・Docs Sync担当が更新する
- 細かいdone/todoは [ROADMAP_LOCAL.md](./ROADMAP_LOCAL.md) と [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) が正本
- 実装担当は自分の成果を根拠に本ファイルをdone更新しない
