/**
 * Pure helpers for rewriting the request body for one Offering (T-044).
 *
 * The request body is a JSON object. Today we only rewrite the top-level
 * `model` field with the offering's `upstreamModelId`. If a future adapter
 * needs more (tools remap, message-merge, etc.) it goes here.
 *
 * Rules:
 * - Pure: input Buffer is never mutated. A new Buffer is always returned.
 * - If the body is not valid JSON, the original bytes are returned unchanged
 *   (caller will surface the parse error elsewhere).
 * - If the JSON does not have a `model` field, the bytes are returned
 *   unchanged — there is nothing to rewrite.
 */

export type UpstreamModelId = string;

export type BodyRewriteTarget = {
  /** What to write into the upstream `model` field. */
  upstreamModelId: UpstreamModelId;
};

/**
 * Returns a NEW Buffer with `model` replaced by `target.upstreamModelId`.
 * Never mutates `originalBody`. If the body is not valid JSON or has no
 * `model` field, returns the original bytes unchanged (but still a new
 * Buffer wrapper is not promised in that case — equal-by-content is OK).
 */
export function rewriteModelForOffering(
  originalBody: Buffer,
  target: BodyRewriteTarget,
): Buffer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(originalBody.toString("utf8"));
  } catch {
    return originalBody;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return originalBody;
  }
  const obj = parsed as Record<string, unknown>;
  if (!("model" in obj) || typeof obj.model !== "string") {
    return originalBody;
  }
  if (obj.model === target.upstreamModelId) {
    // No-op rewrite: return a fresh buffer to keep the "never mutate" rule
    // trivially true for callers that compare by reference.
    return Buffer.from(JSON.stringify(obj), "utf8");
  }
  const rewritten: Record<string, unknown> = { ...obj, model: target.upstreamModelId };
  return Buffer.from(JSON.stringify(rewritten), "utf8");
}
