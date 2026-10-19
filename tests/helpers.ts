import assert from 'node:assert/strict';

export { assert };
export const UUID = '00000000-0000-4000-8000-000000000001';
export const TOKEN = 'a.b.c';
export const rpc = (method: string, params: unknown = {}, token = TOKEN) =>
  new Request('https://hiddenjobs.dev/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

// Test assertions verify the wire contract; keep JSON's implicit any at this boundary.
interface RpcReply {
  result: {
    protocolVersion: string;
    capabilities: { resources?: { subscribe: boolean } };
    tools: import('../src/tools/schemas.ts').ToolDefinition[];
    resourceTemplates: { uriTemplate: string }[];
    prompts: { name: string }[];
    messages: { content: { text: string } }[];
    contents: { uri: string; text: string }[];
    isError: boolean;
    structuredContent: { status: number; error: string; data: Record<string, unknown> };
  };
  error: { code: number };
}
export const readRpc = (response: Response): Promise<RpcReply> =>
  response.json() as Promise<RpcReply>;
export const parseResource = (text: string) => JSON.parse(text) as Record<string, unknown>;
