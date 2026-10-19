import { createRestMcpHandler } from '../src/index.ts';
import { assert, rpc, readRpc } from './helpers.ts';

Deno.test(
  'alert tools remain available without career features and preserve typed REST inputs',
  async () => {
    const requests: Request[] = [];
    const handler = createRestMcpHandler({
      careerEnabled: false,
      fetcher: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.json({ data: { config: { version: 1 } } }));
      },
    });
    assert.equal((await handler(rpc('tools/call', { name: 'get_job_alerts' }, ''))).status, 401);
    const args = {
      name: 'Europe',
      frequency: 'daily',
      query: 'typescript',
      category: ['Backend', 'DevOps'],
      remoteLocation: ['EUROPE'],
      expectedVersion: 0,
    };
    const created = await readRpc(
      await handler(rpc('tools/call', { name: 'create_job_alert', arguments: args })),
    );
    assert.equal(created.result.isError, false);
    const request = requests[0];
    assert.equal(request.method, 'POST');
    assert.equal(new URL(request.url).pathname, '/v1/me/alerts');
    assert.equal(request.headers.get('Authorization'), 'Bearer a.b.c');
    const body: unknown = await request.json();
    assert.deepEqual(body, args);
    for (const category of [[], ['wrong'], 'Backend', [1]]) {
      const invalid = await readRpc(
        await handler(
          rpc('tools/call', { name: 'create_job_alert', arguments: { ...args, category } }),
        ),
      );
      assert.equal(invalid.error.code, -32602);
    }
    assert.equal(requests.length, 1);
  },
);

Deno.test(
  'email confirmation and alert limits are actionable errors without an OAuth reconnect loop',
  async () => {
    for (const [code, status, message] of [
      ['email_unconfirmed', 403, 'Confirm your Hidden Jobs email'],
      ['alert_limit', 400, 'five job alerts'],
    ] as const) {
      const handler = createRestMcpHandler({
        fetcher: () => Promise.resolve(Response.json({ code }, { status })),
      });
      const response = await handler(
        rpc('tools/call', { name: 'resume_job_alerts', arguments: { expectedVersion: 0 } }),
      );
      const result = await readRpc(response);
      assert.equal(response.status, 200);
      assert.equal(response.headers.has('WWW-Authenticate'), false);
      assert.equal(result.result.isError, true);
      assert.equal(result.result.structuredContent.error, code);
      assert(JSON.stringify(result).includes(message));
    }
  },
);
