type Property = Record<string, unknown>;
export const stringProperty = (): Property => ({ type: 'string' });
export const id = { type: 'string', format: 'uuid' };
export const obj = { type: 'object', additionalProperties: true };
export const revision = {
  type: 'integer',
  minimum: 0,
  description:
    'Last known revision; use 0 when creating a record. A conflict requires reading the record again.',
};
export const key = {
  type: 'string',
  minLength: 8,
  maxLength: 100,
  description:
    'Stable unique key for this intended write. Reuse it only when retrying the same arguments.',
};
export const page = {
  page: { type: 'integer', minimum: 1, default: 1 },
  limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
};
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  securitySchemes: unknown[];
  annotations: Record<string, boolean>;
}
export const define = (
  name: string,
  title: string,
  description: string,
  properties: Record<string, Property> = {},
  required: string[] = [],
  write = false,
  destructive = false,
): ToolDefinition => ({
  name,
  title,
  description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
  annotations: {
    readOnlyHint: !write,
    destructiveHint: destructive,
    idempotentHint: !write || !!properties.requestId,
    openWorldHint: name === 'import_document',
  },
});
