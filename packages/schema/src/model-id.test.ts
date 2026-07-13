import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseModelId, resolveDeveloper } from "./model-id.js";

// ── parseModelId ─────────────────────────────────────────────────────────────

describe("parseModelId", () => {
  // ── Existing tests (preserved) ─────────────────────────────────────────────

  it("parses basic provider and family", () => {
    const parsed = parseModelId("openai/gpt-4o");

    assert.equal(parsed.provider, "openai");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.version, "4o");
    assert.equal(parsed.rawId, "openai/gpt-4o");
    assert.equal(parsed.accessVariant, undefined);
    assert.equal(parsed.developer, "openai");
  });

  it("returns provider=unknown when no slash present", () => {
    const parsed = parseModelId("gpt-4o");

    assert.equal(parsed.provider, "unknown");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.version, "4o");
    assert.equal(parsed.developer, "openai");
    assert.equal(parsed.rawId, "gpt-4o");
  });

  it("distinguishes raw, normalized, and deprecated provider fields", () => {
    const cases = [
      {
        raw: "zhipu/glm-5.2",
        rawProvider: "zhipu",
        normalizedProvider: "z-ai",
      },
      {
        raw: "~openai/gpt-4o",
        rawProvider: "~openai",
        normalizedProvider: "openai",
      },
      {
        raw: "gpt-4o",
        rawProvider: "unknown",
        normalizedProvider: "unknown",
      },
    ] as const;

    for (const fixture of cases) {
      const parsed = parseModelId(fixture.raw);

      assert.equal(parsed.rawProvider, fixture.rawProvider);
      assert.equal(parsed.normalizedProvider, fixture.normalizedProvider);
      assert.equal(parsed.provider, parsed.rawProvider);
    }
  });

  // ── Contract test cases ────────────────────────────────────────────────────

  // Test 1: openai/gpt-4o-mini:free
  it("openai/gpt-4o-mini:free → provider=openai, family=gpt-4o, derivative=mini, accessVariant=free, developer=openai", () => {
    const parsed = parseModelId("openai/gpt-4o-mini:free");

    assert.equal(parsed.provider, "openai");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.derivative, "mini");
    assert.equal(parsed.accessVariant, "free");
    assert.equal(parsed.developer, "openai");
    assert.equal(parsed.version, "4o");
    assert.equal(parsed.canonicalKey, "openai|gpt-4o|4o|mini");
  });

  // Test 2: fireworks/glm-5.2:flex
  // Provider is infrastructure → developer inferred from family (z-ai)
  it("fireworks/glm-5.2:flex → provider=fireworks, family=glm-5.2, version=5.2, accessVariant=flex, developer=z-ai", () => {
    const parsed = parseModelId("fireworks/glm-5.2:flex");

    assert.equal(parsed.provider, "fireworks");
    assert.equal(parsed.family, "glm-5.2");
    assert.equal(parsed.version, "5.2");
    assert.equal(parsed.accessVariant, "flex");
    assert.equal(parsed.developer, "z-ai");
    assert.equal(parsed.canonicalKey, "z-ai|glm-5.2|5.2|");
  });

  // Test 3: anthropic/claude-3.5-sonnet
  it("anthropic/claude-3.5-sonnet → provider=anthropic, family=claude-3.5-sonnet, developer=anthropic", () => {
    const parsed = parseModelId("anthropic/claude-3.5-sonnet");

    assert.equal(parsed.provider, "anthropic");
    assert.equal(parsed.family, "claude-3.5-sonnet");
    assert.equal(parsed.developer, "anthropic");
    assert.equal(parsed.canonicalKey, "anthropic|claude-3.5-sonnet||");
  });

  // Test 4: gpt-4o (no provider)
  // provider=unknown, developer=openai (inferred from family)
  it("gpt-4o (no provider) → provider=unknown, family=gpt-4o, developer=openai", () => {
    const parsed = parseModelId("gpt-4o");

    assert.equal(parsed.provider, "unknown");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.version, "4o");
    assert.equal(parsed.developer, "openai");
    assert.equal(parsed.canonicalKey, "openai|gpt-4o|4o|");
  });

  // Test 5: meta-llama/llama-3.1-70b-instruct
  it("meta-llama/llama-3.1-70b-instruct → provider=meta-llama, family=llama-3.1, derivative includes 70b", () => {
    const parsed = parseModelId("meta-llama/llama-3.1-70b-instruct");

    assert.equal(parsed.provider, "meta-llama");
    assert.equal(parsed.family, "llama-3.1");
    assert.equal(parsed.version, "3.1");
    assert.equal(parsed.developer, "meta-llama");
    // derivative should capture "70b-instruct" or at least "70b"
    assert.ok(parsed.derivative, "derivative should be defined");
    assert.ok(parsed.derivative.includes("70b"), `derivative should include "70b", got: ${parsed.derivative}`);
  });

  // ── Additional edge cases ──────────────────────────────────────────────────

  it("region extraction: model@us-east-1", () => {
    const parsed = parseModelId("openai/gpt-4o@us-east");

    assert.equal(parsed.provider, "openai");
    assert.equal(parsed.family, "gpt-4o");
    assert.equal(parsed.region, "us-east");
    assert.equal(parsed.version, "4o");
    assert.equal(parsed.developer, "openai");
  });

  it("special family prefix o3 is not split into version", () => {
    const parsed = parseModelId("openai/o3");

    assert.equal(parsed.provider, "openai");
    assert.equal(parsed.family, "o3");
    assert.equal(parsed.version, undefined, "o3 should be family, not split into version");
    assert.equal(parsed.developer, "openai");
  });

  it("special family prefix o1 is not split into version", () => {
    const parsed = parseModelId("openai/o1-mini");

    assert.equal(parsed.provider, "openai");
    assert.equal(parsed.family, "o1");
    assert.equal(parsed.derivative, "mini");
    assert.equal(parsed.developer, "openai");
  });

  it("infrastructure provider (groq) with llama family → developer=meta-llama", () => {
    const parsed = parseModelId("groq/llama-3.1-70b-versatile");

    assert.equal(parsed.provider, "groq");
    assert.equal(parsed.developer, "meta-llama");
    assert.ok(parsed.family.startsWith("llama"), `family should start with "llama", got: ${parsed.family}`);
  });

  it("canonicalKey excludes accessVariant", () => {
    const withFree = parseModelId("openai/gpt-4o:free");
    const withoutFree = parseModelId("openai/gpt-4o");

    assert.equal(withFree.canonicalKey, withoutFree.canonicalKey,
      "canonicalKey should be identical regardless of accessVariant");
  });

  it("preserves colon-less chat and instruct as access variants", () => {
    for (const access of ["chat", "instruct"] as const) {
      const colon = parseModelId(`provider/foo:${access}`);
      const colonLess = parseModelId(`provider/foo-${access}`);
      const withoutProvider = parseModelId(`foo-${access}`);

      assert.equal(colonLess.accessVariant, access);
      assert.equal(withoutProvider.accessVariant, access);
      assert.equal(colonLess.canonicalKey, colon.canonicalKey);
      assert.equal(withoutProvider.family, "foo");
    }
  });

  it("separates colon-less access from derivative suffixes", () => {
    for (const fixture of [
      { base: "meta-llama/llama-3.1-70b", access: "instruct", derivative: "70b" },
      { base: "openai/gpt-4o-mini", access: "chat", derivative: "mini" },
    ] as const) {
      const colon = parseModelId(`${fixture.base}:${fixture.access}`);
      const colonLess = parseModelId(`${fixture.base}-${fixture.access}`);

      assert.equal(colonLess.derivative, fixture.derivative);
      assert.equal(colonLess.accessVariant, fixture.access);
      assert.equal(colonLess.canonicalKey, colon.canonicalKey);
    }
  });

  it("keeps date and region metadata identical across access syntaxes", () => {
    for (const fixture of [
      {
        colon: "anthropic/claude-sonnet-2024-08-06:instruct",
        colonLess: "anthropic/claude-sonnet-2024-08-06-instruct",
        access: "instruct",
        region: undefined,
      },
      {
        colon: "provider/foo@us-east:chat",
        colonLess: "provider/foo@us-east-chat",
        access: "chat",
        region: "us-east",
      },
    ] as const) {
      const colon = parseModelId(fixture.colon);
      const colonLess = parseModelId(fixture.colonLess);

      assert.equal(colonLess.accessVariant, fixture.access);
      assert.equal(colonLess.region, fixture.region);
      assert.equal(colonLess.family, colon.family);
      assert.equal(colonLess.version, colon.version);
      assert.equal(colonLess.canonicalKey, colon.canonicalKey);
    }
  });

  it("fails safe when removing an access suffix would leave an invalid family", () => {
    for (const fixture of [
      { raw: "provider/-chat", family: "-chat" },
      { raw: "provider/foo--instruct", family: "foo--instruct" },
      { raw: "-chat", family: "-chat" },
      { raw: "provider/:chat", family: ":chat" },
    ] as const) {
      const parsed = parseModelId(fixture.raw);

      assert.equal(parsed.family, fixture.family);
      assert.equal(parsed.accessVariant, undefined);
    }
  });

  it("does not detect chat or instruct inside a model name", () => {
    for (const raw of [
      "provider/chat-foo",
      "provider/foo-chat-model",
      "provider/instructive-model",
      "provider/foo-instruct-v2",
    ]) {
      const parsed = parseModelId(raw);

      assert.equal(parsed.accessVariant, undefined);
      assert.equal(parsed.family, raw.slice(raw.indexOf("/") + 1));
    }
  });

  it("keeps the canonical identity contract across provider and model forms", () => {
    const fixtures = [
      {
        label: "direct provider",
        raw: "openai/gpt-4o",
        normalizedProvider: "openai",
        developer: "openai",
        canonicalKey: "openai|gpt-4o|4o|",
      },
      {
        label: "hosted provider",
        raw: "fireworks/glm-5.2",
        normalizedProvider: "fireworks",
        developer: "z-ai",
        canonicalKey: "z-ai|glm-5.2|5.2|",
      },
      {
        label: "provider-less unknown",
        raw: "some-random-model",
        normalizedProvider: "unknown",
        developer: "unknown",
        canonicalKey: "unknown|some-random-model||",
      },
      {
        label: "unrecognized provider remains unrecognized",
        raw: "mystery/gpt-4o",
        normalizedProvider: "mystery",
        developer: "mystery",
        canonicalKey: "mystery|gpt-4o|4o|",
      },
      {
        label: "provider alias",
        raw: "zhipu/glm-5.2",
        normalizedProvider: "z-ai",
        developer: "z-ai",
        canonicalKey: "z-ai|glm-5.2|5.2|",
      },
      {
        label: "family-to-developer mapping",
        raw: "unknown/gpt-4o",
        normalizedProvider: "unknown",
        developer: "openai",
        canonicalKey: "openai|gpt-4o|4o|",
      },
      {
        label: "date version",
        raw: "anthropic/claude-sonnet-2024-08-06",
        normalizedProvider: "anthropic",
        developer: "anthropic",
        canonicalKey: "anthropic|claude-sonnet|2024-08-06|",
      },
      {
        label: "derivative",
        raw: "openai/gpt-4o-mini",
        normalizedProvider: "openai",
        developer: "openai",
        canonicalKey: "openai|gpt-4o|4o|mini",
      },
      {
        label: "access variant",
        raw: "openai/gpt-4o-mini-instruct",
        normalizedProvider: "openai",
        developer: "openai",
        canonicalKey: "openai|gpt-4o|4o|mini",
      },
      {
        label: "alias marker",
        raw: "~openai/gpt-4o",
        normalizedProvider: "openai",
        developer: "openai",
        canonicalKey: "openai|gpt-4o|4o|",
      },
    ] as const;

    for (const fixture of fixtures) {
      const parsed = parseModelId(fixture.raw);

      assert.equal(parsed.normalizedProvider, fixture.normalizedProvider, fixture.label);
      assert.equal(parsed.developer, fixture.developer, fixture.label);
      assert.equal(parsed.canonicalKey, fixture.canonicalKey, fixture.label);
    }
  });

  it("tilde prefix on provider is stripped", () => {
    const parsed = parseModelId("~openai/gpt-4o");

    assert.equal(parsed.developer, "openai");
    assert.equal(parsed.provider, "~openai");
  });
});

// ── resolveDeveloper ─────────────────────────────────────────────────────────

describe("resolveDeveloper", () => {
  it("normalizes provider aliases (zhipu → z-ai)", () => {
    assert.equal(resolveDeveloper("zhipu", "glm-5.2"), "z-ai");
  });

  it("infrastructure provider infers developer from family", () => {
    assert.equal(resolveDeveloper("fireworks", "gpt-4o"), "openai");
    assert.equal(resolveDeveloper("fireworks", "glm-5.2"), "z-ai");
    assert.equal(resolveDeveloper("groq", "llama-3.1"), "meta-llama");
    assert.equal(resolveDeveloper("together", "mistral-large"), "mistral");
  });

  it("non-infrastructure provider returns normalized provider", () => {
    assert.equal(resolveDeveloper("openai", "gpt-4o"), "openai");
    assert.equal(resolveDeveloper("anthropic", "claude-3.5"), "anthropic");
  });

  it("unknown provider with recognizable family returns inferred developer", () => {
    assert.equal(resolveDeveloper("unknown", "gpt-4o"), "openai");
    assert.equal(resolveDeveloper("unknown", "claude-3.5-sonnet"), "anthropic");
  });

  it("unknown provider with unrecognizable family returns unknown", () => {
    assert.equal(resolveDeveloper("unknown", "some-random-model"), "unknown");
  });

  it("infrastructure provider with unrecognizable family returns unknown", () => {
    assert.equal(resolveDeveloper("fireworks", "some-custom-model"), "unknown");
  });
});
