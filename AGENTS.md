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

### プロジェクト統括・契約判断・Docs Sync

メンテナが明示的に統括担当として指定したモデルまたは人間だけが担当する。現在の想定は ChatGPT 5.5 系または Claude Opus 4.8 系を、チャット窓または Codex から使用する運用。

責務:

- Phase / Milestone / T 番号 / Issue の依存関係を決定する
- `contract_changes: proposed` をレビューし、公開契約を確定する
- `ROADMAP*.md`、`IMPLEMENTATION_STATUS.md`、`PARALLEL_AGENTS.md`、設計文書を横断同期する
- 実装成果を監査し、`done` とマイルストーン完了を宣言する
- 複数エージェント成果物の統合順序を決める

### 実装・コーディング担当

責務:

- 指定 Issue / T 行の `owned_paths` と `done_when` の範囲だけを実装する
- 赤テストから緑への閉じた変更を作る
- 自分が変更した局所 API や実行手順に直接必要な docs を更新する
- tests / typecheck / build の実行結果と、満たせなかった条件を報告する

禁止:

- `ROADMAP_MACRO.md`、`ROADMAP_LOCAL*.md`、`IMPLEMENTATION_STATUS.md` の横断状態を独断で更新する
- 自分の実装を根拠に T 行や Milestone を `done` にする
- 未確定の契約を下流タスクの前提にする
- 複数 T を一つの作業へ無断で束ねる

**実装がコミットされたことと、タスクが `done` であることは別。** 実装着地後、統括担当による契約・境界・証拠の監査を通して初めて正本を更新する。

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
