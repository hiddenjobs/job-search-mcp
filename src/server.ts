import { CareerError } from './errors.ts';
import {
  PROACTIVE_INSTRUCTIONS,
  SEARCH_INSTRUCTIONS,
  CAREER_INSTRUCTIONS,
  DOCUMENT_UPLOAD_INSTRUCTIONS,
} from './resources/workflows.ts';
import { careerResources, isSharedResource } from './resources/index.ts';
import { getTools } from './tools/index.ts';
import { validateCareerArguments as validateArguments } from './tools/validation.ts';

export type ExecuteTool = (
  token: string,
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

interface HandlerOptions {
  execute: ExecuteTool;
  metadataUrl?: string;
  careerEnabled?: boolean;
  uploadOrigins?: string[];
}
const RESOURCE_METADATA = 'https://hiddenjobs.dev/.well-known/oauth-protected-resource/mcp';
const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'MCP-Protocol-Version': '2025-06-18',
};
const response = (id: unknown, result: unknown, status = 200, extra = {}) =>
  Response.json({ jsonrpc: '2.0', id, result }, { status, headers: { ...headers, ...extra } });
const error = (id: unknown, code: number, message: string) =>
  Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { headers });
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const string = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const toolError = (message: string, status: number, code: string) => ({
  isError: true,
  content: [{ type: 'text', text: message }],
  structuredContent: { error: code, status },
});

/** HTTP/JSON-RPC transport. The REST backend owns all account authorization. */
export function createMcpHandler({
  execute,
  metadataUrl = RESOURCE_METADATA,
  careerEnabled = true,
  uploadOrigins,
}: HandlerOptions) {
  const tools = getTools(careerEnabled);
  const denied = (id: unknown, failure: CareerError) => {
    const www = `Bearer resource_metadata="${metadataUrl}", error="${
      failure.status === 403 ? 'insufficient_scope' : 'invalid_token'
    }", error_description="Authorize Hidden Jobs access.", scope="email"`;
    return response(
      id,
      {
        ...toolError(failure.message, failure.status, failure.code),
        _meta: { 'mcp/www_authenticate': [www] },
      },
      failure.status,
      { 'WWW-Authenticate': www },
    );
  };
  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return new Response(null, {
        status: request.method === 'OPTIONS' ? 204 : 405,
        headers: { Allow: 'POST, OPTIONS' },
      });
    }
    if (Number(request.headers.get('content-length') ?? 0) > 16384) {
      return new Response(null, { status: 413 });
    }
    let message: unknown;
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).length > 16384) return new Response(null, { status: 413 });
      message = JSON.parse(body);
    } catch {
      return error(null, -32700, 'Parse error');
    }
    if (!record(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return error(null, -32600, 'Invalid Request');
    }
    const id = message.id ?? null;
    const params = message.params ?? {};
    if (!record(params)) return error(id, -32602, 'Invalid parameters');
    if (message.method.startsWith('notifications/')) return new Response(null, { status: 202 });
    if (message.method === 'ping') return response(id, {});
    if (message.method === 'initialize') {
      return response(id, {
        protocolVersion: '2025-06-18',
        capabilities: {
          tools: { listChanged: false },
          ...(careerEnabled ? { extensions: { 'io.modelcontextprotocol/ui': {} } } : {}),
          ...(careerEnabled
            ? {
                resources: { subscribe: false, listChanged: false },
                prompts: { listChanged: false },
              }
            : {}),
        },
        serverInfo: { name: 'hidden-jobs-mcp-oauth', version: '2.0.0' },
        instructions: careerEnabled
          ? `${PROACTIVE_INSTRUCTIONS}\n\n${SEARCH_INSTRUCTIONS}\n\n${CAREER_INSTRUCTIONS}\n\n${DOCUMENT_UPLOAD_INSTRUCTIONS}`
          : SEARCH_INSTRUCTIONS,
      });
    }
    if (message.method === 'tools/list') return response(id, { tools });
    if (careerEnabled) {
      if (message.method === 'resources/list') return response(id, careerResources.resourceList());
      if (message.method === 'resources/templates/list') {
        return response(id, {
          resourceTemplates: [
            {
              uriTemplate: 'hiddenjobs://me/profile',
              name: 'Your profile',
              mimeType: 'application/json',
            },
            ...['cvs', 'applications', 'documents'].map((type) => ({
              uriTemplate: `hiddenjobs://me/${type}/{id}`,
              name: type,
              mimeType: 'application/json',
            })),
          ],
        });
      }
      if (message.method === 'prompts/list') return response(id, careerResources.promptList());
      if (message.method === 'prompts/get') {
        try {
          return response(id, careerResources.getPrompt(string(params.name)));
        } catch {
          return error(id, -32602, 'Unknown prompt');
        }
      }
    }
    const resourceRead = careerEnabled && message.method === 'resources/read';
    if (message.method !== 'tools/call' && !resourceRead) {
      return error(id, -32601, 'Method not found');
    }
    const name = string(params.name);
    const uri = string(params.uri);
    const definition = tools.find((tool) => tool.name === name);
    if (!resourceRead && !definition) return error(id, -32602, 'Unknown tool');
    const args = params.arguments ?? {};
    if (
      !record(args) ||
      (!resourceRead && definition && !validateArguments(definition.inputSchema, args))
    ) {
      return error(id, -32602, 'Invalid tool arguments');
    }
    const token =
      request.headers
        .get('authorization')
        ?.match(/^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i)?.[1] ?? '';
    const sharedRead = resourceRead && isSharedResource(uri);
    if (!sharedRead && !token) {
      return denied(id, new CareerError('invalid', 'Authorization required.', 401));
    }
    try {
      if (resourceRead) {
        return response(
          id,
          await careerResources.readResource(
            uri,
            (operation, arguments_ = {}) => execute(token, operation, arguments_),
            uploadOrigins,
          ),
        );
      }
      if (name === 'upload_cv') {
        // A presentation-only tool. REST still validates this account before showing the panel.
        await execute(token, 'get_candidate_profile', {});
        return response(id, {
          isError: false,
          content: [
            {
              type: 'text',
              text: 'Select your PDF or DOCX in the upload panel and confirm the save. Wait for the user; the CV is not saved yet. If the panel is unavailable, use https://hiddenjobs.dev/dashboard/career.',
            },
          ],
          structuredContent: { name: args.name ?? '' },
        });
      }
      const wrapped = { data: await execute(token, name, args) };
      return response(id, {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(wrapped) }],
        structuredContent: wrapped,
      });
    } catch (caught) {
      const failure =
        caught instanceof CareerError
          ? caught
          : new CareerError('backend_error', 'Hidden Jobs is temporarily unavailable.', 503);
      if (
        failure.status === 401 ||
        (failure.status === 403 && failure.code === 'insufficient_scope')
      )
        return denied(id, failure);
      if (resourceRead) {
        return error(id, -32002, sharedRead ? 'Resource not found' : failure.message);
      }
      return response(id, toolError(failure.message, failure.status, failure.code));
    }
  };
}
