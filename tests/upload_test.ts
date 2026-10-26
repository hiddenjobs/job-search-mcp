import { createCvUpload, MAX_CV_BYTES, type UploadBridge } from '../src/ui/upload.ts';
import { UPLOAD_URI, uploadPanelResource, uploadCvTool } from '../src/ui/panel.ts';
import { createMcpHandler } from '../src/server.ts';
import { assert, rpc, readRpc, UUID } from './helpers.ts';

const CV = '00000000-0000-4000-8000-000000000002';
const VERSION = '00000000-0000-4000-8000-000000000003';
const file = () => new File(['%PDF-1.7\noriginal bytes'], 'cv.pdf', { type: 'application/pdf' });
function fixture() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const puts: { url: string; file: File; headers: Record<string, string> }[] = [];
  let hash: unknown;
  const row: Record<string, unknown> = {
    id: UUID,
    state: 'pending',
    uploadUrl: 'https://uploads.example.test/original?token=private',
    method: 'PUT',
  };
  const version = { id: VERSION, cv_id: CV, document_id: UUID, version: 1 };
  const bridge: UploadBridge = {
    origins: ['https://uploads.example.test'],
    put: (url, file, headers) => {
      puts.push({ url, file, headers });
      return Promise.resolve();
    },
    call: (name, args) => {
      calls.push({ name, args });
      if (name === 'create_document_upload') {
        hash = args.sha256;
        return Promise.resolve(row);
      }
      if (name === 'finalize_document_upload')
        return Promise.resolve({ id: UUID, state: 'ready', byte_size: file().size, sha256: hash });
      if (name === 'save_cv') return Promise.resolve(version);
      return Promise.resolve({ id: CV, name: 'My CV', versions: { items: [version] } });
    },
  };
  return { bridge, row, version, calls, puts };
}
Deno.test(
  'CV panel sends original bytes, verifies them and saves a new immutable version only once',
  async () => {
    const f = fixture(),
      original = file();
    const save = createCvUpload(original, '  My CV  ', f.bridge);
    const progress: string[] = [];
    const result = await save((message) => progress.push(message));
    assert.deepEqual(result, { cvId: CV, versionId: VERSION, version: 1, name: 'My CV' });
    assert.deepEqual(await save(() => undefined), result);
    assert.deepEqual(
      f.calls.map((x) => x.name),
      ['create_document_upload', 'finalize_document_upload', 'save_cv', 'get_cv'],
    );
    assert.equal(f.puts.length, 1);
    assert.deepEqual(
      new Uint8Array(await f.puts[0].file.arrayBuffer()),
      new Uint8Array(await original.arrayBuffer()),
    );
    assert.deepEqual(f.puts[0].headers, { 'Content-Type': 'application/pdf' });
    assert.equal(f.calls[2].args.expectedRevision, 0);
    assert(!Object.hasOwn(f.calls[2].args, 'cvId'));
    assert.equal(progress.length, 4);
  },
);
Deno.test('CV panel validates names and file limits before requesting any private upload', () => {
  const { bridge } = fixture();
  for (const invalid of [
    new File([], 'empty.pdf'),
    new File(['x'], 'bad.exe'),
    new File(['x'], 'x'.repeat(201) + '.pdf'),
    new File([new Uint8Array(MAX_CV_BYTES + 1)], 'large.pdf'),
  ]) {
    assert.throws(() => createCvUpload(invalid, 'My CV', bridge), /PDF or DOCX/);
  }
  for (const name of ['', ' ', 'x'.repeat(201)])
    assert.throws(() => createCvUpload(file(), name, bridge), /CV name/);
});
Deno.test(
  'CV panel supports DOCX and rejects unapproved destinations and malformed sessions',
  async () => {
    for (const change of [
      { id: 'invalid' },
      { uploadUrl: 'invalid' },
      { uploadUrl: 'https://evil.example.test/file' },
      { uploadUrl: 'http://uploads.example.test/file' },
      { uploadUrl: 'https://user@uploads.example.test/file' },
      { uploadUrl: 'https://user:pass@uploads.example.test/file' },
      { uploadUrl: 'https://uploads.example.test/file#fragment' },
      { method: 'POST' },
    ]) {
      const f = fixture();
      Object.assign(f.row, change);
      await assert.rejects(createCvUpload(file(), 'My CV', f.bridge)(() => undefined));
      assert.equal(f.puts.length, 0);
      assert.equal(f.calls.length, 1);
    }
    const f = fixture();
    f.bridge.call = (name, args) => {
      f.calls.push({ name, args });
      return Promise.reject(new Error('stop after metadata'));
    };
    await assert.rejects(
      createCvUpload(new File(['docx'], 'CV.DOCX'), 'My CV', f.bridge)(() => undefined),
    );
    assert.equal(
      f.calls[0].args.mimeType,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  },
);
Deno.test('failed transfer cannot save or silently retry an uncertain upload', async () => {
  const f = fixture();
  f.bridge.put = () => Promise.reject(new Error('private URL must not leak'));
  const save = createCvUpload(file(), 'My CV', f.bridge);
  await assert.rejects(
    save(() => undefined),
    /Upload failed/,
  );
  await assert.rejects(
    save(() => undefined),
    /Select the file again/,
  );
  assert.deepEqual(
    f.calls.map((x) => x.name),
    ['create_document_upload'],
  );
});
Deno.test(
  'finalization retries retain the successful upload and cannot save mismatched documents',
  async () => {
    const f = fixture(),
      call = f.bridge.call;
    let fail = true;
    f.bridge.call = (name, args) => {
      if (name === 'finalize_document_upload' && fail) {
        fail = false;
        return Promise.reject(new Error('temporary'));
      }
      return call(name, args);
    };
    const save = createCvUpload(file(), 'My CV', f.bridge);
    await assert.rejects(save(() => undefined));
    await save(() => undefined);
    assert.equal(f.puts.length, 1);
    for (const mismatch of [
      { id: CV },
      { state: 'pending' },
      { byte_size: 1 },
      { sha256: 'wrong' },
    ]) {
      const broken = fixture(),
        originalCall = broken.bridge.call;
      broken.bridge.call = async (name, args) => ({
        ...(await originalCall(name, args)),
        ...(name === 'finalize_document_upload' ? mismatch : {}),
      });
      await assert.rejects(
        createCvUpload(file(), 'My CV', broken.bridge)(() => undefined),
        /verification failed/,
      );
      assert(!broken.calls.some((x) => x.name === 'save_cv'));
    }
  },
);
Deno.test(
  'save retries reuse the exact document and write key; verification retries never create another CV',
  async () => {
    const f = fixture(),
      call = f.bridge.call;
    let failSave = true,
      failRead = true;
    const saveKeys: unknown[] = [];
    f.bridge.call = (name, args) => {
      if (name === 'save_cv') {
        saveKeys.push(args.requestId);
        if (failSave) {
          failSave = false;
          return Promise.reject(new Error('lost response'));
        }
      }
      if (name === 'get_cv' && failRead) {
        failRead = false;
        return Promise.resolve({ id: CV, name: 'My CV', versions: null });
      }
      return call(name, args);
    };
    const save = createCvUpload(file(), 'My CV', f.bridge);
    await assert.rejects(save(() => undefined));
    await assert.rejects(
      save(() => undefined),
      /saved version/,
    );
    await save(() => undefined);
    assert.equal(saveKeys.length, 2);
    assert.equal(saveKeys[0], saveKeys[1]);
    assert.equal(f.puts.length, 1);
  },
);
Deno.test('CV panel fails closed on inconsistent CV versions and metadata', async () => {
  for (const mismatch of [
    { cv_id: 'invalid' },
    { id: 'invalid' },
    { document_id: CV },
    { version: 2 },
  ]) {
    const f = fixture();
    Object.assign(f.version, mismatch);
    await assert.rejects(
      createCvUpload(file(), 'My CV', f.bridge)(() => undefined),
      /save could not be verified/,
    );
  }
  for (const mismatch of [
    { id: UUID },
    { name: 'Other' },
    { versions: { items: [] } },
    { versions: { items: [null, { id: VERSION, document_id: CV, version: 1 }] } },
    { versions: { items: [{ id: VERSION, document_id: UUID, version: 2 }] } },
  ]) {
    const f = fixture(),
      call = f.bridge.call;
    f.bridge.call = (name, args) =>
      name === 'get_cv'
        ? Promise.resolve({ id: CV, name: 'My CV', versions: { items: [f.version] }, ...mismatch })
        : call(name, args);
    await assert.rejects(
      createCvUpload(file(), 'My CV', f.bridge)(() => undefined),
      /saved version/,
    );
  }
});
Deno.test(
  'an already-ready upload skips PUT and concurrent clicks cannot start duplicate writes',
  async () => {
    const f = fixture();
    f.row.state = 'ready';
    await createCvUpload(file(), 'My CV', f.bridge)(() => undefined);
    assert.equal(f.puts.length, 0);
    const concurrent = fixture();
    let release: (() => void) | undefined;
    concurrent.bridge.put = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const save = createCvUpload(file(), 'My CV', concurrent.bridge),
      first = save(() => undefined);
    while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
    await assert.rejects(
      save(() => undefined),
      /already running/,
    );
    release();
    await first;
  },
);
Deno.test(
  'UI resource is static, isolated to approved storage and does not expose account credentials',
  async () => {
    const panel = uploadPanelResource([
      'https://uploads.example.test',
      'https://uploads.example.test',
    ]);
    assert.deepEqual(panel.contents[0]._meta.ui.csp.connectDomains, [
      'https://uploads.example.test',
    ]);
    assert.equal(panel.contents[0].uri, UPLOAD_URI);
    assert(panel.contents[0].text.includes('Save in Hidden Jobs'));
    assert(!panel.contents[0].text.includes('__UPLOAD_CONFIG__'));
    for (const origin of [
      'http://evil.test',
      'https://uploads.test/path',
      'https://uploads.test?x=1',
    ])
      assert.throws(() => uploadPanelResource([origin]));
    const calls: string[] = [];
    const handler = createMcpHandler({
      execute: (_token, name) => {
        calls.push(name);
        return Promise.resolve({});
      },
    });
    assert.equal(uploadCvTool._meta.ui.resourceUri, UPLOAD_URI);
    const denied = await handler(rpc('tools/call', { name: 'upload_cv' }, ''));
    assert.equal(denied.status, 401);
    const opened = await readRpc(
      await handler(rpc('tools/call', { name: 'upload_cv', arguments: { name: 'My CV' } })),
    );
    assert.equal(opened.result.isError, false);
    assert.deepEqual(calls, ['get_candidate_profile']);
    assert(!JSON.stringify(opened).includes('uploadUrl'));
  },
);
