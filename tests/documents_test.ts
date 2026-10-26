import { documentTools } from '../src/tools/documents.ts';
import { validateCareerArguments } from '../src/tools/validation.ts';
import { assert } from './helpers.ts';
Deno.test('uploads accept signed transfers and reject removed chunk mode', () => {
  const tool = documentTools.find((t) => t.name === 'create_document_upload');
  assert(tool);
  const args = {
    filename: 'cv.pdf',
    mimeType: 'application/pdf',
    kind: 'cv',
    byteSize: 178302,
    sha256: 'a'.repeat(64),
    mode: 'signed',
    requestId: 'signed-upload-test',
  };
  assert(validateCareerArguments(tool.inputSchema, args));
  assert(!validateCareerArguments(tool.inputSchema, { ...args, mode: 'chunks' }));
  assert(!documentTools.some((t) => t.name === 'upload_document_chunk'));
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
