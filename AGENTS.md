# AGENTS.md — gekiyasuLLM

このリポジトリで作業するコーディングエージェント向けの指示。

## プロジェクト

**gekiyasuLLM** は二層構成のシステムである。

1. **中央情報サービス**（`gekiyasuLLM.com`、計画中） — 署名付きルーティングフィード（価格、能力、キャンペーン、可用性）を配信する。ユーザーの LLM リクエストは **中継しない**。
2. **ローカル OSS プロキシ**（`gekiyasuLLMProxy`） — 利用者のマシン上で動作し、OpenAI 互換（将来は Anthropic 互換）API を公開し、ローカルポリシーに従って上流エンドポイントを選ぶ。

## リポジトリの性格

- **GitHub 公開前提**（最初から public）。「信用して」ではなく **検査できる** 状態を維持する。
- **ライセンス:** Apache-2.0（`LICENSE`）。名称は `TRADEMARKS.md`。
- **企画専用ではない。** 設計と **個人向け MVP 実装を同一リポジトリに混在してよい。**
- 現状の中心は `docs/design/`。実装とドキュメントを並走して更新する。
- 目安スコープは **Phase 1〜3**。Phase 4 以降は設計を揃えてから。
- **商用課金の本番運用・有料契約・本番インフラ** はメンテナ承認が必要。

## 最初に読むもの

- 設計の索引: `docs/design/README.md`
- ライセンス・COI・訂正: `docs/design/04-licensing-coi-corrections.md`, `docs/CORRECTIONS.md`
- アダプタ境界・Evidence / Offering / RoutePlan: `docs/design/05-adapters-normalization-routing.md`
- 型の正: `packages/schema`
- 企画 / MVP / 事業: `docs/design/01-product-mvp-and-business.md`
- アーキテクチャ: `docs/design/02-architecture-routing-and-security.md`
- スタック / ADR / 作業単位: `docs/design/03-stack-roadmap-and-adrs.md`

実装に入るときは、上記の MVP 境界と ADR を破らないこと。

## 推奨ディレクトリ（実装時）

確定でなくてよいが、新規コードは次の置き方を優先する。

```text
/
  AGENTS.md
  README.md             # 短い英日
  README.ja.md          # 日本語の詳細
  docs/design/          # 設計（日本語）
  packages/
    schema/             # フィード・設定の型 / JSON Schema
    proxy/              # gekiyasuLLMProxy（TypeScript）
  feeds/                # 公開用サンプルフィードのみ（秘密・個人キーを含めない）
```

単一パッケージで始める場合は `packages/proxy` またはリポジトリ直下の `proxy/` でも可。後から monorepo 化してよい。

## 公開リポジトリでの表現ルール

- 価格・無料枠・可用性・速度は **保証しない**。記載するときは情報源 URL と取得日（`as_of`）を付ける。
- 「最安」「無料」は **条件付き・時点付き** と分かる書き方にする（絶対保証に読める文言を避ける）。
- 第三者プロバイダ・仲介 API を **誹謗中傷しない**。「怪しい」「グレー」など曖昧な貶め表現は使わず、観測可能な事実（運営元の公開情報の有無、データ利用条件、CC 要否、障害履歴など）と `trust` フィールドで示す。
- 競合製品は機能差の整理にとどめ、優劣の断定や嘲笑をしない。
- 利用規約に反するスクレイピング・過大な probe・共有 API キーの濫用を提案・実装しない。
- 署名用 **秘密鍵**、個人 API キー、実ユーザーのプロンプト／ログをコミットしない。

## 厳守制約

- マーケ文言・無料枠・第三者ベンチを確定事実として扱わない。
- ADR の明示的な変更なしに、中央リクエスト中継アーキテクチャを追加しない（既定はローカルプロキシ）。
- プロンプト本文の telemetry を実装しない。将来の telemetry は opt-in かつ本文なしに限る。
- プロキシ内でモデル生成のコマンドやパッチを自動実行しない。
- 秘密情報、API キー、認証情報が入った `.env`、フィード署名の秘密鍵をコミットしない。
- 無料または低コストのインフラを優先する。調査・開発での有料 API 呼び出しは承認なしに行わない（利用者自身のキーでローカル検証するのは可）。
- ローカルプロキシは既定で **`127.0.0.1:16191`** にバインドする（ポート変更は `GEKIYASU_PORT`）。

## 実装方針（MVP）

- `docs/design/03-stack-roadmap-and-adrs.md` の作業単位 A→H を目安に、小さく進める。
- MVP の既定（ADR より）:
  - TypeScript / Node プロキシ
  - まず OpenAI `/v1/chat/completions` と `/v1/models`
  - Web UI より CLI
  - 中央 DB より静的フィード
  - rtk は任意（必須依存にしない）
  - 手元専用の未署名フィードは開発用に可。**配布・既定のリモートフィードは署名必須を目標**
- provider フィードには `sponsored`, `affiliate`, `editorial_rank_influence: "none"` を必須。既定ソートに商業フィールドを使わない。
- 価格等の誤記を直すときは `docs/CORRECTIONS.md` に従い、影響期間・原因・フィード版を残す（黙って消さない）。
- 新規の収集・正規化は **Fetcher と Parser を分ける**。Evidence / Offering / RoutePlan 概念を壊さない（`packages/schema`, 設計 05）。
- ルーティングは **RoutePlan 生成と Executor を分離**。直接 HTTP だけの巨大関数に戻さない。
- OpenAI 互換は UpstreamAdapter の一つ。内部共通型を OpenAI 専用にしない。
- 設計と実装が食い違ったら、差分をドキュメントか ADR に残してから直す。

## 実装状況

- 設計の「MVP ○」とコードの差は `docs/IMPLEMENTATION_STATUS.md` が正。更新したらそこも直す。
- 監査で繰り返し出る穴: フィード動的 URL 前の allowlist、認証の多層化、redaction/audit。

## ユーザ報告・脳レスTDD

**役割分担（必須）:**

- **ユーザ** = 大枠判断のみ。細かい技術要件を考えさせない・宿題にしない。
- **エージェント** = 技術詳細を決め、実装し、**詳細文章をリポジトリに残す**（チャットだけで完結させない）。
- チャットは短く。正本は `docs/` とコード。

運用:

- 短い現状: `docs/USER_STATUS_TEMPLATE.md`
- 開発ループ: `docs/BRAINLESS_TDD.md`（**赤 → 緑 → コミット**。先回り・横展開禁止）
- ユーザが「通った／通らない／次の一手」だけ返してきたら、長文講義せず **次の一手だけ** 返す。
- 脳レスTDD中は **次の赤テスト1本** または **緑にする最小パッチ** のみ。
- 講義が必要ならファイルに書いてパスだけ返す。ユーザに型やAPI仕様の選択を並べない（大枠の二択までに限る）。

## リポジトリの衛生

- 利用者向け設計ドキュメントの言語: **日本語**。入口 README は英日併記（`README.md`）、詳細は `README.ja.md`。
- コードとコードコメント: 英語でよい。既存スタイルに合わせる。
- 自明な次の作業単位の外にスコープを広げない。特に広告・課金・中央中継は勝手に入れない。
- ユーザーの指示がない限り、force-push、force-with-lease、共有履歴の書き換えを行わない。
- 実装を入れたら `README.md` の「現状」と必要なら設計書の Phase 記述を更新する。
- コミットメッセージに秘密情報や個人データを書かない。

## ついで変更の対象外

- 明示承認なしに、商用契約の締結、有料アカウント作成、本番インフラのデプロイを行わない。
- ADR の決定を黙って変えない。変更する場合は `docs/design/` に ADR 修正案を残す。
