import { createJwksLoader, createJwtVerifier } from '../src/auth.ts';
import { loadConfig, MCP_RESOURCE } from '../src/config.ts';
import { createMcpHandler, type Jobs } from '../src/mcp.ts';
import { createAccountAuthenticator, createResourceServer } from '../src/server.ts';
import { normalizeJobsSearchParams, searchPublicJobs } from '../src/jobs.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';
import { runSmoke } from '../scripts/smoke-test.ts';

function assert(value: unknown, message = 'Assertion failed'): asserts value {
  if (!value) throw new Error(message);
}
const userId = '00000000-0000-4000-8000-000000000001';
const clientId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000003';
const issuer = 'https://identity.example.com/auth/v1';
const identity = { userId, clientId, sessionId };
const config = loadConfig((name) =>
  ({
    SUPABASE_URL: 'https://backend.example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture-server-credential',
    OAUTH_ISSUER: issuer,
  } as Record<string, string>)[name]
);
const jobs: Jobs = {
  search: () => Promise.resolve({ jobs: [{ id: userId, title: 'Engineer' }], totalCount: 1 }),
  get: () => Promise.resolve({ id: userId, title: 'Engineer' }),
  subscribed: () => Promise.resolve(false),
  link: () => Promise.resolve('https://example.com/apply'),
};
const rpc = (method: string, params = {}, token = 'a.b.c') =>
  new Request(MCP_RESOURCE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
const call = (name: string, args = {}) => rpc('tools/call', { name, arguments: args });
const b64 = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const encoded = (value: unknown) => b64(new TextEncoder().encode(JSON.stringify(value)));

async function signer() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const jwk = {
    ...await crypto.subtle.exportKey('jwk', keys.publicKey),
    kid: 'fixture-key',
    use: 'sig',
    alg: 'ES256',
  };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: issuer,
    sub: userId,
    client_id: clientId,
    session_id: sessionId,
    aud: MCP_RESOURCE,
    role: 'mcp_client',
    mcp_access: true,
    iat: now,
    exp: now + 3600,
  };
  return {
    jwk,
    async token(overrides = {}) {
      const body = `${encoded({ alg: 'ES256', kid: 'fixture-key' })}.${
        encoded({ ...claims, ...overrides })
      }`;
      const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.privateKey,
        new TextEncoder().encode(body),
      );
      return `${body}.${b64(new Uint8Array(signature))}`;
    },
  };
}

Deno.test('signature verification rejects changed claims, wrong audiences and ordinary sessions', async () => {
  const signing = await signer();
  const verify = createJwtVerifier(issuer, () => Promise.resolve([signing.jwk]));
  assert((await verify(await signing.token()))?.userId === userId);
  for (
    const claims of [
      { aud: 'authenticated' },
      { iss: 'https://attacker.example.com' },
      { role: 'authenticated' },
      { mcp_access: false },
      { is_anonymous: true },
      { exp: 1 },
      { iat: 9999999999 },
      { nbf: 9999999999 },
      { client_id: '' },
      { session_id: '' },
      { sub: null },
    ]
  ) assert(await verify(await signing.token(claims)) === null);
  const valid = await signing.token();
  const parts = valid.split('.');
  parts[1] = encoded({
    ...JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))),
    sub: clientId,
  });
  assert(await verify(parts.join('.')) === null, 'Modified JWT accepted');
  assert(await verify('not-a-token') === null);
});

Deno.test('JWKS is fetched from the configured URL and cached; outages remain failures', async () => {
  let calls = 0;
  const loader = createJwksLoader(
    `${issuer}/.well-known/jwks.json`,
    ((url: string) => {
      assert(url === `${issuer}/.well-known/jwks.json`);
      calls++;
      return Promise.resolve(Response.json({ keys: [] }));
    }) as typeof fetch,
  );
  await Promise.all([loader(), loader()]);
  await loader();
  assert(calls === 1);
  const signing = await signer();
  const verify = createJwtVerifier(issuer, () => Promise.reject(new Error('offline')));
  let failed = false;
  try {
    await verify(await signing.token());
  } catch {
    failed = true;
  }
  assert(failed, 'Outage was converted into invalid credentials');
});

Deno.test('account validation runs every time and cannot substitute another user', async () => {
  let revoked = false;
  let calls = 0;
  const authenticate = createAccountAuthenticator(() => Promise.resolve(identity), () => {
    calls++;
    return Promise.resolve(revoked ? { ok: false, reason: 'invalid' } : { ok: true, userId });
  });
  assert((await authenticate('fixture')).ok);
  revoked = true;
  assert(!(await authenticate('fixture')).ok && calls === 2);
  const mismatched = createAccountAuthenticator(
    () => Promise.resolve(identity),
    () => Promise.resolve({ ok: true, userId: clientId }),
  );
  let failed = false;
  try {
    await mismatched('fixture');
  } catch {
    failed = true;
  }
  assert(failed);
});

Deno.test('public discovery and unauthenticated calls provide OAuth metadata', async () => {
  let touched = false;
  const handler = createResourceServer(config, () => {
    touched = true;
    throw new Error('unexpected');
  }, jobs);
  const listed = await (await handler(rpc('tools/list', {}, ''))).json();
  assert(listed.result.tools.length === 3);
  assert(
    listed.result.tools.every((t: { securitySchemes: { type: string }[] }) =>
      t.securitySchemes[0].type === 'oauth2'
    ),
  );
  const denied = await handler(rpc('tools/call', { name: 'search_jobs' }, ''));
  assert(
    denied.status === 401 && denied.headers.get('WWW-Authenticate')?.includes(config.metadataUrl),
  );
  assert(denied.headers.get('Access-Control-Expose-Headers')?.includes('WWW-Authenticate'));
  const metadata = await (await handler(new Request(config.metadataUrl))).json();
  assert(
    metadata.resource === MCP_RESOURCE && metadata.authorization_servers[0] === issuer && !touched,
  );
});

Deno.test('subscription is checked for each link request and blocks URL retrieval', async () => {
  let subscribed = true;
  let linkReads = 0;
  const handler = createMcpHandler(() => Promise.resolve({ ok: true, userId }), {
    ...jobs,
    subscribed: () => Promise.resolve(subscribed),
    link: () => {
      linkReads++;
      return Promise.resolve('https://example.com/apply');
    },
  });
  const first = await (await handler(call('open_application_link', { idOrSlug: userId }))).json();
  assert(first.result.structuredContent.data.url);
  subscribed = false;
  const second = await (await handler(call('open_application_link', { idOrSlug: userId }))).json();
  assert(
    second.result.isError && second.result.structuredContent.status === 402 && linkReads === 1,
  );
});

Deno.test('quota, backend failure, missing jobs and missing identifiers retain documented statuses', async () => {
  for (
    const [reason, status] of [['rate_limit', 429], ['backend_error', 503], ['invalid', 401], [
      'scope',
      403,
    ]] as const
  ) {
    const handler = createMcpHandler(() => Promise.resolve({ ok: false, reason }), jobs);
    const result = await (await handler(call('search_jobs'))).json();
    assert(result.result.isError && result.result.structuredContent.status === status);
  }
  const handler = createMcpHandler(() => Promise.resolve({ ok: true, userId }), {
    ...jobs,
    get: () => Promise.resolve(null),
  });
  assert((await (await handler(call('get_job'))).json()).result.structuredContent.status === 400);
  assert(
    (await (await handler(call('get_job', { idOrSlug: userId }))).json()).result.structuredContent
      .status === 404,
  );
  assert((await (await handler(rpc('unknown'))).json()).error.code === -32601);
});

Deno.test('job mapping removes stored application URLs and preserves regional filters', async () => {
  const params = normalizeJobsSearchParams(
    new URLSearchParams({ q: 'typescript', remoteLocation: 'EUROPE', limit: '100' }),
  );
  assert(params.limit === 50 && params.remoteLocation === 'EUROPE');
  const backend = {
    rpc: (_name: string, args: { p_filters: { remoteLocation: string } }) => {
      assert(args.p_filters.remoteLocation === 'EUROPE');
      return Promise.resolve({
        data: {
          jobs: [{
            id: userId,
            url: 'https://example.com/private',
            application_url: 'https://example.com/apply',
            source_url: 'private',
          }],
          totalCount: 1,
        },
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  const result = await searchPublicJobs(backend, params);
  assert(result.jobs[0].hasApplicationLink);
  assert(!JSON.stringify(result).includes('https://example.com/'));
  assert(!('source_url' in result.jobs[0]));
});

Deno.test('configuration fails early and does not include credentials in errors', () => {
  for (
    const values of [{}, {
      SUPABASE_URL: 'http://remote.example.com',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    }]
  ) {
    let message = '';
    try {
      loadConfig((name) => (values as Record<string, string>)[name]);
    } catch (error) {
      message = String(error);
    }
    assert(message && !message.includes('secret'));
  }
});

Deno.test('anonymous and authenticated smoke paths exercise the local resource server', async () => {
  const handler = createResourceServer(
    config,
    (token) =>
      Promise.resolve(token === 'a.b.c' ? { ok: true, userId } : { ok: false, reason: 'invalid' }),
    jobs,
  );
  const fetcher =
    ((input: string | URL | Request, init?: RequestInit) =>
      handler(new Request(input, init))) as typeof fetch;
  const anonymous = await runSmoke({ url: MCP_RESOURCE, fetcher });
  assert(!anonymous.authenticated);
  const signedIn = await runSmoke({
    url: MCP_RESOURCE,
    fetcher,
    token: 'a.b.c',
    checkApplicationLink: true,
  });
  assert(signedIn.authenticated && signedIn.applicationLink);
});
