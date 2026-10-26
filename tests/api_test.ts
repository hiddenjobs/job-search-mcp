import { createRestClient } from '../src/api/client.ts';
import { createRestMcpHandler } from '../src/index.ts';
import { restRoutes } from '../src/api/routes.ts';

import { assert, rpc as request, UUID as uuid, readRpc, parseResource } from './helpers.ts';

function sample(schema: Record<string, unknown>) {
  const args: Record<string, unknown> = {};
  const properties = schema.properties as Record<
    string,
    {
      type?: string;
      format?: string;
      enum?: unknown[];
      minimum?: number;
      items?: { enum?: unknown[] };
    }
  >;
  for (const key of (schema.required ?? []) as string[]) {
    const property = properties[key];
    args[key] =
      property.enum?.[0] ??
      (property.type === 'array'
        ? [property.items?.enum?.[0]]
        : property.type === 'object'
          ? {}
          : property.type === 'integer'
            ? (property.minimum ?? 0)
            : property.type === 'boolean'
              ? true
              : property.format === 'uuid'
                ? uuid
                : key === 'sha256'
                  ? 'a'.repeat(64)
                  : 'example-value');
  }
  return args;
}
Deno.test(
  'every advertised tool executes its documented REST method and path with the original OAuth token',
  async () => {
    const requests: Request[] = [];
    const handler = createRestMcpHandler({
      fetcher: (url: string | URL | Request, init?: RequestInit) => {
        requests.push(new Request(url, init));
        return Promise.resolve(Response.json({ data: { ok: true } }));
      },
    });
    const tools = (await readRpc(await handler(request('tools/list')))).result.tools.filter(
      (tool) => tool.name !== 'upload_cv',
    );
    assert(tools.length === 45 && Object.keys(restRoutes).length === 45);
    assert.equal(requests.length, 0, 'Discovery called REST');
    for (const tool of tools) {
      const args = sample(tool.inputSchema);
      if (tool.name === 'search_jobs') {
        Object.assign(args, { query: 'typescript', remoteLocation: 'EUROPE', limit: 10 });
      }
      const result = await readRpc(
        await handler(request('tools/call', { name: tool.name, arguments: args })),
      );
      assert.equal(result.result.isError, false, `Tool failed: ${tool.name}`);
      const sent = requests.at(-1);
      assert(sent);
      const route = Object.hasOwn(restRoutes, tool.name) ? restRoutes[tool.name] : undefined;
      assert(route);
      const expected = route.path.replace(/\{(\w+)\}/g, (_, key: string) =>
        encodeURIComponent(String(args[key])),
      );
      assert(
        sent.method === route.method && new URL(sent.url).pathname === '/v1' + expected,
        tool.name,
      );
      assert(sent.headers.get('Authorization') === 'Bearer a.b.c');
      assert(sent.redirect === 'error', 'Credentials could follow a redirect');
      if (tool.name === 'search_jobs') {
        assert(new URL(sent.url).searchParams.get('q') === 'typescript');
      }
    }
    assert.equal(requests.length, 45, 'Tool calls were duplicated');
  },
);
Deno.test(
  'MCP rejects API keys and malformed arguments before forwarding credentials',
  async () => {
    let calls = 0;
    const handler = createRestMcpHandler({
      fetcher: () => {
        calls++;
        throw Error('Unexpected');
      },
    });
    for (const token of ['', 'hj_live_secret', 'invalid']) {
      const result = await handler(
        request(
          'tools/call',
          { name: 'search_jobs', arguments: { sources: ['hiddenjobs'] } },
          token,
        ),
      );
      assert(result.status === 401 && result.headers.has('WWW-Authenticate'));
    }
    const invalid = await readRpc(
      await handler(request('tools/call', { name: 'save_cv', arguments: { userId: uuid } })),
    );
    assert.equal(invalid.error.code, -32602);
    assert.equal(calls, 0);
  },
);
Deno.test(
  'REST denials preserve OAuth challenges, quota, account access and revision errors without leaking upstream text',
  async () => {
    for (const [status, code] of [
      [401, 'invalid_token'],
      [403, 'insufficient_scope'],
      [429, 'rate_limit'],
      [402, 'subscription_required'],
      [402, 'mcp_trial_expired'],
      [409, 'revision_conflict'],
    ] as const) {
      const handler = createRestMcpHandler({
        fetcher: () =>
          Promise.resolve(Response.json({ code, error: 'PRIVATE a.b.c secret' }, { status })),
      });
      const response = await handler(
        request('tools/call', { name: 'search_jobs', arguments: { sources: ['hiddenjobs'] } }),
      );
      const text = await response.text();
      const body = JSON.parse(text) as Awaited<ReturnType<typeof readRpc>>;
      assert(
        body.result.structuredContent.status === status &&
          body.result.structuredContent.error === code,
      );
      assert(!text.includes('PRIVATE') && !text.includes('a.b.c'));
      if (status === 402) {
        assert(
          text.includes('Account action is required') &&
            text.includes('https://hiddenjobs.dev/dashboard/account'),
        );
      }
      if (status === 401 || status === 403) {
        assert(
          response.status === status &&
            response.headers.get('WWW-Authenticate')?.includes('oauth-protected-resource/mcp'),
        );
      }
    }
  },
);
Deno.test('private resources use REST and simultaneous accounts never share tokens', async () => {
  const handler = createRestMcpHandler({
    fetcher: (_url: unknown, init?: RequestInit) =>
      Promise.resolve(
        Response.json({ data: { tokenSeen: new Headers(init?.headers).get('Authorization') } }),
      ),
  });
  const responses = await Promise.all(
    ['a.b.c', 'd.e.f'].map((token) =>
      handler(request('resources/read', { uri: `hiddenjobs://me/cvs/${uuid}` }, token)),
    ),
  );
  for (let i = 0; i < responses.length; i++) {
    const body = await readRpc(responses[i]);
    const data = parseResource(body.result.contents[0].text);
    assert(data.tokenSeen === ['Bearer a.b.c', 'Bearer d.e.f'][i]);
  }
});
Deno.test(
  'HTTP adapter rejects unsafe destinations and path traversal and never retries mutations',
  async () => {
    for (const base of [
      'http://remote.test/v1',
      'https://user:password@api.test/v1',
      'https://api.test/v1?redirect=evil',
    ]) {
      let rejected = false;
      try {
        createRestClient('a.b.c', base);
      } catch {
        rejected = true;
      }
      assert(rejected);
    }
    let calls = 0;
    const client = createRestClient('a.b.c', undefined, () => {
      calls++;
      return Promise.reject(new Error('upstream secret'));
    });
    for (const value of ['..', 'a/b']) {
      try {
        await client.call('get_job', { idOrSlug: value });
        assert(false);
      } catch (e) {
        assert((e as { status: number }).status === 400);
      }
    }
    assert.equal(calls, 0);
    try {
      await client.call('save_cv', { name: 'CV' });
      assert(false);
    } catch (e) {
      assert((e as { status: number }).status === 503);
    }
    assert.equal(calls, 1);
  },
);

Deno.test(
  'REST client rejects invalid tokens, unknown operations and malformed responses',
  async () => {
    assert.throws(() => createRestClient('hj_live_secret'), { code: 'invalid_token', status: 401 });
    const client = createRestClient('a.b.c', undefined, () => {
      throw new Error('Invalid input must not reach the network');
    });
    await assert.rejects(() => client.call('unknown'), { code: 'not_found', status: 404 });
    for (const idOrSlug of [undefined, null, '', ' ', '.', '..', 'a/b', 'a\\b']) {
      await assert.rejects(() => client.call('get_job', { idOrSlug }), {
        code: 'invalid_arguments',
        status: 400,
      });
    }
    for (const body of ['not JSON', '{}', 'null']) {
      const broken = createRestClient('a.b.c', undefined, () =>
        Promise.resolve(new Response(body)),
      );
      await assert.rejects(() => broken.call('search_jobs'), {
        code: 'backend_error',
        status: 503,
      });
    }
    for (const code of [undefined, 'PRIVATE secret', 'unrecognized_code']) {
      const broken = createRestClient('a.b.c', undefined, () =>
        Promise.resolve(Response.json({ code }, { status: 500 })),
      );
      await assert.rejects(() => broken.call('search_jobs'), {
        code: code === 'unrecognized_code' ? code : 'backend_error',
        message: 'Hidden Jobs could not complete this operation.',
        status: 500,
      });
    }
  },
);

Deno.test(
  'REST URL parameters accept scalar values and reject objects before making a request',
  async () => {
    const requests: URL[] = [];
    const client = createRestClient('a.b.c', undefined, (url) => {
      requests.push(new URL(url instanceof Request ? url.url : url));
      return Promise.resolve(Response.json({ data: {} }));
    });
    for (const query of [{ nested: true }, ['typescript']]) {
      await assert.rejects(() => client.call('search_jobs', { query }), {
        code: 'invalid_arguments',
        status: 400,
      });
    }
    for (const idOrSlug of [{ id: uuid }, true]) {
      await assert.rejects(() => client.call('get_job', { idOrSlug }), {
        code: 'invalid_arguments',
        status: 400,
      });
    }
    assert.equal(requests.length, 0);
    await client.call('search_jobs', {
      query: 'typescript',
      page: 1,
      optional: undefined,
      flag: false,
      empty: null,
    });
    assert.equal(requests[0].search, '?q=typescript&page=1&flag=false&empty=null');
  },
);

Deno.test(
  'undeclared prototype keys are rejected before REST and error messages use only own entries',
  async () => {
    let calls = 0;
    const handler = createRestMcpHandler({
      fetcher: () => {
        calls++;
        throw new Error('Unexpected REST call');
      },
    });
    for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      const args: unknown = JSON.parse(`{"${key}":"unexpected"}`);
      const result = await readRpc(
        await handler(request('tools/call', { name: 'search_jobs', arguments: args })),
      );
      assert.equal(result.error.code, -32602);
    }
    assert.equal(calls, 0);
    for (const code of ['constructor', '__proto__']) {
      const client = createRestClient('a.b.c', undefined, () =>
        Promise.resolve(Response.json({ code }, { status: 500 })),
      );
      await assert.rejects(() => client.call('search_jobs'), {
        code,
        status: 500,
        message: 'Hidden Jobs could not complete this operation.',
      });
    }
  },
);

Deno.test(
  'file attachment references survive MCP-to-REST without being fetched or echoed by the adapter',
  async () => {
    const file = {
      download_url: 'https://files.client.test/cv.pdf?temporary=credential',
      file_id: 'file-cv',
    };
    const args = {
      file,
      filename: 'cv.pdf',
      mimeType: 'application/pdf',
      kind: 'cv',
      requestId: 'native-cv-import',
    };
    const requests: Request[] = [];
    const handler = createRestMcpHandler({
      fetcher: (input, init) => {
        requests.push(new Request(input, init));
        return Promise.resolve(Response.json({ data: { id: uuid, state: 'ready' } }));
      },
    });
    const tools = (await readRpc(await handler(request('tools/list')))).result.tools.filter(
      (tool) => tool.name !== 'upload_cv',
    );
    assert.deepEqual(tools.find((t) => t.name === 'import_document')?._meta, {
      'openai/fileParams': ['file'],
    });
    const result = await readRpc(
      await handler(request('tools/call', { name: 'import_document', arguments: args })),
    );
    assert.equal(requests.length, 1);
    assert.equal(new URL(requests[0].url).pathname, '/v1/me/documents/import');
    assert.deepEqual(await requests[0].json(), args);
    assert(!JSON.stringify(result).includes('credential'));
  },
);

Deno.test(
  'attachment errors explain the next step without reflecting temporary credentials',
  async () => {
    for (const code of ['unsupported_file_reference', 'invalid_file']) {
      const client = createRestClient('a.b.c', undefined, () =>
        Promise.resolve(
          Response.json(
            { code, message: 'https://private.test/file?token=secret' },
            { status: 400 },
          ),
        ),
      );
      await assert.rejects(client.call('import_document', {}), (error: unknown) => {
        assert(error instanceof Error);
        assert(error.message.includes('https://hiddenjobs.dev/dashboard/career'));
        assert(!error.message.includes('token=secret'));
        return true;
      });
    }
  },
);
