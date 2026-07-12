import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { parseFeedJson } from "./feed.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "../../../fixtures/offerings/one-fixed-price.json");

describe("parseFeedJson", () => {
  it("parses valid feed JSON", () => {
    const rawOffering = JSON.parse(readFileSync(fixturePath, "utf8"));
    const rawFeed = {
      feed_version: "0.1.0",
      as_of: "2026-07-12T00:00:00Z",
      endpoints: [
        {
          id: "example:api",
          providerId: "example",
          baseUrl: "https://api.openai.com/v1",
          apiCompat: "openai_chat",
        },
      ],
      offerings: [rawOffering],
      providers: [
        {
          id: "example",
          displayName: "Example Provider",
          relationships: {
            sponsored: false,
            affiliate: false,
            editorial_rank_influence: "none",
          },
          trust: {
            allowsPrivateCode: {
              value: true,
              evidence: {
                sourceUrl: "https://example.com",
                retrievedAt: "2026-07-12T00:00:00Z",
                sourceType: "manual",
                confidence: "confirmed",
              },
            },
          },
        },
      ],
    };

    const feed = parseFeedJson(rawFeed);
    assert.equal(feed.feed_version, "0.1.0");
    assert.equal(feed.as_of, "2026-07-12T00:00:00Z");
    assert.equal(feed.endpoints.length, 1);
    assert.equal(feed.endpoints[0]?.id, "example:api");
    assert.equal(feed.offerings.length, 1);
    assert.equal(feed.offerings[0]?.id, "example:gpt-mini:fixed");
    assert.equal(feed.providers?.length, 1);
    assert.equal(feed.providers[0]?.id, "example");
    assert.equal(feed.providers[0]?.trust?.allowsPrivateCode?.value, true);
  });

  it("throws on missing version", () => {
    assert.throws(
      () =>
        parseFeedJson({
          as_of: "2026-07-12T00:00:00Z",
          endpoints: [],
          offerings: [],
        }),
      /feed.feed_version must be a non-empty string/,
    );
  });
});
