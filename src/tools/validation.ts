interface Schema {
  type?: string;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  maxLength?: number;
  minLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: unknown[];
  pattern?: string;
  format?: string;
}

/** The small JSON Schema subset used by the published tool catalogue. */
export const validateCareerArguments = (schema: Schema, value: unknown): boolean => {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    if (
      (schema.required ?? []).some(
        (key) => !Object.hasOwn(object, key) || object[key] === undefined,
      )
    )
      return false;
    return Object.entries(object).every(([key, item]) =>
      schema.properties && Object.hasOwn(schema.properties, key)
        ? validateCareerArguments(schema.properties[key], item)
        : schema.additionalProperties !== false,
    );
  }
  if (
    schema.type === 'string' &&
    (typeof value !== 'string' ||
      value.length > (schema.maxLength ?? 12000) ||
      value.length < (schema.minLength ?? 1))
  )
    return false;
  if (
    schema.type === 'integer' &&
    (typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity))
  )
    return false;
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))
      return false;
    if (
      schema.uniqueItems &&
      new Set(value.map((item: unknown) => JSON.stringify(item))).size !== value.length
    )
      return false;
    const items = schema.items;
    if (items && !value.every((item: unknown) => validateCareerArguments(items, item)))
      return false;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.pattern && (typeof value !== 'string' || !new RegExp(schema.pattern).test(value))) {
    return false;
  }
  if (
    schema.format === 'uuid' &&
    (typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
  )
    return false;
  return true;
};
