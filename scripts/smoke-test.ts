const mcpUrl = (Deno.env.get('HIDDEN_JOBS_MCP_URL') || 'https://api.hiddenjobs.dev/mcp').replace(
  /\/$/,
  '',
);
const apiKey = Deno.env.get('HIDDEN_JOBS_API_KEY')?.trim();

if (!apiKey) {
  throw new Error('Set HIDDEN_JOBS_API_KEY to run the authenticated smoke test.');
}

const call = async (message: Record<string, unknown>) => {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`MCP HTTP ${response.status}`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('MCP returned an invalid JSON-RPC response.');
  }
  return payload as Record<string, unknown>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const initialize = await call({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'hidden-jobs-mcp-smoke-test', version: '1.0.0' },
  },
});
assert(
  initialize.result && typeof initialize.result === 'object',
  'initialize did not return a result.',
);

const toolList = await call({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
});
const tools = ((toolList.result as Record<string, unknown>)?.tools || []) as Array<
  Record<string, unknown>
>;
const toolNames = tools.map((tool) => tool.name);
for (const name of ['search_jobs', 'get_job', 'open_application_link']) {
  assert(toolNames.includes(name), `Missing tool: ${name}`);
}

const search = await call({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'search_jobs',
    arguments: { query: 'typescript', limit: 1 },
  },
});
const searchResult = search.result as Record<string, unknown>;
assert(searchResult?.isError === false, 'search_jobs returned an MCP error.');
const searchPayload = searchResult.structuredContent as Record<string, unknown>;
const searchData = searchPayload?.data as Record<string, unknown>;
const jobs = (searchData?.jobs || []) as Array<Record<string, unknown>>;
assert(jobs.length > 0, 'search_jobs returned no test job.');

const jobId = typeof jobs[0].id === 'string' ? jobs[0].id : '';
assert(jobId, 'search_jobs returned a job without an id.');

const detail = await call({
  jsonrpc: '2.0',
  id: 4,
  method: 'tools/call',
  params: {
    name: 'get_job',
    arguments: { idOrSlug: jobId },
  },
});
const detailResult = detail.result as Record<string, unknown>;
assert(detailResult?.isError === false, 'get_job returned an MCP error.');
assert(
  (detailResult.structuredContent as Record<string, unknown>)?.data,
  'get_job returned no job data.',
);

if (Deno.env.get('CHECK_APPLICATION_LINK') === 'true') {
  const applicationLink = await call({
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: {
      name: 'open_application_link',
      arguments: { idOrSlug: jobId },
    },
  });
  const applicationResult = applicationLink.result as Record<string, unknown>;
  const applicationPayload = applicationResult.structuredContent as Record<string, unknown>;
  const hasUrl = Boolean((applicationPayload?.data as Record<string, unknown>)?.url);
  const isExpectedSubscriptionGate = applicationResult.isError === true &&
    applicationPayload?.error === 'subscription_required' &&
    applicationPayload?.status === 402;
  assert(hasUrl || isExpectedSubscriptionGate, 'Unexpected application-link result.');
  console.log(`open_application_link: ${hasUrl ? 'authorized' : 'subscription gate'}`);
}

console.log(
  `MCP smoke test passed: ${jobs.length} job returned, ${toolNames.length} tools advertised.`,
);
