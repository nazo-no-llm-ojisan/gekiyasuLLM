import type { RoutePlan } from "@gekiyasu/schema";

/**
 * Executes a RoutePlan via UpstreamAdapters.
 * Current MVP still uses direct OpenAI-compatible fetch in upstream.ts;
 * this module records the plan so selection and execution stay separable.
 */
export type ExecutionContext = {
  plan: RoutePlan;
};

export function describeExecution(ctx: ExecutionContext): string {
  return `primary=${ctx.plan.primary}; fallbacks=${ctx.plan.fallbacks.join(",") || "-"}`;
}
