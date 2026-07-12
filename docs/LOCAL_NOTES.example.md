# ローカル運用メモ（テンプレート）

**このファイルはコミットする。** 実体は `docs/LOCAL_NOTES.md`（gitignore）にコピーして埋める。

```bash
cp docs/LOCAL_NOTES.example.md docs/LOCAL_NOTES.md
```

## 書いてよいこと / 書いてはいけないこと

| よい | だめ |
|------|------|
| この PC での起動方法（pm2 / cmd） | API キー、proxy token、JWT の実値 |
| ポート番号、アプリ名、パス | `.env` の中身 |
| 確認済み日、他 IDE の接続メモ | 本番秘密・個人識別子の詳細 |
| resurrect / startup を誰がやるか | `~/.pm2/dump.pm2` の貼り付け |

秘密の値は `packages/proxy/.env` のみ。

---

## このマシン

- OS / シェル:
- リポジトリ path:
- proxy 起動: pm2 / `scripts\start-proxy-windows.cmd` / その他
- pm2 アプリ名: `gekiyasu-proxy`（既定）
- `pm2 save` 済み: yes / no
- ログオフ・再起動後の resurrect: **自分でやる** / 未設定 / Task Scheduler 等

## エンドポイント（形だけ）

- Proxy base: `http://127.0.0.1:16191/v1`
- Health: `http://127.0.0.1:16191/health`
- API Key 欄: `packages/proxy/.env` の `GEKIYASU_PROXY_TOKEN` **値のみ**
  - `Bearer ` プレフィックスなし
  - `gekiyasu-proxy:` なし

## クライアント

- OpenWebUI URL / port:
- 他 IDE:
- 疎通確認日:

## 診断メモ

- stats: `packages/proxy/data/stats.jsonl`
- pm2 logs: `pm2 logs gekiyasu-proxy`
- `content-encoding` が残ると aiohttp 系クライアントが落ちることがある（proxy 側で除去済み想定）
- 認証拒否時: proxy ログの `proxy_token_rejected` / `authShape`

## エージェント向け

- proxy の起動・停止・resurrect は **ローカル運用者がやる**（エージェント常駐管理にしない）
- コード変更後: `npm --prefix packages/proxy run build` → `pm2 restart gekiyasu-proxy`
