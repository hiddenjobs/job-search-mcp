import { createRestMcpHandler } from '../src/index.ts';
import { assert, rpc, UUID, readRpc, parseResource } from './helpers.ts';

Deno.test(
  'real HTTP preserves initialize, OAuth errors, private reads, writes and concurrent tokens',
  async () => {
    const operations: { method: string; path: string; token: string | null; body: unknown }[] = [];
    const rest = Deno.serve(
      {
        hostname: '127.0.0.1',
        port: 0,
        onListen() {
          /* Keep test output quiet. */
        },
      },
      async (request) => {
        const token = request.headers.get('authorization');
        const path = new URL(request.url).pathname;
        operations.push({
          method: request.method,
          path,
          token,
          body: request.method === 'GET' ? null : await request.json(),
        });
        if (token === 'Bearer expired.jwt.token') {
          return Response.json({ code: 'invalid_token' }, { status: 401 });
        }
        return Response.json({ data: { path, token } });
      },
    );
    const mcp = Deno.serve(
      {
        hostname: '127.0.0.1',
        port: 0,
        onListen() {
          /* Keep test output quiet. */
        },
      },
      createRestMcpHandler({ apiBaseUrl: `http://127.0.0.1:${rest.addr.port}/v1` }),
    );
    const send = async (method: string, params = {}, token = 'a.b.c') => {
      const request = rpc(method, params, token);
      return fetch(`http://127.0.0.1:${mcp.addr.port}`, {
        method: 'POST',
        headers: { ...Object.fromEntries(request.headers), Connection: 'close' },
        body: await request.text(),
        signal: AbortSignal.timeout(5000),
      });
    };
    try {
      assert.equal((await readRpc(await send('initialize'))).result.protocolVersion, '2025-06-18');
      assert.equal((await readRpc(await send('tools/list'))).result.tools.length, 46);
      assert.equal(operations.length, 0);
      const denied = await send(
        'tools/call',
        { name: 'search_jobs', arguments: { sources: ['hiddenjobs'] } },
        'expired.jwt.token',
      );
      assert.equal(denied.status, 401);
      assert(denied.headers.get('WWW-Authenticate')?.includes('oauth-protected-resource/mcp'));
      await readRpc(denied);
      const reads = await Promise.all(
        ['a.b.c', 'd.e.f'].map((token) =>
          send('resources/read', { uri: `hiddenjobs://me/cvs/${UUID}` }, token).then((response) =>
            readRpc(response),
          ),
        ),
      );
      assert.deepEqual(
        reads.map((value) => parseResource(value.result.contents[0].text).token),
        ['Bearer a.b.c', 'Bearer d.e.f'],
      );
      const args = {
        title: 'CV',
        kind: 'cv',
        content: 'Confirmed experience',
        requestId: 'request-1234',
      };
      const saved = await readRpc(
        await send('tools/call', { name: 'save_document', arguments: args }),
      );
      assert.equal(saved.result.isError, false);
      assert.deepEqual(operations.at(-1), {
        method: 'POST',
        path: '/v1/me/documents',
        token: 'Bearer a.b.c',
        body: args,
      });
      assert.equal(operations.length, 4, 'Each authenticated operation calls REST exactly once');
    } finally {
      await mcp.shutdown();
      await rest.shutdown();
    }
  },
);
