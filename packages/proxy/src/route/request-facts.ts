/**
 * Extract a `RequestFacts` from the HTTP request (and its body).
 *
 * Pure with respect to the inputs: takes a body Buffer (already buffered
 * by the caller) plus a few request signals (method, path, headers). Does
 * no I/O, no JSON mutation, no shared state. The caller is responsible
 * for body ownership (T-044-prep: buffer the body once and pass it here).
 *
 * Today only the OpenAI-style chat body shape is recognized:
 *   - `model` (top-level string)        -> facts.requestedModel
 *   - `stream` (top-level boolean)      -> facts.streaming
 *   - `tools` (top-level array, len>0)  -> facts.requiresTools
 *   - `messages[*].content` (any item)  -> facts.requiresVision if any
 *                                         item is an array containing an
 *                                         object with `type:"image_url"`
 * Other vendors are out of scope for MVP.
 */

import type { RequestFacts } from "@gekiyasu/schema";

export type ExtractRequestFactsInput = {
  method?: string;
  /**
   * Request path (e.g. `/v1/chat/completions`). Reserved for future
   * per-path model-id conventions (vendor-specific shapes). Not used by
   * the OpenAI-style body inspector today.
   */
  path?: string;
  contentType?: string;
  body?: Buffer;
};

export function extractRequestFacts(
  input: ExtractRequestFactsInput,
): RequestFacts {
  const facts: RequestFacts = {};

  if (!input.body || input.body.length === 0) {
    return facts;
  }
  if (input.method === "GET" || input.method === "HEAD") {
    return facts;
  }
  if (input.contentType && !input.contentType.toLowerCase().includes("application/json")) {
    // Only JSON bodies carry a model. Non-JSON bodies are passed through
    // untouched (e.g. multipart upload, plain text).
    return facts;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.body.toString("utf8"));
  } catch {
    return facts;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return facts;
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.model === "string" && obj.model.length > 0) {
    facts.requestedModel = obj.model;
  }
  if (obj.stream === true) {
    facts.streaming = true;
  }
  if (Array.isArray(obj.tools) && obj.tools.length > 0) {
    facts.requiresTools = true;
  }
  if (Array.isArray(obj.messages)) {
    for (const m of obj.messages) {
      if (!m || typeof m !== "object") continue;
      const content = (m as Record<string, unknown>).content;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part && typeof part === "object") {
            const type = (part as Record<string, unknown>).type;
            if (type === "image_url") {
              facts.requiresVision = true;
              return facts; // short-circuit: vision is sticky once seen
            }
          }
        }
      }
    }
  }
  return facts;
}
