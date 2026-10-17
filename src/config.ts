export const MCP_RESOURCE = 'https://hiddenjobs.dev/mcp';
export const MCP_ROLE = 'mcp_client';
export type Config = {
  backendUrl: string;
  serviceKey: string;
  issuer: string;
  resource: string;
  metadataUrl: string;
};

export function loadConfig(env: (name: string) => string | undefined = Deno.env.get): Config {
  const required = (name: string) => {
    const value = env(name)?.trim();
    if (!value) throw new Error(`Missing required setting: ${name}`);
    return value;
  };
  const url = (value: string, name: string) => {
    const parsed = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
      parsed.username || parsed.password || parsed.search || parsed.hash
    ) throw new Error(`Invalid URL setting: ${name}`);
    return parsed.href.replace(/\/$/, '');
  };
  const backendUrl = url(required('SUPABASE_URL'), 'SUPABASE_URL');
  const resource = url(env('MCP_RESOURCE_URL') || MCP_RESOURCE, 'MCP_RESOURCE_URL');
  const parsed = new URL(resource);
  return {
    backendUrl,
    serviceKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    issuer: url(env('OAUTH_ISSUER') || `${backendUrl}/auth/v1`, 'OAUTH_ISSUER'),
    resource,
    metadataUrl: `${parsed.origin}/.well-known/oauth-protected-resource${
      parsed.pathname === '/' ? '' : parsed.pathname
    }`,
  };
}
