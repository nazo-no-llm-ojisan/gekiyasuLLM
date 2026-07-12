# ローカル節ロードマップ

**自分の PC 上で「使える中継」から「正しく安い方へ送る」まで。**  
大枠は [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)。作業単位・done_when・owned_paths は [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)。

最終更新: 2026-07-12（M1–M3 に畳み直し。L13–L24 の線形並びは廃止）

---

## 役割分担（混同しない）

| 記号 | 意味 | 正本 |
|---|---|---|
| **L0–L12** | 利用者から見た到達段階（中継箱〜統計）。**完了済み** | 下の履歴 |
| **M1–M3** | これから「ただの proxy から脱出」する依存マイルストーン | **本ファイル** |
| **T-0xx** | エージェントへ渡す作業単位（赤→緑） | [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) |

番号は工程順を表さない。**依存グラフ**で進む。詳細な `done_when` は台帳へ。

---

## いまの位置

```text
L0–L12  中継・plan・静的feed・統計・dashboard・circuit  ████ 完了

本線マイルストーン
  M1  正しく振り分ける     ████ 完了（T-044 / T-045 / T-046）
  M2  データから一本通す   ░░░░  ← いまここ
  M3  安全に自動公開する   ░░░░
  公開フィード運用開始     ░░░░
```

**ピン:** **M2**（T-039 / T-024 / T-050 / T-051）。  
M1 完了: request-aware routing（要求モデル → 候補絞り込み → hard filter → 最安 → `upstreamModelId` 書換）が実 HTTP 経路で動作。`apiCompat` / `allowsPrivateCode` も fail-closed。  
本番利用・自動取得公開フィード: **不可**（M3 前）。

---

## 本線: 3 マイルストーン

```text
現在 (L12)
  ↓
M1 正しいルーティング          T-044 · T-045 · T-046
  ↓
M2 データ縦貫通                T-039 · T-024 · T-050 · T-051
  ↓
M3 安全な自動公開              T-035 · T-034 · T-048
  ↓
公開フィード運用開始
```

### M1 — 正しく振り分ける（**完了**）

Proxy の正しさだけ。スクレイピングも署名も不要。

| | |
|---|---|
| **含む** | request body から model・能力を読む / 対応 Offering だけ候補化 / `apiCompat` fail-closed / private trust fail-closed / `upstreamModelId` へ書換 |
| **タスク** | **T-044** ✅ · **T-045** ✅ · **T-046** ✅（台帳） |
| **完了条件** | fixture 上の同一論理モデルについて、適合する最安 Offering を選び、正しい `upstreamModelId` を上流へ送れる |

### M2 — データから実際に一本通す

収集・正規化と「同じ feed」の比較面。

| | |
|---|---|
| **含む** | model-id 正規化 / 公式情報から少数 provider 収集 / 出典付き Offering / 2–3 provider 縦貫通 / 同一 feed から GitHub Pages |
| **タスク** | **T-039** · **T-024** · **T-050** · **T-051** |
| **完了条件** | 公式情報から生成した同一 feed を、比較サイトとローカル Proxy の両方が利用できる |
| **Pages の扱い** | この段階で出してよい。**署名済み本番フィードではない**。人間が読む静的カタログ |

M1 完了後が本筋。収集実験（T-024 / T-039）は M1 と path が重ならなければ **先行・並列可**（Proxy に混ぜない）。

### M3 — 自動公開して信頼できるようにする

公開フィードを Proxy が安全に取れるゲート。

| | |
|---|---|
| **含む** | feed 署名 / rollback・期限 / feed が勝手に allowlist 拡張しない / DNS resolve-and-pin / 異常価格差分の公開停止 / CI build・全テスト検出 |
| **タスク** | **T-035** · **T-034** · **T-048**（主軸） |
| **完了条件** | 自動更新された公開 feed を、Proxy が安全に取得して実ルーティングへ使える |

**公開／自動更新フィード開始の必須ゲート。** M1 が無いと「安全だが正しく振り分けない」。

---

## 品質レーン（本線の番号を付けない）

空いたエージェントへ並列投入。マイルストーンを進めない限り「脱出」には数えない。

| タスク | 内容 |
|---|---|
| T-047 | CORS 全経路 + origin allowlist |
| T-049 | health 情報最小化 |
| T-037 | stats CLI / 集計 |
| T-038 | IDE 一通 docs |
| T-042 | 単一実行ファイル / Releases |
| T-036 | circuit breaker — **done** |
| T-031 / T-033 | tenant headers / IPv6 SSRF — **done** |
| （任意） | Actions SHA pin、T-041 Lua hook、T-043 herding NFR |

---

## 触らない

- 中央でユーザープロンプトを中継する
- 保証付きの最安表示・煽りヘッドラインのみ
- 全社スクレイピング量産（M2 の少数縦貫通より先に横を広げない）
- 署名なし自動取得フィードを本番相当で読む
- 月額・Stripe・広告 UI

---

## 履歴: L0–L12（完了）

利用者向け「中継箱 → 選び方 → 統計」の到達段階。工程表の再実行は不要。

```text
L0  設計・契約                 完了
L1  中継箱 (passthrough)       完了  127.0.0.1:16191
L2  境界ガード                 完了
L3  共有型 + fixture           完了
L4–L7  RoutePlan / Executor / fallback  完了
L8  静的フィード               完了
L9  CostEstimate 最小          完了
L10 ローカル統計 JSONL         完了
L11 実キー E2E（curl 最小）    完了（IDE は利用者）
L12 静的 dashboard             完了
```

| ローカル段 | 台帳 | 状態 |
|---|---|---|
| L1–L2 | T-020 | done |
| L3 | T-021 | done |
| L4–L7 | T-022–T-028 | done |
| L8–L9 | T-029 | done |
| L10 | T-032 | done |
| credential isolation | T-030 | done |
| IPv6 / tenant / circuit | T-033 / T-031 / T-036 | done |

### Phase 1–3 チェック（中継箱としての完了）

- [x] models + 最小 completion（curl）
- [ ] IDE 一通（利用者・T-038）
- [x] RoutePlan → Executor
- [x] GET/HEAD fallback、POST 禁止
- [x] 静的フィード差し替え
- [x] ローカル統計
- [x] **M1** 正しい model ID で振り分け（完了） ← 製品としての次: M2

---

## 関連

- 台帳・投げ方: [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
- 実装ギャップ: [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
- モデル同定契約: [design/06-model-identity-and-normalization.md](./design/06-model-identity-and-normalization.md)
- 大枠 Phase: [ROADMAP_MACRO.md](./ROADMAP_MACRO.md)
