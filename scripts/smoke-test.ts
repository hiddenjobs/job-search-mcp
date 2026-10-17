import { MCP_RESOURCE } from '../src/config.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type Options = {
  url: string;
  resource?: string;
  token?: string;
  checkApplicationLink?: boolean;
  fetcher?: typeof fetch;
};

export async function runSmoke(options: Options) {
  const fetcher = options.fetcher || fetch;
  let id = 0;
  const call = async (method: string, params = {}, token?: string) => {
    const response = await fetcher(options.url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    const payload = await response.json();
    assert(payload.jsonrpc === '2.0' && payload.id === id, 'Invalid JSON-RPC response');
    return { response, result: payload.result };
  };
  const initialized = await call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'hidden-jobs-smoke', version: '2.0.0' },
  });
  assert(
    initialized.response.ok && initialized.result?.protocolVersion === '2025-06-18',
    'Initialization failed',
  );
  const discovery = await call('tools/list');
  const tools = discovery.result?.tools;
  for (const name of ['search_jobs', 'get_job', 'open_application_link']) {
    const tool = tools?.find((tool: { name: string }) => tool.name === name);
    assert(tool?.inputSchema?.type === 'object', `Missing tool schema: ${name}`);
    assert(
      tool.securitySchemes?.some((scheme: { type: string }) => scheme.type === 'oauth2'),
      `Missing OAuth scheme: ${name}`,
    );
  }
  const params = {
    name: 'search_jobs',
    arguments: { query: 'typescript', remoteLocation: 'EUROPE', limit: 1 },
  };
  const denied = await call('tools/call', params);
  assert(
    denied.response.status === 401 && denied.result?.isError === true,
    'Expected unauthorized challenge',
  );
  const metadataUrl = denied.response.headers.get('WWW-Authenticate')?.match(
    /resource_metadata="([^"]+)"/,
  )?.[1];
  assert(metadataUrl, 'Missing resource metadata in challenge');
  const expectedResource = options.resource || MCP_RESOURCE;
  assert(
    new URL(metadataUrl).origin === new URL(expectedResource).origin,
    'Unexpected metadata origin',
  );
  const metadataResponse = await fetcher(metadataUrl, {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  assert(metadataResponse.ok, 'Resource metadata unavailable');
  const metadata = await metadataResponse.json();
  assert(
    metadata.resource === expectedResource && metadata.authorization_servers?.length > 0,
    'Invalid resource metadata',
  );
  assert(metadata.scopes_supported?.includes('email'), 'Missing identity scope');
  if (!options.token) return { authenticated: false, applicationLink: false };

  const search = await call('tools/call', params, options.token);
  assert(search.response.ok && search.result?.isError === false, 'Authenticated search failed');
  const jobs = search.result.structuredContent?.data?.jobs;
  assert(
    Array.isArray(jobs) && jobs.length > 0 && jobs[0].id,
    'No fixture job found for detail check',
  );
  const assertPublic = (job: Record<string, unknown>) => {
    for (const key of ['url', 'application_url', 'source_url']) {
      assert(!(key in job), `Public job exposed ${key}`);
    }
  };
  jobs.forEach(assertPublic);
  const detail = await call(
    'tools/call',
    { name: 'get_job', arguments: { idOrSlug: jobs[0].id } },
    options.token,
  );
  assert(detail.response.ok && detail.result?.isError === false, 'Authenticated detail failed');
  assertPublic(detail.result.structuredContent.data);
  if (options.checkApplicationLink) {
    const link = await call('tools/call', {
      name: 'open_application_link',
      arguments: { idOrSlug: jobs[0].id },
    }, options.token);
    const result = link.result;
    const data = result?.structuredContent;
    assert(
      (result?.isError === false && /^https?:\/\//.test(data?.data?.url)) ||
        (result?.isError === true && data?.status === 402 &&
          data?.error === 'subscription_required'),
      'Unexpected application-link result',
    );
  }
  return { authenticated: true, applicationLink: Boolean(options.checkApplicationLink) };
}

if (import.meta.main) {
  const file = Deno.env.get('HIDDEN_JOBS_OAUTH_TOKEN_FILE');
  const token = file ? (await Deno.readTextFile(file)).trim() : undefined;
  if (file && (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))) {
    throw new Error('The OAuth token file must contain one access token');
  }
  const result = await runSmoke({
    url: Deno.env.get('HIDDEN_JOBS_MCP_URL') || MCP_RESOURCE,
    resource: Deno.env.get('MCP_RESOURCE_URL') || MCP_RESOURCE,
    token,
    checkApplicationLink: Deno.env.get('CHECK_APPLICATION_LINK') === 'true',
  });
  console.log('Smoke passed: initialization, tools, OAuth metadata and unauthorized challenge.');
  console.log(
    result.authenticated
      ? 'Authenticated search and detail passed.'
      : 'Authenticated tool calls were not run.',
  );
  if (result.applicationLink) console.log('Application-link access check passed.');
}
