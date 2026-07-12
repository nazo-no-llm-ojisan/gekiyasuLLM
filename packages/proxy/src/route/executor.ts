import type { IncomingMessage, ServerResponse } from "node:http";
import type { RoutePlan } from "@gekiyasu/schema";
import type { ProxyConfig } from "../config.js";
import { proxyRequest } from "../upstream.js";
import type { OfferingTarget } from "./catalog.js";

/**
 * Executes a RoutePlan via UpstreamAdapters.
 * Selection (plan) is separate; this module only honors plan.primary (fallbacks later).
 */
export type ExecutionContext = {
  plan: RoutePlan;
};

export function describeExecution(ctx: ExecutionContext): string {
  return `primary=${ctx.plan.primary}; fallbacks=${ctx.plan.fallbacks.join(",") || "-"}`;
}

/**
 * Look up plan.primary in the offering catalog.
 * Throws if primary is missing — Executor must not invent another target.
 */
export function resolvePrimaryTarget(
  plan: RoutePlan,
  catalog: Map<string, OfferingTarget>,
): OfferingTarget {
  const target = catalog.get(plan.primary);
  if (!target) {
    throw new Error(`Unknown offering in plan.primary: ${plan.primary}`);
  }
  return target;
}

export type ExecutePlanInput = {
  plan: RoutePlan;
  catalog: Map<string, OfferingTarget>;
  req: IncomingMessage;
  res: ServerResponse;
  config: ProxyConfig;
  pathWithQuery: string;
};

/**
 * Execute plan.primary only (no fallback loop yet).
 * Upstream base URL comes from the catalog entry for plan.primary.
 */
export async function executeRoutePlan(input: ExecutePlanInput): Promise<OfferingTarget> {
  const target = resolvePrimaryTarget(input.plan, input.catalog);
  await proxyRequest(
    input.req,
    input.res,
    input.config,
    input.pathWithQuery,
    target.baseUrl,
  );
  return target;
}
