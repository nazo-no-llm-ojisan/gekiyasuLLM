/**
 * Issue #14 offline vertical proof through the production HTTP handler.
 *
 * The only fake is the executor's existing upstream-attempt boundary. Tests do
 * not call a provider and do not reimplement catalog, planning, or body rewrite.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { ProxyConfig } from "../config.js";
import { createServer, type ServerDependencies } from "../server.js";
import type { AttemptFn } from "./executor.js";

const here = dirname(fileURLToPath(import.meta.url));
const verticalSliceFeedPath = join(
  here,
  "../../../../fixtures/feeds/vertical-slice-2providers.json",
);
const syntheticFeedPath = join(here, "fixtures/issue-14-synthetic-feed.json");

function verticalSliceServerConfig(): ProxyConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    upstreamBaseUrl: "https://api.openai.com/v1",
    allowedUpstreamHosts: ["api.openai.com"],
    upstreamApiKey: "offline-openai-key",
    proxyToken: "proxy-token",
    maxBodyBytes: 1_000_000,
    upstreamTimeoutMs: 1_000,
    allowPlaceholderApiKeySwap: true,
    providerApiKeys: { openrouter: "offline-openrouter-key" },
    statsFile: undefined,
    circuitFailureThreshold: 3,
    circuitOpenSeconds: 300,
    corsAllowlist: [],
    feedFile: verticalSliceFeedPath,
  };
}

function syntheticServerConfig(): ProxyConfig {
  return {
    ...verticalSliceServerConfig(),
    upstreamApiKey: undefined,
    providerApiKeys: {
      "synthetic-ineligible": "offline-ineligible-key",
      "synthetic-eligible": "offline-eligible-key",
      "synthetic-unknown": "offline-unknown-key",
    },
    feedFile: syntheticFeedPath,
  };
}

async function withInjectedServer<T>(
  config: ProxyConfig,
  dependencies: ServerDependencies,
  fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(config, dependencies);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    return await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function offlineSuccessAttempt(observedOfferingIds: string[]): AttemptFn {
  return async (target) => {
    observedOfferingIds.push(target.id);
    return {
      kind: "ok",
      offeringId: target.id,
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    };
  };
}

async function postChat(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: "Bearer proxy-token",
      "content-type": "application/json",
    },
    body: Buffer.isBuffer(body) ? Uint8Array.from(body) : JSON.stringify(body),
  });
}

describe("issue #14 actual HTTP/executor vertical proof", () => {
  it("narrows the generated feed, selects the cheaper offering, and rewrites its attempt", async () => {
    const observed: Array<{
      offeringId: string;
      baseUrl: string;
      auth: string;
      body: Buffer | undefined;
    }> = [];
    const attempt: AttemptFn = async (target, context) => {
      observed.push({
        offeringId: target.id,
        baseUrl: target.baseUrl,
        auth: context.auth,
        body: context.body,
      });
      return {
        kind: "ok",
        offeringId: target.id,
        response: new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      };
    };
    const originalBody = Buffer.from(JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: "offline proof" }],
    }));
    const originalSnapshot = Buffer.from(originalBody);

    await withInjectedServer(
      verticalSliceServerConfig(),
      { attempt },
      async (baseUrl) => {
        const response = await postChat(baseUrl, originalBody);

        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get("x-gekiyasu-route-plan"),
          "primary=openrouter:gpt-4o:discount; fallbacks=openai-direct:gpt-4o:standard",
        );
        assert.equal(observed.length, 1);
        assert.equal(observed[0]!.offeringId, "openrouter:gpt-4o:discount");
        assert.equal(observed[0]!.baseUrl, "https://openrouter.ai/api/v1");
        assert.equal(observed[0]!.auth, "Bearer offline-openrouter-key");
        assert.equal(
          (JSON.parse(observed[0]!.body!.toString("utf8")) as { model: string }).model,
          "openai/gpt-4o",
        );
        assert.deepEqual(originalBody, originalSnapshot);
        await response.arrayBuffer();
      },
    );
  });

  const capabilityCases: Array<{ name: string; body: Record<string, unknown> }> = [
    {
      name: "tools",
      body: { tools: [{ type: "function", function: { name: "lookup" } }] },
    },
    {
      name: "vision",
      body: {
        messages: [{
          role: "user",
          content: [{
            type: "image_url",
            image_url: { url: "data:image/png;base64,AA==" },
          }],
        }],
      },
    },
    { name: "streaming", body: { stream: true } },
  ];

  for (const capabilityCase of capabilityCases) {
    it(`applies the ${capabilityCase.name} requirement from RequestFacts`, async () => {
      const observedOfferingIds: string[] = [];

      await withInjectedServer(
        syntheticServerConfig(),
        { attempt: offlineSuccessAttempt(observedOfferingIds) },
        async (baseUrl) => {
          const response = await postChat(baseUrl, {
            model: "proof-model",
            messages: [],
            ...capabilityCase.body,
          });

          assert.equal(response.status, 200);
          assert.deepEqual(observedOfferingIds, [
            "synthetic-eligible:proof-model:standard",
          ]);
          await response.arrayBuffer();
        },
      );
    });
  }

  it("admits only explicit true trust in private mode", async () => {
    const observedOfferingIds: string[] = [];

    await withInjectedServer(
      syntheticServerConfig(),
      {
        attempt: offlineSuccessAttempt(observedOfferingIds),
        routingConstraints: { privateMode: true },
      },
      async (baseUrl) => {
        const response = await postChat(baseUrl, {
          model: "private-model",
          messages: [],
        });

        assert.equal(response.status, 200);
        assert.deepEqual(observedOfferingIds, [
          "synthetic-eligible:proof-model:standard",
        ]);
        await response.arrayBuffer();
      },
    );
  });

  for (const model of ["false-only-model", "unknown-only-model"]) {
    it(`makes zero attempts for ${model} in private mode`, async () => {
      let attemptCount = 0;

      await withInjectedServer(
        syntheticServerConfig(),
        {
          attempt: async () => {
            attemptCount += 1;
            throw new Error("private-mode rejection must happen before attempt");
          },
          routingConstraints: { privateMode: true },
        },
        async (baseUrl) => {
          const response = await postChat(baseUrl, { model, messages: [] });
          const payload = (await response.json()) as { error?: { code?: string } };

          assert.equal(response.status, 503);
          assert.equal(payload.error?.code, "no_eligible_offering");
          assert.equal(attemptCount, 0);
        },
      );
    });
  }

  it("fails closed for an unknown logical model with zero attempts", async () => {
    let attemptCount = 0;

    await withInjectedServer(
      verticalSliceServerConfig(),
      {
        attempt: async () => {
          attemptCount += 1;
          throw new Error("unknown model must fail before attempt");
        },
      },
      async (baseUrl) => {
        const response = await postChat(baseUrl, {
          model: "unknown-logical-model",
          messages: [],
        });
        const payload = (await response.json()) as { error?: { code?: string } };

        assert.equal(response.status, 400);
        assert.equal(payload.error?.code, "no_matching_offering");
        assert.equal(attemptCount, 0);
      },
    );
  });

  it("does not fake provider success when credentials are unavailable", async () => {
    let attemptCount = 0;
    const config = verticalSliceServerConfig();
    config.upstreamApiKey = undefined;
    config.providerApiKeys = {};

    await withInjectedServer(
      config,
      {
        attempt: async () => {
          attemptCount += 1;
          throw new Error("credential rejection must happen before attempt");
        },
      },
      async (baseUrl) => {
        const response = await postChat(baseUrl, { model: "gpt-4o", messages: [] });
        const payload = (await response.json()) as { error?: { code?: string } };

        assert.equal(response.status, 401);
        assert.equal(payload.error?.code, "credential_unavailable");
        assert.equal(attemptCount, 0);
      },
    );
  });
});
