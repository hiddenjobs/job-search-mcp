import { createRestMcpHandler } from '../src/index.ts';
import { createMcpHandler } from '../src/server.ts';
import { assert, rpc, readRpc } from './helpers.ts';

const noNetwork: typeof fetch = () => {
  throw new Error('Discovery must not call REST');
};
Deno.test('discovery preserves the public capabilities and the career feature flag', async () => {
  for (const careerEnabled of [true, false]) {
    const handler = createRestMcpHandler({ careerEnabled, fetcher: noNetwork });
    const initialized = await readRpc(await handler(rpc('initialize')));
    assert.equal(initialized.result.protocolVersion, '2025-06-18');
    assert(initialized.result.instructions.includes('before general web search'));
    assert(initialized.result.instructions.includes('ask which connected sources'));
    assert.equal(initialized.result.instructions.includes('list_cvs'), careerEnabled);
    assert.equal(initialized.result.instructions.includes('save_cv'), careerEnabled);
    assert.equal(
      initialized.result.capabilities.resources?.subscribe,
      careerEnabled ? false : undefined,
    );
    const listed = await readRpc(await handler(rpc('tools/list')));
    assert.equal(listed.result.tools.length, careerEnabled ? 46 : 9);
    for (const tool of listed.result.tools) {
      assert(tool.title.trim().length > 0 && !tool.title.includes('_'), tool.name);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) {
        assert.equal(typeof tool.annotations[hint], 'boolean', `${tool.name}.${hint}`);
      }
    }
    assert(
      listed.result.tools.every(
        (tool) => (tool.securitySchemes[0] as { type: string }).type === 'oauth2',
      ),
    );
  }
});
Deno.test(
  'malformed JSON, envelopes and parameters return protocol errors without REST calls',
  async () => {
    const handler = createRestMcpHandler({ fetcher: noNetwork });
    for (const [body, code] of [
      ['{', -32700],
      ['null', -32600],
      ['[]', -32600],
      ['{}', -32600],
      [JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: 'invalid' }), -32602],
    ] as const) {
      const result = await handler(
        new Request('https://hiddenjobs.dev/mcp', { method: 'POST', body }),
      );
      assert.equal((await readRpc(result)).error.code, code, body);
    }
    assert.equal((await readRpc(await handler(rpc('unknown')))).error.code, -32601);
  },
);
Deno.test(
  'transport enforces methods and byte limits and acknowledges notifications and ping',
  async () => {
    const handler = createRestMcpHandler({ fetcher: noNetwork });
    for (const [method, status] of [
      ['GET', 405],
      ['OPTIONS', 204],
    ] as const) {
      const response = await handler(new Request('https://hiddenjobs.dev/mcp', { method }));
      assert.equal(response.status, status);
      assert.equal(response.headers.get('Allow'), 'POST, OPTIONS');
    }
    const tooLarge = new Request('https://hiddenjobs.dev/mcp', {
      method: 'POST',
      body: 'é'.repeat(8193),
    });
    assert.equal((await handler(tooLarge)).status, 413);
    assert.equal((await handler(rpc('notifications/initialized'))).status, 202);
    assert.deepEqual((await readRpc(await handler(rpc('ping')))).result, {});
  },
);

Deno.test(
  'discovery lists private resource templates and rejects unknown tools and URIs',
  async () => {
    const handler = createRestMcpHandler({ fetcher: noNetwork });
    const result = await readRpc(await handler(rpc('resources/templates/list')));
    assert.deepEqual(
      result.result.resourceTemplates.map((r: { uriTemplate: string }) => r.uriTemplate),
      [
        'hiddenjobs://me/profile',
        'hiddenjobs://me/cvs/{id}',
        'hiddenjobs://me/applications/{id}',
        'hiddenjobs://me/documents/{id}',
      ],
    );
    const prompts = await readRpc(await handler(rpc('prompts/list')));
    assert.equal(prompts.result.prompts.length, 15);
    assert.equal(
      (await readRpc(await handler(rpc('tools/call', { name: 'unknown' })))).error.code,
      -32602,
    );
    assert.equal(
      (await readRpc(await handler(rpc('resources/read', { uri: 'hiddenjobs://me/unknown' }))))
        .error.code,
      -32002,
    );
    const tooLarge = new Request('https://hiddenjobs.dev/mcp', {
      method: 'POST',
      headers: { 'Content-Length': '16385' },
      body: '{}',
    });
    assert.equal((await handler(tooLarge)).status, 413);
  },
);

Deno.test('unexpected execution failures are sanitized before reaching the assistant', async () => {
  const handler = createMcpHandler({
    execute: () => {
      throw new Error('PRIVATE');
    },
  });
  const result = await readRpc(
    await handler(
      rpc('tools/call', { name: 'search_jobs', arguments: { sources: ['hiddenjobs'] } }),
    ),
  );
  assert.equal(result.result.structuredContent.status, 503);
  assert(!JSON.stringify(result).includes('PRIVATE'));
});
