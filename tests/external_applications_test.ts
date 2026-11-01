import { assert, rpc, readRpc, UUID } from './helpers.ts';
import { createRestMcpHandler } from '../src/index.ts';
import { getWorkflow } from '../src/resources/workflows.ts';
import { webSearchRequest } from '../src/sources/web.ts';

Deno.test(
  'external application references cross MCP and REST without becoming Hidden Jobs job IDs',
  async () => {
    const calls: Record<string, unknown>[] = [];
    const handler = createRestMcpHandler({
      fetcher: (_input, init) => {
        assert.equal(typeof init?.body, 'string');
        const args = JSON.parse(init?.body as string) as Record<string, unknown>;
        calls.push(args);
        return Promise.resolve(Response.json({ data: { id: UUID, ...args } }));
      },
    });
    for (const source of ['jobicy', 'weworkremotely', 'remoteok', 'himalayas', 'itjobs', 'web']) {
      const externalJob =
        source === 'web'
          ? { source, url: 'https://careers.company.com/jobs/42', title: 'Data Scientist' }
          : { source, id: 'exact-opaque-provider-reference' };
      const args = { externalJob, cvVersionId: UUID, requestId: `request-${source}` };
      const result = await readRpc(
        await handler(rpc('tools/call', { name: 'save_application', arguments: args })),
      );
      assert.equal(result.result.isError, false);
      assert.deepEqual(calls.at(-1), args);
      assert.equal(calls.at(-1)?.jobId, undefined);
    }
    const bad = await readRpc(
      await handler(
        rpc('tools/call', {
          name: 'save_application',
          arguments: {
            externalJob: { source: 'invented' },
            cvVersionId: UUID,
            requestId: 'request-invalid',
          },
        }),
      ),
    );
    assert.equal(bad.error.code, -32602);
    assert.equal(calls.length, 6);
    const instructions = getWorkflow('apply')?.instructions ?? '';
    assert.match(instructions, /every saved application synchronized/);
    assert.match(instructions, /exact saved cvVersionId/);
    assert.doesNotMatch(instructions, /External application tracking is not supported/);
    assert.match(webSearchRequest(new URLSearchParams()).instructions, /save_application/);
  },
);
