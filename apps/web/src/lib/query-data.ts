function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function arrayFromQueryData<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is T => item !== null && item !== undefined);
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["data", "items", "rows", "result"]) {
    const nested = value[key];

    if (Array.isArray(nested)) {
      return nested.filter((item): item is T => item !== null && item !== undefined);
    }
  }

  return [];
}
