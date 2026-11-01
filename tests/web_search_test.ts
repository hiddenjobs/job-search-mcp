import { assert, rpc, readRpc } from './helpers.ts';
import { createRestMcpHandler } from '../src/index.ts';
import { webSearchRequest } from '../src/sources/web.ts';
import { getWorkflow } from '../src/resources/workflows.ts';

Deno.test(
  'web search handoff preserves explicit preferences and never claims searched results',
  () => {
    const result = webSearchRequest(
      new URLSearchParams({
        q: '  Senior MLOps  ',
        remoteLocation: 'ES',
        category: 'MLOps',
        employmentType: 'Full-time',
        jobType: 'Remote',
        limit: '5',
      }),
    );
    assert.deepEqual(result.request, {
      query: 'Senior MLOps',
      limit: 5,
      filters: {
        remoteLocation: 'ES',
        category: 'MLOps',
        employmentType: 'Full-time',
        jobType: 'Remote',
      },
    });
    assert.equal(result.status, 'requires_host_search');
    assert.equal(result.execution, 'host');
    assert.deepEqual(result.jobs, []);
    assert.match(result.instructions, /native web-search/);
    assert.match(result.instructions, /unavailable/);
    assert.match(result.instructions, /private profile/);
    assert.deepEqual(webSearchRequest(new URLSearchParams()).request, {
      query: '',
      limit: 10,
      filters: {},
    });
    assert.deepEqual(
      webSearchRequest(new URLSearchParams({ query: 'Data scientist', category: 'All' })).request,
      { query: 'Data scientist', limit: 10, filters: {} },
    );
  },
);

Deno.test(
  'web can be selected alone or alongside all connected sources without gaining detail IDs or cursors',
  async () => {
    const calls: URL[] = [];
    const handler = createRestMcpHandler({
      fetcher: (input) => {
        const url = new URL(input instanceof Request ? input.url : input);
        calls.push(url);
        return Promise.resolve(
          Response.json({
            data: {
              jobs: [],
              partial: true,
              requiresHostSearch: true,
              sourceResults: [webSearchRequest(url.searchParams)],
            },
          }),
        );
      },
    });
    for (const sources of [
      ['web'],
      ['hiddenjobs', 'jobicy', 'weworkremotely', 'remoteok', 'himalayas', 'itjobs', 'web'],
    ]) {
      const result = await readRpc(
        await handler(
          rpc('tools/call', {
            name: 'search_jobs',
            arguments: {
              sources,
              query: 'MLOps',
              remoteLocation: 'ES',
              limit: 5,
            },
          }),
        ),
      );
      assert.equal(result.result.isError, false);
      assert.equal(result.result.structuredContent.data.requiresHostSearch, true);
      assert.equal(calls.at(-1)?.searchParams.get('sources'), sources.join(','));
    }
    for (const [name, args] of [
      ['search_jobs', { sources: ['web'], cursors: { web: 'invalid' } }],
      ['get_job', { source: 'web', idOrSlug: 'https://example.com/job' }],
      ['open_application_link', { source: 'web', idOrSlug: 'https://example.com/job' }],
    ] as const) {
      const result = await readRpc(await handler(rpc('tools/call', { name, arguments: args })));
      assert.equal(result.error.code, -32602);
    }
    assert.equal(calls.length, 2);
    const workflow = getWorkflow('search');
    assert.match(workflow?.instructions ?? '', /Web free search/);
    assert.match(workflow?.instructions ?? '', /cannot search the web/);
  },
);
