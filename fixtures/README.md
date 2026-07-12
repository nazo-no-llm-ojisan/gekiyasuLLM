# fixtures

Replay inputs for parsers and upstream adapters. **Do not** put secrets or live API keys here.

```text
fixtures/
  pricing/<provider>/<date>.html      # pricing page snapshots
  api/openai-compatible/*.jsonl       # streaming / chat bodies
  errors/*.json                       # rate-limit, 5xx shapes
  snapshots/<hash>/                   # optional full RawSnapshot bodies
```

Tests should prefer fixtures over live network (free tiers, ToS, flaky CI).
