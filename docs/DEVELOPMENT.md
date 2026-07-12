# docs/DEVELOPMENT.md — 開発・実装ガイドライン

実装エージェント向けの開発手順、設計原則、およびコード作成ルールです。軽量なコーディングやテスト修正を行うエージェントは本ドキュメントを参照してください。

---

## 1. 推奨ディレクトリ構造
新規コードやパッケージの配置は以下の構造を優先します。

```text
/
  AGENTS.md             # エントリポイント（絶対規約）
  README.md             # 短い英日
  README.ja.md          # 日本語の詳細
  docs/                 # ドキュメント
    DEVELOPMENT.md      # 本ガイドライン
    GOVERNANCE.md       # ガバナンス・監査ルール
  packages/
    schema/             # フィード・設定の型 / JSON Schema
    proxy/              # gekiyasuLLMProxy (TypeScript)
  fixtures/             # 公開用サンプルフィードのみ（秘密・個人キーを含めない）
  scripts/              # 共通ユーティリティ（run-tests.mjs 等）
  dashboard/            # 静的ダッシュボード
  .github/workflows/    # CI 設定
```

## 2. 実装方針 (MVP)
- **TypeScript / Node プロキシ**: 最初の実装は TypeScript および Node.js 環境を対象とします。
- **OpenAI 互換の先行**: まず OpenAI `/v1/chat/completions` と `/v1/models` をサポートします。
- **CLI の優先**: Web UI よりも CLI や設定ファイルでの動作を優先します。
- **Fetcher と Parser の分離**: 新規の収集・正規化処理を書く際は、取得処理（Fetcher）と解析処理（Parser）の境界を明確に分け、DOM等の変更に強い設計とします（[05-adapters-normalization-routing.md](./design/05-adapters-normalization-routing.md)）。
- **RoutePlan と Executor の分離**: ルーティング処理は、実行計画の生成と実際の HTTP 通信（実行）を分離し、単体テスト可能に保ちます。
- **汎用性の維持**: 内部共通型を OpenAI 互換専用にせず、将来的に Anthropic 等の上流アダプタを追加できるように設計します。

## 3. 実装状況と監査で出やすい穴
設計と実装の現在のギャップは `docs/IMPLEMENTATION_STATUS.md` が正本です。
特に以下の脆弱性・不備が生じやすいため、実装の際は注意してください。
- フィードの動的 URL の allowlist による制限
- 認証の多層化（ローカル認証と上流認証の分離）
- Telemetry の無効化、ログからのプロンプト本文/APIキーの redaction (削除)

## 4. 開発ループと並列ルール
- **脳レスTDD**: 実装の際は必ず失敗するテストから書き、緑にする最小のコードを書き、細かくコミットします。詳細は [BRAINLESS_TDD.md](./BRAINLESS_TDD.md) を参照してください。
- **並列運用**: 複数エージェントが同時に作業する場合、設計・契約（スキーマ等）の変更は直列で行い、契約済みの実装のみ並列で行います。詳細は [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md) を参照し、割り当てられた `owned_paths` 外のファイルには絶対に触らないでください。

## 5. コードの衛生と変更範囲
- **言語ルール**: 
  - 利用者向け設計ドキュメント: **日本語**
  - コードおよびコード内のコメント: **英語**
- **ついで変更の禁止**: 
  - 現在のタスクと直接関係のないリファクタリング、フォーマット変更、機能追加は行わないでください。
  - 明示的な承認なしに、商用契約の締結や有料 API 呼び出しを行わないでください。

---

## 関連開発ドキュメント
- [BRAINLESS_TDD.md](./BRAINLESS_TDD.md)
- [PARALLEL_AGENTS.md](./PARALLEL_AGENTS.md)
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
- [05-adapters-normalization-routing.md](./design/05-adapters-normalization-routing.md)
