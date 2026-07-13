# M2: Vertical Slice — 2 Providers for One Logical Model

## Tested Providers

| Provider | Endpoint | Upstream Model ID | Input $/M | Output $/M |
|----------|----------|-------------------|-----------|------------|
| OpenAI Direct | `https://api.openai.com/v1` | `gpt-4o` | 2.50 | 10.00 |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o` | 2.40 | 9.60 |

## Expected Routing Behavior

1. **Default (no constraints):** OpenRouter wins ($2.40/M < $2.50/M).
   - Request body `model: "gpt-4o"` is rewritten to `model: "openai/gpt-4o"`.
   - Upstream URL: `https://openrouter.ai/api/v1/chat/completions`

2. **Private mode (`privateMode: true`):** OpenRouter is rejected
   (`allowsPrivateCode: false`). OpenAI Direct wins.
   - Request body `model: "gpt-4o"` stays as `model: "gpt-4o"`.
   - Upstream URL: `https://api.openai.com/v1/chat/completions`

## How to Verify Manually

```bash
# Start proxy with the vertical slice feed
GEKIYASU_FEED_FILE=./fixtures/feeds/vertical-slice-2providers.json \
  npx tsx packages/proxy/src/index.ts serve

# Send a request — should route to OpenRouter (cheaper)
curl http://127.0.0.1:16191/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Hello"}]}'
```

Check the proxy logs for:
- `primary=openrouter:gpt-4o:discount`
- Upstream request sent to `https://openrouter.ai/api/v1/chat/completions`
- Body rewritten: `model: "openai/gpt-4o"`
