/**
 * Internal request/response shapes for UpstreamAdapters.
 * Not identical to any single vendor API (OpenAI is one adapter, not the model).
 */

export type InternalMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: unknown[];
};

export type InternalChatRequest = {
  offeringId: string;
  messages: InternalMessage[];
  stream?: boolean;
  tools?: unknown[];
  maxTokens?: number;
  temperature?: number;
  /** Opaque vendor extras */
  vendorParams?: Record<string, unknown>;
};

export type InternalUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  raw?: Record<string, unknown>;
};

export type InternalFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "error"
  | "unknown";

export type InternalChatResponse = {
  offeringId: string;
  message?: InternalMessage;
  finishReason?: InternalFinishReason;
  usage?: InternalUsage;
  /** Preserve rate-limit and vendor headers for executors / stats */
  responseHeaders?: Record<string, string>;
  vendorRaw?: unknown;
};
