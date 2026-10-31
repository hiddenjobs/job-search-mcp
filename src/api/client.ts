import { assertRemoteLocation, remoteLocationError } from '../locations.ts';
import { CareerError } from '../errors.ts';
import { restRoutes } from './routes.ts';

export const DEFAULT_API_URL = 'https://api.hiddenjobs.dev/v1';

/** A client is bound to one request's OAuth token, never shared between users. */
export function createRestClient(
  token: string,
  baseUrl = DEFAULT_API_URL,
  fetcher: typeof fetch = fetch,
) {
  const base = new URL(baseUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (
    (base.protocol !== 'https:' && !(local && base.protocol === 'http:')) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error('Invalid REST API base URL');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new CareerError('invalid_token', 'Authorize your Hidden Jobs account.', 401);
  }
  const prefix = base.href.replace(/\/$/, '');
  return {
    async call(name: string, args: Record<string, unknown> = {}) {
      const route = Object.hasOwn(restRoutes, name) ? restRoutes[name] : undefined;
      if (!route) throw new CareerError('not_found', 'Unknown tool.', 404);
      if (name === 'search_jobs' && Object.hasOwn(args, 'remoteLocation')) {
        assertRemoteLocation(args.remoteLocation);
      }
      const pathKeys = new Set<string>();
      const path = route.path.replace(/\{(\w+)\}/g, (_, key: string) => {
        const value = args[key];
        pathKeys.add(key);
        if (
          (typeof value !== 'string' && typeof value !== 'number') ||
          !String(value).trim() ||
          ['.', '..'].includes(String(value)) ||
          /[\\/]/.test(String(value))
        ) {
          throw new CareerError('invalid_arguments', `Invalid ${key}.`, 400);
        }
        return encodeURIComponent(String(value));
      });
      const remaining = Object.fromEntries(
        Object.entries(args)
          .filter(([key]) => !pathKeys.has(key))
          .map(([key, value]) => [name === 'search_jobs' && key === 'query' ? 'q' : key, value]),
      );
      const url = new URL(prefix + path);
      if (route.method === 'GET') {
        for (const [key, value] of Object.entries(remaining)) {
          if (value === undefined) continue;
          if (
            name === 'search_jobs' &&
            key === 'sources' &&
            Array.isArray(value) &&
            value.every((item: unknown) => typeof item === 'string')
          ) {
            url.searchParams.set(key, value.join(','));
            continue;
          }
          if (
            name === 'search_jobs' &&
            key === 'cursors' &&
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
          ) {
            url.searchParams.set(key, JSON.stringify(value));
            continue;
          }
          if (
            value !== null &&
            typeof value !== 'string' &&
            typeof value !== 'number' &&
            typeof value !== 'boolean'
          ) {
            throw new CareerError('invalid_arguments', `Invalid ${key}.`, 400);
          }
          url.searchParams.set(key, String(value));
        }
      }
      let response: Response;
      try {
        response = await fetcher(url, {
          method: route.method,
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(route.method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(route.method === 'GET' ? {} : { body: JSON.stringify(remaining) }),
        });
      } catch {
        throw new CareerError('backend_error', 'Hidden Jobs API is temporarily unavailable.', 503);
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new CareerError('backend_error', 'Invalid API response.', 503);
      }
      const payload =
        body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
      if (!response.ok) {
        // Never include arbitrary upstream text, URLs, tokens or stack traces in MCP errors.
        const code =
          typeof payload.code === 'string' && /^[a-z_]{1,60}$/.test(payload.code)
            ? payload.code
            : 'backend_error';
        const messages: Record<string, string> = {
          invalid_token: 'Reconnect your Hidden Jobs account.',
          subscription_required:
            'Account action is required. Visit https://hiddenjobs.dev/dashboard/account?from=mcp.',
          mcp_trial_expired:
            'Account action is required to continue. Visit https://hiddenjobs.dev/dashboard/account?from=mcp. Your saved documents remain available.',
          insufficient_scope: 'This connection does not have the required permission.',
          revision_conflict: 'This record changed. Read it again before saving.',
          not_found: 'The requested record was not found.',
          invalid_arguments: 'Invalid operation arguments.',
          invalid_remote_location: remoteLocationError,
          unsupported_file_reference:
            'This attachment origin is not approved. Use a supported file reference or upload at https://hiddenjobs.dev/dashboard/career.',
          invalid_file:
            'The file could not be downloaded or verified. Request a fresh supported attachment reference or upload at https://hiddenjobs.dev/dashboard/career.',
          email_unconfirmed:
            'Confirm your Hidden Jobs email address before creating, changing or resuming email alerts.',
          alert_limit:
            'You can save up to five job alerts. Update or delete an existing alert first.',
          rate_limit: 'Request limit reached. Wait before retrying.',
        };
        throw new CareerError(
          code,
          Object.hasOwn(messages, code)
            ? messages[code]
            : 'Hidden Jobs could not complete this operation.',
          response.status,
        );
      }
      if (!Object.hasOwn(payload, 'data')) {
        throw new CareerError('backend_error', 'Invalid API response.', 503);
      }
      return payload.data;
    },
  };
}
