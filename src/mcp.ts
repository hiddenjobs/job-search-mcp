import type { Authenticate, AuthResult } from './auth.ts';
const RESOURCE_METADATA = 'https://hiddenjobs.dev/.well-known/oauth-protected-resource/mcp';
const SCOPE = 'email';
export type Jobs = {
  search: (params: Record<string, unknown>) => Promise<unknown>;
  get: (id: string) => Promise<unknown>;
  subscribed: (userId: string) => Promise<boolean>;
  link: (id: string) => Promise<string | null>;
};
const challengeHeader = (metadataUrl: string, scope: string, error = 'invalid_token') =>
  `Bearer resource_metadata="${metadataUrl}", error="${error}", error_description="Authorize Hidden Jobs access.", scope="${scope}"`;
const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'MCP-Protocol-Version': '2025-06-18',
};
const response = (id: unknown, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers });
const error = (id: unknown, code: number, message: string) =>
  new Response(
    JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }),
    { headers },
  );
const toolError = (message: string, status: number, code: string) => ({
  isError: true,
  content: [{ type: 'text', text: message }],
  structuredContent: { error: code, status },
});
const string = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const integer = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) && value !== undefined
    ? Math.max(1, Math.floor(Number(value)))
    : fallback;
const tools = [
  {
    name: 'search_jobs',
    description: 'Search remote technology job offers. Original application URLs are excluded.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        category: { type: 'string' },
        employmentType: { type: 'string' },
        jobType: { type: 'string' },
        remoteLocation: { type: 'string' },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
    securitySchemes: [{ type: 'oauth2', scopes: [SCOPE] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'get_job',
    description: 'Read one remote job offer, excluding its original application URL.',
    inputSchema: {
      type: 'object',
      properties: { idOrSlug: { type: 'string' } },
      required: ['idOrSlug'],
      additionalProperties: false,
    },
    securitySchemes: [{ type: 'oauth2', scopes: [SCOPE] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'open_application_link',
    description:
      'Get the original application URL. Requires an active Hidden Jobs Access subscription.',
    inputSchema: {
      type: 'object',
      properties: { idOrSlug: { type: 'string' } },
      required: ['idOrSlug'],
      additionalProperties: false,
    },
    securitySchemes: [{ type: 'oauth2', scopes: [SCOPE] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
];

export function createMcpHandler(
  authenticate: Authenticate,
  jobs: Jobs,
  metadataUrl = RESOURCE_METADATA,
) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { Allow: 'POST, OPTIONS' },
      });
    }
    if (req.method !== 'POST') {
      return new Response(null, {
        status: 405,
        headers: { Allow: 'POST, OPTIONS' },
      });
    }
    if (Number(req.headers.get('content-length') || 0) > 16384) {
      return new Response(null, { status: 413 });
    }
    let message;
    try {
      const body = await req.text();
      if (body.length > 16384) return new Response(null, { status: 413 });
      message = JSON.parse(body);
    } catch {
      return error(null, -32700, 'Parse error');
    }
    if (
      !message || typeof message !== 'object' || Array.isArray(message) ||
      message.jsonrpc !== '2.0' || typeof message.method !== 'string'
    ) return error(null, -32600, 'Invalid Request');
    const id = message.id ?? null;
    if (message.method.startsWith('notifications/')) {
      return new Response(null, { status: 202 });
    }
    if (message.method === 'ping') return response(id, {});
    if (message.method === 'initialize') {
      return response(id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hidden-jobs-mcp-oauth', version: '2.0.0' },
      });
    }
    if (message.method === 'tools/list') return response(id, { tools });
    if (message.method !== 'tools/call') {
      return error(id, -32601, 'Method not found');
    }
    const name = string(message.params?.name);
    if (!tools.some((t) => t.name === name)) {
      return error(id, -32602, 'Unknown tool');
    }
    const args = message.params?.arguments ?? {};
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return error(id, -32602, 'Invalid tool arguments');
    }
    const scope = SCOPE;
    const token = req.headers.get('authorization')?.match(
      /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i,
    )?.[1] || '';
    let auth: AuthResult;
    try {
      auth = token ? await authenticate(token) : { ok: false, reason: 'invalid' };
    } catch {
      return response(
        id,
        toolError(
          'Authentication is temporarily unavailable.',
          503,
          'backend_error',
        ),
      );
    }
    if (!auth.ok) {
      if (['rate_limit', 'monthly_limit'].includes(auth.reason)) {
        return response(
          id,
          toolError(
            'This connection has reached its request limit.',
            429,
            auth.reason,
          ),
        );
      }
      if (auth.reason === 'backend_error') {
        return response(
          id,
          toolError(
            'Authentication is temporarily unavailable.',
            503,
            auth.reason,
          ),
        );
      }
      const www = challengeHeader(
        metadataUrl,
        scope,
        auth.reason === 'scope' ? 'insufficient_scope' : 'invalid_token',
      );
      const result = {
        ...toolError(
          'Authorization required.',
          auth.reason === 'scope' ? 403 : 401,
          auth.reason,
        ),
        _meta: { 'mcp/www_authenticate': [www] },
      };
      return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
        status: auth.reason === 'scope' ? 403 : 401,
        headers: { ...headers, 'WWW-Authenticate': www },
      });
    }
    try {
      let payload;
      if (name === 'search_jobs') {
        payload = await jobs.search({
          ...args,
          page: integer(args.page, 1),
          limit: Math.min(50, integer(args.limit, 10)),
        });
      } else {
        const idOrSlug = string(args.idOrSlug);
        if (!idOrSlug) {
          return response(
            id,
            toolError('idOrSlug is required.', 400, 'invalid_arguments'),
          );
        }
        if (name === 'get_job') payload = await jobs.get(idOrSlug);
        else {
          if (!auth.userId || !await jobs.subscribed(auth.userId)) {
            return response(
              id,
              toolError(
                'An active Hidden Jobs Access subscription is required.',
                402,
                'subscription_required',
              ),
            );
          }
          const url = await jobs.link(idOrSlug);
          payload = url ? { url } : null;
        }
      }
      if (!payload) {
        return response(id, toolError('Job not found.', 404, 'not_found'));
      }
      const wrapped = { data: payload };
      return response(id, {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(wrapped) }],
        structuredContent: wrapped,
      });
    } catch {
      return response(
        id,
        toolError('Unable to load jobs.', 500, 'backend_error'),
      );
    }
  };
}
