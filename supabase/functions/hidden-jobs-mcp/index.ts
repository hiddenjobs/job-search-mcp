import { corsHeaders } from '../_shared/cors.ts';

const protocolVersion = '2025-06-18';
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ||
  Deno.env.get('PUBLIC_SUPABASE_ANON_KEY');
const apiBaseUrl = (
  Deno.env.get('HIDDEN_JOBS_API_URL') ||
  (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/api-v1` : '')
).replace(/\/$/, '');

const mcpHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
  'MCP-Protocol-Version': protocolVersion,
};

const jsonRpcResponse = (id: unknown, result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers: mcpHeaders });

const jsonRpcError = (id: unknown, code: number, message: string, data?: unknown) =>
  new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(typeof data === 'undefined' ? {} : { data }) },
    }),
    { headers: mcpHeaders },
  );

const toolDefinitions = [
  {
    name: 'search_jobs',
    description:
      'Search Hidden Jobs offers. Returns public job details but never the original application URL.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords, role, skills, or company.' },
        category: { type: 'string' },
        employmentType: { type: 'string' },
        jobType: { type: 'string' },
        remoteLocation: {
          type: 'string',
          description: 'For example: Worldwide, US, Europe, Spain, or Germany.',
        },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_job',
    description: 'Get the public details and description of one Hidden Jobs offer.',
    inputSchema: {
      type: 'object',
      properties: {
        idOrSlug: { type: 'string', description: 'The job id or slug returned by search_jobs.' },
      },
      required: ['idOrSlug'],
      additionalProperties: false,
    },
  },
  {
    name: 'open_application_link',
    description:
      'Get the original application link. The API key owner must have an active Hidden Jobs Access subscription.',
    inputSchema: {
      type: 'object',
      properties: {
        idOrSlug: { type: 'string', description: 'The job id or slug returned by search_jobs.' },
      },
      required: ['idOrSlug'],
      additionalProperties: false,
    },
  },
];

const asArguments = (value: unknown) =>
  value && typeof value === 'object' ? value as Record<string, unknown> : {};

const getString = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const getPositiveInteger = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
};

const callApi = async (
  req: Request,
  path: string,
  method = 'GET',
  body?: unknown,
) => {
  if (!apiBaseUrl) {
    return { ok: false, status: 503, payload: { error: 'Hidden Jobs API is not configured.' } };
  }

  const headers = new Headers({ Accept: 'application/json' });
  if (supabaseAnonKey) headers.set('apikey', supabaseAnonKey);
  const authorization = req.headers.get('Authorization');
  if (authorization) headers.set('Authorization', authorization);
  if (typeof body !== 'undefined') headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: typeof body === 'undefined' ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({ error: 'Invalid API response.' }));
  return { ok: response.ok, status: response.status, payload };
};

const toolError = (message: string, code?: string, status?: number) => ({
  isError: true,
  content: [{ type: 'text', text: message }],
  ...(code || status ? { structuredContent: { error: code || 'tool_error', status } } : {}),
});

const toolSuccess = (payload: unknown) => ({
  isError: false,
  content: [{ type: 'text', text: JSON.stringify(payload) }],
  structuredContent: payload,
});

const callTool = async (req: Request, name: string, rawArguments: unknown) => {
  const args = asArguments(rawArguments);

  if (name === 'search_jobs') {
    const params = new URLSearchParams();
    const query = getString(args.query);
    const category = getString(args.category);
    const employmentType = getString(args.employmentType);
    const jobType = getString(args.jobType);
    const remoteLocation = getString(args.remoteLocation);
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    if (employmentType) params.set('employmentType', employmentType);
    if (jobType) params.set('jobType', jobType);
    if (remoteLocation) params.set('remoteLocation', remoteLocation);
    params.set('page', String(getPositiveInteger(args.page, 1)));
    params.set('limit', String(Math.min(50, getPositiveInteger(args.limit, 10))));

    const result = await callApi(req, `/jobs?${params.toString()}`);
    if (!result.ok) {
      return toolError(
        String(result.payload?.error || 'Unable to search Hidden Jobs.'),
        String(result.payload?.code || 'api_error'),
        result.status,
      );
    }
    return toolSuccess(result.payload);
  }

  const idOrSlug = getString(args.idOrSlug || args.jobId || args.id);
  if (!idOrSlug) return toolError('idOrSlug is required.', 'invalid_arguments', 400);
  const encodedId = encodeURIComponent(idOrSlug);

  if (name === 'get_job') {
    const result = await callApi(req, `/jobs/${encodedId}`);
    if (!result.ok) {
      return toolError(
        String(result.payload?.error || 'Unable to load this job.'),
        String(result.payload?.code || 'api_error'),
        result.status,
      );
    }
    return toolSuccess(result.payload);
  }

  if (name === 'open_application_link') {
    const result = await callApi(req, `/jobs/${encodedId}/application-link`, 'POST');
    if (!result.ok) {
      const message = result.status === 402
        ? 'An active Hidden Jobs Access subscription is required to access the original application link.'
        : String(result.payload?.error || 'Unable to open the application link.');
      return toolError(message, String(result.payload?.code || 'api_error'), result.status);
    }
    return toolSuccess(result.payload);
  }

  return toolError(`Unknown tool: ${name}`, 'unknown_tool', 404);
};

const handleMessage = async (req: Request, message: unknown) => {
  if (!message || typeof message !== 'object') {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  const request = message as { id?: unknown; method?: unknown; params?: unknown };
  const id = typeof request.id === 'undefined' ? null : request.id;
  const method = typeof request.method === 'string' ? request.method : '';

  if (!method) return jsonRpcError(id, -32600, 'Invalid Request');
  if (method.startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: mcpHeaders });
  }

  if (method === 'ping') return jsonRpcResponse(id, {});

  if (method === 'initialize') {
    return jsonRpcResponse(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'hidden-jobs-mcp', version: '1.0.0' },
      instructions:
        'Use search_jobs and get_job for public data. Use open_application_link only when the user has an active subscription.',
    });
  }

  if (method === 'tools/list') {
    return jsonRpcResponse(id, { tools: toolDefinitions });
  }

  if (method === 'tools/call') {
    const params = asArguments(request.params);
    const name = getString(params.name);
    if (!name) return jsonRpcError(id, -32602, 'Tool name is required.');
    const result = await callTool(req, name, params.arguments);
    return jsonRpcResponse(id, result);
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { ...mcpHeaders, Allow: 'POST, OPTIONS' },
    });
  }

  const body = await req.json().catch(() => null);
  if (Array.isArray(body)) {
    const responses = [];
    for (const message of body) {
      const response = await handleMessage(req, message);
      if (response.status !== 202) responses.push(await response.json());
    }
    return new Response(JSON.stringify(responses), { headers: mcpHeaders });
  }

  return handleMessage(req, body);
});
