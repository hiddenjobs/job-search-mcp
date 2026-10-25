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

Deno.test(
  'native file references declare complete optional host metadata and validate nested fields',
  () => {
    const tool = documentTools.find((t) => t.name === 'import_document');
    assert(tool);
    assert.deepEqual(tool._meta, { 'openai/fileParams': ['file'] });
    const schema = tool.inputSchema;
    const fileSchema = (schema.properties as Record<string, Record<string, unknown>>).file;
    assert.deepEqual(Object.keys(fileSchema.properties as object).sort(), [
      'download_url',
      'file_id',
      'file_name',
      'mime_type',
    ]);
    assert.deepEqual(fileSchema.required, ['download_url', 'file_id']);
    const args = {
      filename: 'cv.pdf',
      mimeType: 'application/pdf',
      kind: 'cv',
      requestId: 'native-file-import',
    };
    const file = { download_url: 'https://files.client.test/cv.pdf', file_id: 'file-example' };
    assert(validateCareerArguments(schema, { ...args, file }));
    assert(validateCareerArguments(schema, { ...args, sourceUrl: file.download_url }));
    for (const invalid of [
      { download_url: file.download_url },
      { ...file, download_url: 'x'.repeat(4097) },
      { ...file, file_id: 42 },
      { ...file, access_token: 'secret' },
    ]) {
      assert(!validateCareerArguments(schema, { ...args, file: invalid }));
    }
  },
);
