export function normalizeModelsResponseJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.data)) {
    return value;
  }

  return {
    ...record,
    object: typeof record.object === "string" ? record.object : "list",
    data: record.data.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return item;
      }
      const model = item as Record<string, unknown>;
      return {
        ...model,
        object: typeof model.object === "string" ? model.object : "model",
        owned_by:
          typeof model.owned_by === "string"
            ? model.owned_by
            : typeof model.provider === "string"
              ? model.provider
              : "upstream",
      };
    }),
  };
}
