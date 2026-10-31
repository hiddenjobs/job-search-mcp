import { documentTools } from '../src/tools/documents.ts';
import { assert } from './helpers.ts';
Deno.test(
  'original uploads have one public panel entry point, without attachment or byte-transfer tools',
  () => {
    for (const name of [
      'create_document_upload',
      'finalize_document_upload',
      'import_document',
      'upload_document_chunk',
    ])
      assert(!documentTools.some((tool) => tool.name === name));
    assert(documentTools.some((tool) => tool.name === 'save_document'));
  },
);
