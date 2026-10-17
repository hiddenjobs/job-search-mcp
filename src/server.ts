import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  type Authenticate,
  createJwksLoader,
  createJwtVerifier,
  type NativeIdentity,
} from './auth.ts';
import { type Config, loadConfig } from './config.ts';
import { createMcpHandler, type Jobs } from './mcp.ts';
import {
  getApplicationLink,
  getPublicJob,
  hasActiveSubscription,
  normalizeJobsSearchParams,
  searchPublicJobs,
} from './jobs.ts';

export function createAccountAuthenticator(
  verify: (token: string) => Promise<NativeIdentity | null>,
  consume: (identity: NativeIdentity) => Promise<unknown>,
): Authenticate {
  return async (token) => {
    const identity = await verify(token);
    if (!identity) return { ok: false, reason: 'invalid' };
    const data = await consume(identity) as
      | { ok?: boolean; userId?: string; reason?: string }
      | null;
    if (data?.ok === true && data.userId === identity.userId) {
      return { ok: true, userId: identity.userId };
    }
    if (data?.ok === false && typeof data.reason === 'string') {
      return { ok: false, reason: data.reason };
    }
    throw new Error('Account validation unavailable');
  };
}

export function createResourceServer(config: Config, authenticate: Authenticate, jobs: Jobs) {
  const handle = createMcpHandler(authenticate, jobs, config.metadataUrl);
  const metadataPath = new URL(config.metadataUrl).pathname;
  return async (req: Request): Promise<Response> => {
    let response: Response;
    if (req.method === 'GET' && new URL(req.url).pathname === metadataPath) {
      response = Response.json({
        resource: config.resource,
        resource_name: 'Hidden Jobs',
        authorization_servers: [config.issuer],
        scopes_supported: ['email'],
        bearer_methods_supported: ['header'],
      });
    } else response = await handle(req);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
    );
    response.headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, MCP-Protocol-Version');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };
}

export function createServerFromEnv() {
  const config = loadConfig();
  const client = createClient(config.backendUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verify = createJwtVerifier(
    config.issuer,
    createJwksLoader(`${config.issuer}/.well-known/jwks.json`),
    config.resource,
  );
  const authenticate = createAccountAuthenticator(verify, async (identity) => {
    const { data, error } = await client.rpc('mcp_native_consume', {
      p_user_id: identity.userId,
      p_client_id: identity.clientId,
      p_session_id: identity.sessionId,
    });
    if (error) throw new Error('Account validation unavailable');
    return data;
  });
  return createResourceServer(config, authenticate, {
    search: (args) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(args)) {
        if (typeof value === 'string' || typeof value === 'number') {
          params.set(key === 'query' ? 'q' : key, String(value));
        }
      }
      return searchPublicJobs(client, normalizeJobsSearchParams(params));
    },
    get: (id) => getPublicJob(client, id),
    subscribed: (userId) => hasActiveSubscription(client, userId),
    link: (id) => getApplicationLink(client, id),
  });
}
