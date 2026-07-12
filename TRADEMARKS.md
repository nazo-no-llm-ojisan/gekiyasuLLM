# Trademarks and branding

**Language:** English (short). Japanese notes in [docs/design/](./docs/design/).

## What the Apache License does *not* grant

The [Apache License 2.0](./LICENSE) covers copyright (and patent) for the **software, schemas, tooling, and redistributable feed artifacts** in this repository. It does **not** grant rights to use project **names, logos, or brand identity** in a way that implies endorsement or creates confusion about origin (see Apache License §6).

## Reserved names (policy)

Until a formal trademark registration exists, the following are treated as **project brand identifiers** for community policy purposes:

- `gekiyasuLLM`
- `gekiyasuLLMProxy`
- `gekiyasuLLM.com` (domain / service name when used)

### Allowed without separate permission

- Factual reference: “compatible with gekiyasuLLM feed schema”, “fork of gekiyasuLLM”
- Required attribution notices from `LICENSE` / `NOTICE`

### Not allowed without written permission

- Using the names above as the **primary product name** of a competing or confusingly similar hosted service
- Using logos (when published) in a way that implies official endorsement
- Presenting edited feeds as “official gekiyasuLLM” without disclosure

## Editorial content vs code

| Layer | License / policy |
|---|---|
| Proxy code, CLI, CI, schema types | Apache-2.0 (`LICENSE`) |
| Feed JSON structure, machine-readable fields | Apache-2.0 |
| Factual excerpts with provenance (`as_of`, source URL) | Redistributable with the feed under Apache-2.0; still **not a warranty of accuracy** |
| Project name / logo | Trademark policy (this file), not open-branded |
| Site marketing copy (future) | May be dual-licensed or all-rights-reserved; will be labeled when published |

This split exists so others can **inspect, fork, and verify** the system without us claiming “trust us”—while still preventing brand confusion.
