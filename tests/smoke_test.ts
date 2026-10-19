import { runSmoke } from '../scripts/smoke-test.ts';
import { createRestMcpHandler } from '../src/index.ts';
import { assert, UUID } from './helpers.ts';

Deno.test(
  'smoke check exercises discovery, OAuth metadata, search, detail and application access',
  async () => {
    let subscribed = false;
    const server = Deno.serve(
      {
        hostname: '127.0.0.1',
        port: 0,
        onListen() {
          /* Keep test output quiet. */
        },
      },
      (request) => {
        const resource = new URL('/mcp', request.url).href;
        if (new URL(request.url).pathname === '/metadata') {
          return Response.json({
            resource,
            authorization_servers: ['https://api.hiddenjobs.dev'],
            scopes_supported: ['email'],
          });
        }
        return createRestMcpHandler({
          metadataUrl: new URL('/metadata', request.url).href,
          fetcher: (input) => {
            const path = new URL(input instanceof Request ? input.url : input).pathname;
            if (path.endsWith('/application-link')) {
              return Promise.resolve(
                subscribed
                  ? Response.json({ data: { url: 'https://example.test/apply' } })
                  : Response.json({ code: 'subscription_required' }, { status: 402 }),
              );
            }
            return Promise.resolve(
              Response.json({
                data: path.endsWith('/jobs')
                  ? { jobs: [{ id: UUID, source: 'hiddenjobs' }] }
                  : { id: UUID },
              }),
            );
          },
        })(request);
      },
    );
    try {
      const url = `http://127.0.0.1:${server.addr.port}/mcp`;
      assert.deepEqual(await runSmoke({ url, resource: url }), {
        authenticated: false,
        applicationLink: false,
      });
      for (const access of [false, true]) {
        subscribed = access;
        assert.deepEqual(
          await runSmoke({ url, resource: url, token: 'a.b.c', checkApplicationLink: true }),
          { authenticated: true, applicationLink: true },
        );
      }
    } finally {
      await server.shutdown();
    }
  },
);
