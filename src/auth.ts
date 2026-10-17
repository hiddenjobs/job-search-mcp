import { MCP_RESOURCE, MCP_ROLE } from './config.ts';

export type NativeIdentity = { userId: string; clientId: string; sessionId: string };
export type AuthResult = { ok: true; userId: string } | { ok: false; reason: string };
export type Authenticate = (token: string) => Promise<AuthResult>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bytes = (s: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('Invalid encoding');
  return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
};
const object = (s: string) => JSON.parse(new TextDecoder().decode(bytes(s)));

// Account OAuth tokens are signed with ECC P-256 (ES256).
// Explicit algorithms and a fixed JWKS URL prevent token-supplied key URLs.
export function createJwtVerifier(
  issuer: string,
  getKeys: () => Promise<JsonWebKey[]>,
  resource = MCP_RESOURCE,
) {
  return async (token: string): Promise<NativeIdentity | null> => {
    if (token.length > 16384) return null;
    let parts: string[], header, claims;
    try {
      parts = token.split('.');
      if (parts.length !== 3) return null;
      header = object(parts[0]);
      claims = object(parts[1]);
      const now = Math.floor(Date.now() / 1000);
      if (
        header.alg !== 'ES256' || typeof header.kid !== 'string' || header.crit ||
        claims.iss !== issuer || claims.aud !== resource || claims.role !== MCP_ROLE ||
        claims.mcp_access !== true || claims.is_anonymous === true ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
        !Number.isSafeInteger(claims.iat) || claims.iat > now + 30 ||
        (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) ||
        !uuid.test(claims.sub) || !uuid.test(claims.client_id) || !uuid.test(claims.session_id)
      ) return null;
    } catch {
      return null;
    }
    const keys = await getKeys(); // Infrastructure failures must remain 503, not a login loop.
    const jwk = keys.find((k) =>
      (k as JsonWebKey & { kid?: string }).kid === header.kid &&
      k.kty === 'EC' && k.crv === 'P-256' && (!k.alg || k.alg === 'ES256') &&
      (!k.use || k.use === 'sig')
    );
    if (!jwk) return null;
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      const valid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        bytes(parts[2]),
        new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      );
      return valid
        ? { userId: claims.sub, clientId: claims.client_id, sessionId: claims.session_id }
        : null;
    } catch {
      return null;
    }
  };
}

export function createJwksLoader(url: string, fetcher: typeof fetch = fetch) {
  let keys: JsonWebKey[] = [], expires = 0;
  let pending: Promise<JsonWebKey[]> | null = null;
  return async () => {
    if (Date.now() < expires) return keys;
    if (!pending) {
      pending = (async () => {
        const r = await fetcher(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
        if (!r.ok) throw new Error('JWKS unavailable');
        const data = await r.json();
        if (!Array.isArray(data.keys) || data.keys.length > 20) throw new Error('Invalid JWKS');
        keys = data.keys;
        expires = Date.now() + 60_000;
        return keys;
      })().finally(() => {
        pending = null;
      });
    }
    return pending;
  };
}
