# gekiyasuLLMProxy

Local OpenAI-compatible proxy. Default bind: **`127.0.0.1:16191`**.

MVP: passthrough + RoutePlan (filter/rank) + executor fallback (**GET/HEAD only**) + static feed catalog + minimal cost estimate.

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

Dashboard (static demo): `http://127.0.0.1:16191/dashboard/`

## Credential & routing policy (important)

| Rule | Behavior |
|---|---|
| Client `Authorization` | Forwarded **only** when the target offering origin equals the exact origin of `GEKIYASU_UPSTREAM_BASE_URL` / `upstreamBaseUrl`. |
| Other feed origins | Never reuse the client key. Use proxy-owned `providerApiKeys[providerId]` only; otherwise skip with `credential_unavailable` (no upstream call). |
| Placeholder keys (`Bearer local` / `gekiyasu` / `sk-local`) | Swapped to the configured upstream key **only** on loopback bind **and** configured upstream origin. |
| Upstream request headers | **Allowlist** (`content-type`, `accept`, `accept-language`, `user-agent`, optional OpenAI org/project / idempotency-key). Never copy client `authorization`, `cookie`, `x-api-key`, `x-gekiyasu-token`, `proxy-authorization`. |
| Fallback | **GET/HEAD:** on 408/429/5xx/timeout/network → try next offering. **POST/PATCH/PUT/DELETE:** never auto-fallback (avoids double charge). Upstream error status/body is passed through when available. |

## Env

| Variable | Default | Meaning |
|---|---|---|
| `GEKIYASU_HOST` | `127.0.0.1` | Bind address |
| `GEKIYASU_PORT` | `16191` | Bind port |
| `GEKIYASU_UPSTREAM_BASE_URL` | `https://api.openai.com/v1` | Configured upstream root (also defines the only origin that may receive client Authorization) |
| `OPENAI_API_KEY` / `GEKIYASU_UPSTREAM_API_KEY` | — | Default upstream key if client omits auth (configured origin only) |
| `GEKIYASU_PROVIDER_KEY_<ID>` | — | Proxy-owned key for feed provider id (lowercase suffix), e.g. `GEKIYASU_PROVIDER_KEY_ANTHROPIC` |
| Standard provider envs | — | Also loaded into `providerApiKeys` when set: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` |
| `GEKIYASU_UPSTREAM_ALLOWLIST` | host of base URL | Extra allowed upstream hosts (comma-separated). Base URL host is always included. |
| `GEKIYASU_FEED_FILE` | — | Path to static feed JSON (expands offering catalog + allowed hosts) |
| `GEKIYASU_PROXY_TOKEN` | — | If set, `/v1/*` requires `X-Gekiyasu-Token` (or `Authorization: Bearer gekiyasu-proxy:<token>`). `/health` stays open. |
| `GEKIYASU_MAX_BODY_BYTES` | 20MiB | Max buffered request body |
| `GEKIYASU_UPSTREAM_TIMEOUT_MS` | 120000 | Upstream fetch timeout |

Every upstream fetch (including feed `base_url`) is checked with the allowlist + https/loopback rules. Private/link-local IPs are blocked (except loopback http for local tests).

## License

Apache-2.0 (see repository root).
