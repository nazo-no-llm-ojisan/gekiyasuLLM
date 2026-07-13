# AGENTS.md — gekiyasuLLM エージェント共通規約

本リポジトリで作業するエージェントが最初に読む、基本情報と絶対規約のエントリポイントです。

---

## 1. プロジェクト基本概要

**gekiyasuLLM** は以下の二層構成を持つシステムです。

1. **中央情報サービス** (`gekiyasuLLM.com`、計画中) — 署名付きルーティングフィード（価格、能力、キャンペーン、可用性）を配信します。ユーザーの LLM プロンプト等のリクエストは **一切中継しません**。
2. **ローカル OSS プロキシ** (`gekiyasuLLMProxy`) — 利用者のマシン上で動作し、OpenAI 互換（将来は Anthropic 互換）API を公開し、ローカルポリシーに従って上流エンドポイントを選択します。

---

## 2. 絶対規約 (Must Always Follow)

- **秘密情報の漏洩防止**: 署名用秘密鍵、個人 API キー、実ユーザーのプロンプトやログを絶対にコミットしない。
- **中継の禁止**: ADR の明示的な変更なしに、中央でプロンプトやリクエストを中継するアーキテクチャを追加しない。
- **テレメトリの禁止**: プロンプト本文を外部に送信する telemetry を実装しない。
- **自動実行の禁止**: プロキシ内で外部コマンドやパッチを自動実行するコードを組み込まない。
- **バインドポートの固定**: ローカルプロキシは既定で **`127.0.0.1:16191`** にバインドする（変更は `GEKIYASU_PORT`）。
- **承認なき有料契約の禁止**: 商用契約、有料アカウント作成、有償 API 実行はメンテナの明示承認なしに行わない。

---

## 3. 作業権限と責務

### 最終判断者

メンテナであるユーザが、製品目的、価値判断、優先順位、停止判断、契約変更、次フェーズ移行についての最終決定権を持つ。

LLM間の合意や多数決は、ユーザの判断を置き換えない。

### ChatGPT通常チャット窓 — 統括・監査・意味整理

ここでいう ChatGPT は、Codex 等のコーディングエージェントではなく、GitHub 接続を利用できる通常の会話セッションを指す。

主な責務:

- リポジトリ、Issue、commit、docs、実装報告を横断して現在状態を整理する
- ユーザとの対話を通じて、目的、設計、依存関係、違和感、未確定事項を明確化する
- 実装担当の自己申告を鵜呑みにせず、diff、test code、artifact、CI、Issue の `done_when` を監査する
- Phase / Milestone / T 番号 / Issue の依存関係を整理し、必要な作業単位へ分解する
- `contract_changes: proposed` をレビューし、公開契約を確定するための判断材料を提示する
- `ROADMAP*.md`、`IMPLEMENTATION_STATUS.md`、`PARALLEL_AGENTS.md`、設計文書を横断同期する
- 監査結果に基づき、Issue へのコメント、close、依存解除、`done` 宣言を行う
- 複数エージェント、別スレッド、別リポジトリから得た知見を統合する

行わないこと:

- ユーザに代わって製品目的や最終的な価値判断を決定しない
- 実装担当の報告だけを根拠に `done` を宣言しない
- 証拠なしに Issue、契約、scope を増やさない
- ローカル作業ツリーを直接確認・実行していない場合に、確認済みであるかのように扱わない
- ローカル test 報告を GitHub Actions / CI green と同一視しない
- helper-level test を actual HTTP / executor path の証明と呼び替えない

ChatGPT通常チャット窓は、統括・監査・Docs Sync の既定担当である。ただし、完了判定や契約変更は常にユーザの方針と監査証拠に従う。

### Codex等の実装・コーディング担当

責務:

- 指定 Issue / T 行の `owned_paths` と `done_when` の範囲だけを実装する
- 赤テストから緑への閉じた変更を作る
- 自分が変更した局所 API や実行手順に直接必要な docs を更新する
- tests / typecheck / build の実行結果と、満たせなかった条件を報告する
- commit SHA、push 先、未解決事項を明示する

禁止:

- `ROADMAP_MACRO.md`、`ROADMAP_LOCAL*.md`、`IMPLEMENTATION_STATUS.md` の横断状態を独断で更新する
- 自分の実装を根拠に T 行や Milestone を `done` にする
- 未確定の契約を下流タスクの前提にする
- 複数 T を一つの作業へ無断で束ねる
- scoped evidence のない実 provider 情報を confirmed / trusted として埋める

**実装がコミットされたことと、タスクが `done` であることは別。** 実装着地後、統括担当による契約・境界・証拠の監査を通して初めて正本を更新する。

### GitHub — 共有状態ハブ

GitHub は以下を保持する共有状態ハブとする。

- Issue と `done_when`
- commit / PR / diff
- 設計契約と roadmap
- test / CI 証拠
- 監査コメントと完了状態

会話内だけで決まった重要事項は、必要に応じて Issue、docs、commit のいずれかへ戻す。

役割の要約:

```text
ユーザ                = 最終判断・価値基準
ChatGPT通常チャット窓 = 統括・監査・意味整理・Docs Sync
Codex等                = 実装・局所検証
GitHub                 = 状態・契約・証拠の共有ハブ
```

---

## 4. 詳細ガイドラインへの誘導 (Routing)

明示的なユーザ指示がない場合、実装担当はルートAから開始する。

### A. 実装・コーディング・テスト修正

- [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)
- [docs/PARALLEL_AGENTS.md](./docs/PARALLEL_AGENTS.md)

### B. 統括・Docs Sync・全体監査・法務コンプライアンス

- [docs/GOVERNANCE.md](./docs/GOVERNANCE.md)
- [docs/ROADMAP.md](./docs/ROADMAP.md)
- [docs/IMPLEMENTATION_STATUS.md](./docs/IMPLEMENTATION_STATUS.md)
- 必要に応じて [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)
