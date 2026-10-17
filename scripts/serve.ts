import { createServerFromEnv } from '../src/server.ts';
const port = Number(Deno.env.get('PORT') || 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
Deno.serve({ hostname: Deno.env.get('HOST') || '127.0.0.1', port }, createServerFromEnv());
