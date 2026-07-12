/** Probe failure taxonomy — do not collapse to boolean-only availability. */

export type ProbeFailureClass =
  | "dns_error"
  | "connect_timeout"
  | "http_429"
  | "http_5xx"
  | "invalid_json"
  | "empty_response"
  | "stream_interrupted"
  | "tool_schema_invalid"
  | "model_not_found"
  | "auth_error"
  | "network_error"
  | "timeout"
  | "model_mismatch_suspected"
  | "upstream_error"
  | "ok";

export type ProbeKind =
  | "connectivity"
  | "completion"
  | "streaming"
  | "tool_call"
  | "context_length"
  | "model_identity";

export type ProbeResult = {
  offeringId: string;
  kind: ProbeKind;
  ok: boolean;
  failureClass?: ProbeFailureClass;
  ttftMs?: number;
  totalMs?: number;
  region?: string;
  at: string;
  detail?: string;
};
