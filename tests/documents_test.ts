import { documentTools, CHUNK_BYTES, decodeChunk } from '../src/tools/documents.ts';
import { validateCareerArguments } from '../src/tools/validation.ts';
import { assert } from './helpers.ts';
Deno.test('file chunks fit the MCP request size and reject malformed base64', () => {
  const args = {
    documentId: '00000000-0000-0000-0000-000000000001',
    index: 0,
    base64: btoa('a'.repeat(CHUNK_BYTES)),
  };
  const tool = documentTools.find((t) => t.name === 'upload_document_chunk');
  assert(tool);
  const schema = tool.inputSchema;
  assert(validateCareerArguments(schema, args));
  assert(
    new TextEncoder().encode(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'upload_document_chunk', arguments: args },
      }),
    ).length < 16384,
  );
  assert(decodeChunk(args.base64).length === CHUNK_BYTES);
  assert(!validateCareerArguments(schema, { ...args, userId: args.documentId }));
  assert.throws(() => decodeChunk('not base64'));
});

Deno.test('document chunks reject empty, oversized and noncanonical encodings', () => {
  for (const value of [null, '', 'x'.repeat(10925), btoa('x'.repeat(CHUNK_BYTES + 1)), 'Zh==']) {
    assert.throws(() => decodeChunk(value), { code: 'invalid_arguments', status: 400 });
  }
});
