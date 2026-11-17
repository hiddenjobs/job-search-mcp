import { createRestMcpHandler } from '../src/index.ts';
import { createRestClient } from '../src/api/client.ts';
import { assert, rpc, readRpc } from './helpers.ts';
Deno.test(
  'search requires a unique source selection and forwards source arrays and continuation objects',
  async () => {
    const sent: URL[] = [];
    const handler = createRestMcpHandler({
      fetcher: (input: string | URL | Request) => {
        sent.push(new URL(input instanceof Request ? input.url : input));
        return Promise.resolve(Response.json({ data: { jobs: [], sourceResults: [] } }));
      },
    });
    for (const args of [
      {},
      { sources: [] },
      { sources: ['remoteok', 'remoteok'] },
      { sources: ['linkedin'] },
      { sources: 'remoteok' },
      { sources: [1] },
      { sources: ['hiddenjobs', 'jobicy', 'weworkremotely', 'remoteok', 'himalayas', 'extra'] },
      { sources: ['jobicy'], cursors: { hiddenjobs: 'no' } },
      { sources: ['jobicy'], cursors: { jobicy: 3 } },
    ]) {
      const result = await readRpc(
        await handler(rpc('tools/call', { name: 'search_jobs', arguments: args })),
      );
      assert.equal(result.error.code, -32602);
    }
    assert.equal(sent.length, 0);
    await handler(
      rpc('tools/call', {
        name: 'search_jobs',
        arguments: {
          sources: ['jobicy', 'himalayas', 'itjobs'],
          query: 'typescript',
          cursors: { jobicy: 'opaque', itjobs: 'itjobs-page' },
        },
      }),
    );
    assert.equal(sent[0].searchParams.get('sources'), 'jobicy,himalayas,itjobs');
    assert.equal(sent[0].searchParams.get('cursors'), '{"jobicy":"opaque","itjobs":"itjobs-page"}');
    await handler(
      rpc('tools/call', {
        name: 'get_job',
        arguments: { source: 'remoteok', idOrSlug: 'opaque-id' },
      }),
    );
    assert.equal(sent[1].searchParams.get('source'), 'remoteok');
    const client = createRestClient('a.b.c', undefined, () =>
      Promise.resolve(Response.json({ data: {} })),
    );
    await assert.rejects(() => client.call('search_jobs', { sources: { wrong: true } }), {
      code: 'invalid_arguments',
    });
    await assert.rejects(() => client.call('search_jobs', { sources: [1] }), {
      code: 'invalid_arguments',
    });
    await assert.rejects(() => client.call('search_jobs', { cursors: [] }), {
      code: 'invalid_arguments',
    });
  },
);

Deno.test('job details and links require an explicit source before any REST request', async () => {
  let calls = 0;
  const handler = createRestMcpHandler({
    fetcher: () => {
      calls++;
      return Promise.resolve(Response.json({ data: {} }));
    },
  });
  for (const name of ['get_job', 'open_application_link']) {
    for (const args of [
      { idOrSlug: 'job-id' },
      { idOrSlug: 'job-id', source: '' },
      { idOrSlug: 'job-id', source: 'unknown' },
    ]) {
      const result = await readRpc(await handler(rpc('tools/call', { name, arguments: args })));
      assert.equal(result.error.code, -32602);
    }
    for (const source of [
      'hiddenjobs',
      'jobicy',
      'weworkremotely',
      'remoteok',
      'himalayas',
      'itjobs',
    ]) {
      const result = await readRpc(
        await handler(rpc('tools/call', { name, arguments: { idOrSlug: 'job-id', source } })),
      );
      assert.equal(result.result.isError, false);
    }
  }
  assert.equal(calls, 12);
});

Deno.test('all six sources can be selected together without losing ITjobs routing', async () => {
  const sent: URL[] = [];
  const handler = createRestMcpHandler({
    fetcher: (input) => {
      sent.push(new URL(input instanceof Request ? input.url : input));
      return Promise.resolve(Response.json({ data: { jobs: [], sourceResults: [] } }));
    },
  });
  const sources = ['hiddenjobs', 'jobicy', 'weworkremotely', 'remoteok', 'himalayas', 'itjobs'];
  const result = await readRpc(
    await handler(rpc('tools/call', { name: 'search_jobs', arguments: { sources } })),
  );
  assert.equal(result.result.isError, false);
  assert.equal(sent[0].searchParams.get('sources'), sources.join(','));
});

Deno.test(
  'per-source page size preserves combined offers and exact continuation routing',
  async () => {
    const sent: URL[] = [];
    const jobs = Array.from({ length: 18 }, (_, i) => ({
      id: `offer-${i}`,
      source: i < 9 ? 'hiddenjobs' : 'remoteok',
      title: `Relevant role ${i}`,
    }));
    const sourceResults = [
      { source: 'hiddenjobs', count: 9 },
      { source: 'remoteok', count: 9, nextCursor: 'exact-next-cursor' },
    ];
    const handler = createRestMcpHandler({
      fetcher: (input) => {
        sent.push(new URL(input instanceof Request ? input.url : input));
        return Promise.resolve(
          Response.json({
            data: sent.length === 1 ? { jobs, sourceResults } : { jobs: [], sourceResults: [] },
          }),
        );
      },
    });
    const first = await readRpc(
      await handler(
        rpc('tools/call', {
          name: 'search_jobs',
          arguments: { sources: ['hiddenjobs', 'remoteok'], query: 'data scientist', limit: 10 },
        }),
      ),
    );
    assert.equal(first.result.isError, false);
    assert.deepEqual(first.result.structuredContent.data.jobs, jobs);
    assert.deepEqual(first.result.structuredContent.data.sourceResults, sourceResults);
    await handler(
      rpc('tools/call', {
        name: 'search_jobs',
        arguments: {
          sources: ['remoteok'],
          query: 'data scientist',
          limit: 10,
          cursors: { remoteok: 'exact-next-cursor' },
        },
      }),
    );
    assert.equal(sent[1].searchParams.get('limit'), '10');
    assert.equal(sent[1].searchParams.get('cursors'), '{"remoteok":"exact-next-cursor"}');
    await handler(
      rpc('tools/call', {
        name: 'search_jobs',
        arguments: { sources: ['hiddenjobs'], query: 'data scientist', limit: 10, page: 2 },
      }),
    );
    assert.equal(sent[2].searchParams.get('page'), '2');
    for (const limit of [0, 51]) {
      const invalid = await readRpc(
        await handler(
          rpc('tools/call', { name: 'search_jobs', arguments: { sources: ['hiddenjobs'], limit } }),
        ),
      );
      assert.equal(invalid.error.code, -32602);
    }
    assert.equal(sent.length, 3);
  },
);
