# L11 — 実キー手動 E2E（小さく一通）

**目的:** IDE / OpenAI 互換 client からローカル Proxy 経由で **1 通** completion を通し、routing・credential isolation・POST 透過の骨格が実環境で生きていることを確認する。

**ピン:** L9 完了後の **推奨本線**（L10 統計より先に一度通すと、統計で何を残すかが具体化する）。

---

## 絶対ルール

| 誰 | やること / やらないこと |
|---|---|
| **利用者** | 自分の API キーで手動実行する。課金は自己責任 |
| **エージェント** | 有償 API 呼び出し・有料契約・共有キーの使用は **メンテナの明示承認なしに行わない**（`AGENTS.md` / `GOVERNANCE.md`） |
| **CI** | 実キー E2E は走らせない（秘密も課金も入れない） |
| **リポジトリ** | キー・プロンプト本文・課金ログをコミットしない |

成功したら `docs/ROADMAP_LOCAL.md` の L11 チェックを更新し、`docs/HANDOFF.md` に「手動確認済（日付のみ、キーなし）」と残す。

---

## 最小セットアップ

1. 自分の upstream キーを環境に置く（例: `OPENAI_API_KEY`）。**シェル履歴やチャットに貼らない。**
2. Proxy を loopback で起動:

```bash
cd packages/proxy
npm install
npm run dev
```

3. クライアントの base URL:

```text
http://127.0.0.1:16191/v1
```

4. （任意）静的フィードを使う場合のみ `GEKIYASU_FEED_FILE` を設定。E2E 最小は **passthrough（configured upstream のみ）** でよい。

---

## 一通確認（これだけ通れば L11 最小合格）

### A. health

```bash
curl -sS http://127.0.0.1:16191/health
```

### B. GET（models）— 冪等 path

```bash
curl -sS http://127.0.0.1:16191/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

期待: upstream 相当の 200 系。失敗時はキー / allowlist / 起動を疑う。

### C. POST（chat completions）— 非冪等 path

**短く安いモデル・短い prompt** で 1 回だけ。

```bash
curl -sS http://127.0.0.1:16191/v1/chat/completions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"user\",\"content\":\"ping\"}],\"max_tokens\":16}"
```

期待:

- 200 系で短い応答が返る（または upstream の正規エラーが **そのまま** 返る）
- Proxy が別 offering へ **勝手に POST fallback しない**（P1）
- レスポンスに `x-gekiyasu-offering` 等が付く場合は記録用にメモ（本文は残さない）

### D. credential isolation（任意・feed 利用時のみ）

feed で **configured upstream と別 origin** の offering がある場合:

- client の OpenAI キーが **別 origin に送られない**こと（`credential_unavailable` または local `GEKIYASU_PROVIDER_KEY_*` のみ）
- 最小 E2E では省略可。unit + local HTTP test で P0 は既にカバー済み

---

## 確認メモ（コミットしてよいもの / だめなもの）

| よい | だめ |
|---|---|
| 日付、OS、Proxy 版（commit hash） | API キー、Authorization ヘッダ |
| 成功/失敗、HTTP status、おおよそ latency | プロンプト全文、応答全文 |
| 使った model id（公開名） | 請求額の詳細を秘密扱いで残す必要はないが、個人識別子は避ける |
| `x-gekiyasu-offering` の id | cookie / セッション |

---

## L10 への接続（なぜ先に L11 か）

一通通したあと、統計に載せたい候補が具体化する:

- offering id / attempt log（`x-gekiyasu-attempts`）
- method（GET vs POST）・status・latency
- estimated cost（L9）vs 実際は後で手入力でも可
- 失敗 class（[FAILURE_TAXONOMY.md](./FAILURE_TAXONOMY.md)）
- **本文・キーは統計にも載せない**

L10 実装前の「何を残すか」のたたき台として使う。

---

## トラブル時（脳レス）

1. Proxy は起動しているか（`/health`）
2. base URL は `http://127.0.0.1:16191/v1` か
3. キーは env または `Authorization: Bearer` か
4. upstream ホストは allowlist 内か
5. まだダメなら [HANDOFF.md](./HANDOFF.md) のガード一覧と unit test に戻る

エージェントに頼むときは: **手順の整理・ログの redaction 確認のみ**。キーを渡さない。有償実行の代行は依頼しない。
