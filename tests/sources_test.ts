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
