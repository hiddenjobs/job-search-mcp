import { assert, rpc, readRpc } from './helpers.ts';
import { remoteLocations, remoteLocationSchema, assertRemoteLocation } from '../src/locations.ts';
import { jobTools } from '../src/tools/jobs.ts';
import { validateCareerArguments } from '../src/tools/validation.ts';
import { createRestMcpHandler } from '../src/index.ts';
import { createRestClient } from '../src/api/client.ts';
import { createExternalJobs } from '../src/sources/index.ts';
import { locationMatches } from '../src/sources/jobs.ts';

const invalid: unknown[] = [
  'Portugal',
  'Europe',
  'EU',
  'European Union',
  'pt',
  'europe',
  '',
  ' ',
  ' PT',
  'PT ',
  'MARS',
  null,
  12,
  ['PT'],
];
Deno.test(
  'search schema publishes exact case-sensitive locations and rejects aliases without translating',
  () => {
    assert.deepEqual(
      (jobTools[0].inputSchema.properties as Record<string, unknown>).remoteLocation,
      remoteLocationSchema,
    );
    assert.match(remoteLocationSchema.description, /case-sensitive/);
    assert.match(remoteLocationSchema.description, /country codes/);
    assert.match(remoteLocationSchema.description, /regional codes/);
    for (const remoteLocation of remoteLocations) {
      assert.doesNotThrow(() => {
        assertRemoteLocation(remoteLocation);
      });
      assert.doesNotThrow(() => locationMatches('Worldwide', remoteLocation));
      assert.equal(
        validateCareerArguments(jobTools[0].inputSchema, {
          sources: ['hiddenjobs'],
          remoteLocation,
        }),
        true,
      );
    }
    for (const remoteLocation of invalid) {
      assert.throws(
        () => {
          assertRemoteLocation(remoteLocation);
        },
        {
          code: 'invalid_remote_location',
        },
      );
      assert.equal(
        validateCareerArguments(jobTools[0].inputSchema, {
          sources: ['hiddenjobs'],
          remoteLocation,
        }),
        false,
      );
    }
  },
);
Deno.test('MCP and direct client reject invalid locations before reaching REST', async () => {
  let calls = 0;
  const fetcher: typeof fetch = () => {
    calls++;
    return Promise.resolve(Response.json({ data: {} }));
  };
  const mcp = createRestMcpHandler({ fetcher });
  const client = createRestClient('a.b.c', undefined, fetcher);
  for (const remoteLocation of invalid) {
    const args = { sources: ['hiddenjobs', 'jobicy'], remoteLocation };
    const body = await readRpc(
      await mcp(rpc('tools/call', { name: 'search_jobs', arguments: args })),
    );
    assert.equal(body.error.code, -32602);
    assert.match(body.error.message, /remoteLocation/);
    assert.match(body.error.message, /PT/);
    await assert.rejects(() => client.call('search_jobs', args), {
      code: 'invalid_remote_location',
    });
  }
  assert.equal(calls, 0);
  for (const args of [
    { sources: ['hiddenjobs'] },
    { sources: ['hiddenjobs'], remoteLocation: 'All' },
    { sources: ['hiddenjobs'], remoteLocation: 'PT' },
  ]) {
    assert.equal(
      (await readRpc(await mcp(rpc('tools/call', { name: 'search_jobs', arguments: args })))).result
        .isError,
      false,
    );
  }
  assert.equal(calls, 3);
});
Deno.test(
  'external adapters reject invalid locations before provider reads, including an empty location',
  async () => {
    let calls = 0;
    const sources = createExternalJobs(() => {
      calls++;
      return Promise.resolve(Response.json({ jobs: [] }));
    });
    for (const remoteLocation of invalid.filter((v): v is string => typeof v === 'string')) {
      await assert.rejects(
        () => sources.search('jobicy', new URLSearchParams({ remoteLocation })),
        { code: 'invalid_remote_location' },
      );
    }
    assert.equal(calls, 0);
    await sources.search('jobicy', new URLSearchParams());
    assert.equal(calls, 1);
  },
);
Deno.test('REST invalid-location errors preserve safe format guidance through MCP', async () => {
  const mcp = createRestMcpHandler({
    fetcher: () =>
      Promise.resolve(
        Response.json(
          { code: 'invalid_remote_location', error: 'arbitrary upstream text' },
          { status: 400 },
        ),
      ),
  });
  const result = (
    await readRpc(
      await mcp(
        rpc('tools/call', {
          name: 'search_jobs',
          arguments: { sources: ['hiddenjobs'], remoteLocation: 'PT' },
        }),
      ),
    )
  ).result;
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.status, 400);
  assert.match(result.content[0].text, /case-sensitive/);
  assert.ok(!result.content[0].text.includes('arbitrary upstream text'));
});
