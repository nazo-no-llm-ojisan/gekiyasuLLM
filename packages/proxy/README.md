# gekiyasuLLMProxy

Local OpenAI-compatible proxy. Default bind: **`127.0.0.1:16191`**.

MVP: passthrough to one upstream (`/v1/chat/completions`, `/v1/models`, …). Routing comes later.

## Requirements

- Node.js 20+

## Run

```bash
cd packages/proxy
npm install
npm run dev
```

```bash
# with key in env
set OPENAI_API_KEY=sk-...   # Windows PowerShell: $env:OPENAI_API_KEY="sk-..."
npm run dev
```

## Client

Point any OpenAI-compatible client at:

```text
http://127.0.0.1:16191/v1
```

Example:

```bash
curl http://127.0.0.1:16191/health
curl http://127.0.0.1:16191/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

## Env

| Variable | Default | Meaning |
|---|---|---|
| `GEKIYASU_HOST` | `127.0.0.1` | Bind address |
| `GEKIYASU_PORT` | `16191` | Bind port |
| `GEKIYASU_UPSTREAM_BASE_URL` | `https://api.openai.com/v1` | Upstream root |
| `OPENAI_API_KEY` / `GEKIYASU_UPSTREAM_API_KEY` | — | Upstream key if client omits auth |
| `GEKIYASU_UPSTREAM_ALLOWLIST` | — | Optional comma-separated allowed upstream hosts |
| `GEKIYASU_MAX_BODY_BYTES` | 20MiB | Max buffered request body |
| `GEKIYASU_UPSTREAM_TIMEOUT_MS` | 120000 | Upstream fetch timeout |

Placeholder swap (`Bearer local` / `gekiyasu` / `sk-local` → env key) works **only when bind host is loopback**.

## License

Apache-2.0 (see repository root).
