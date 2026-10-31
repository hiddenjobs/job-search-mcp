import { parseUploadStatus, saveCvFile, uploadCapability, MAX_CV_BYTES } from '../src/ui/upload.ts';
import { uploadPanelResource } from '../src/ui/panel.ts';
import { createMcpHandler } from '../src/server.ts';
import { assert, rpc, readRpc, UUID } from './helpers.ts';
const session = {
  sessionId: UUID,
  uploadUrl: `https://hiddenjobs.dev/mcp/upload#${UUID}.${'a'.repeat(64)}`,
  expiresAt: '2030-01-01T00:00:00Z',
};
const cv = { cvId: UUID, versionId: UUID, version: 1, name: 'My CV' };
Deno.test(
  'new discovery bypasses cached v1 panels while old resource references still resolve',
  async () => {
    const handler = createMcpHandler({
      execute: () => Promise.reject(new Error('No account call expected')),
    });
    const listed = await readRpc(await handler(rpc('tools/list', {}, '')));
    const tool = listed.result.tools.find((tool) => tool.name === 'upload_cv');
    const uri = tool?._meta?.['ui/resourceUri'];
    assert.equal(typeof uri, 'string');
    assert.notEqual(uri, 'ui://hiddenjobs/upload-cv-v1.html');
    const current = await readRpc(await handler(rpc('resources/read', { uri }, '')));
    const legacyUri = 'ui://hiddenjobs/upload-cv-v1.html';
    const legacy = await readRpc(await handler(rpc('resources/read', { uri: legacyUri }, '')));
    assert.equal(current.result.contents[0].uri, uri);
    assert.equal(legacy.result.contents[0].uri, legacyUri);
    assert.equal(legacy.result.contents[0].text, current.result.contents[0].text);
  },
);
Deno.test(
  'both forms send the exact original file directly with a limited capability',
  async () => {
    const file = new File(['original bytes'], 'cv.pdf', { type: 'application/pdf' });
    let calls = 0;
    const saved = await saveCvFile(
      file,
      'My CV',
      session,
      'https://hiddenjobs.dev',
      async (url, init) => {
        calls++;
        assert(init);
        assert.equal(url, `https://hiddenjobs.dev/api/cv-uploads/${UUID}`);
        assert.equal(init.credentials, 'omit');
        assert.equal(init.redirect, 'error');
        assert.equal(
          (init.headers as Record<string, string>).Authorization,
          `Bearer ${'a'.repeat(64)}`,
        );
        const form = init.body as FormData;
        assert.equal(await (form.get('file') as File).text(), await file.text());
        return Response.json({ data: { status: 'saved', cv } });
      },
    );
    assert.deepEqual(saved, cv);
    assert.equal(calls, 1);
  },
);
Deno.test(
  'invalid destinations, unsupported files, expired capabilities and unverified saves fail closed',
  async () => {
    for (const uploadUrl of [
      session.uploadUrl.replace('hiddenjobs.dev', 'evil.test'),
      session.uploadUrl.replace('/mcp/upload', '/dashboard'),
      session.uploadUrl.replace('#', '?token='),
    ])
      assert.throws(() => uploadCapability({ ...session, uploadUrl }));
    for (const file of [
      new File(['x'], 'cv.txt'),
      new File([], 'cv.pdf'),
      new File([new Uint8Array(MAX_CV_BYTES + 1)], 'cv.pdf'),
    ])
      await assert.rejects(saveCvFile(file, 'My CV', session));
    const file = new File(['original'], 'cv.pdf');
    for (const response of [
      () => Response.json({}, { status: 403 }),
      () => Response.json({ data: { status: 'pending' } }),
      () => Response.json({ data: { status: 'saved', cv: { ...cv, version: 2 } } }),
    ])
      await assert.rejects(
        saveCvFile(file, 'My CV', session, undefined, () => Promise.resolve(response())),
      );
  },
);
Deno.test(
  'upload_cv returns an expiring terminal link and removed methods cannot execute',
  async () => {
    const calls: string[] = [];
    const handler = createMcpHandler({
      execute: (_token, name) => {
        calls.push(name);
        return Promise.resolve(session);
      },
    });
    const opened = await readRpc(
      await handler(rpc('tools/call', { name: 'upload_cv', arguments: { name: 'My CV' } })),
    );
    assert.equal(opened.result.isError, false);
    assert.deepEqual(calls, ['create_cv_upload']);
    assert.equal(
      (opened.result.structuredContent as unknown as Record<string, unknown>).uploadUrl,
      session.uploadUrl,
    );
    for (const name of ['import_document', 'create_document_upload', 'finalize_document_upload']) {
      const result = await readRpc(await handler(rpc('tools/call', { name })));
      assert.equal(result.error.code, -32602);
    }
    assert.equal(calls.length, 1);
    const denied = await handler(rpc('tools/call', { name: 'upload_cv' }, ''));
    assert.equal(denied.status, 401);
  },
);
Deno.test('standalone and embedded panels share HTML and never include account credentials', () => {
  const embedded = uploadPanelResource([]),
    standalone = uploadPanelResource([], true);
  assert.deepEqual(embedded.contents[0]._meta.ui.csp.connectDomains, ['https://hiddenjobs.dev']);
  assert(standalone.contents[0].text.includes('"standalone":true'));
  assert(embedded.contents[0].text.includes('Save in Hidden Jobs'));
  for (const origin of ['http://evil.test', 'https://uploads.test/path'])
    assert.throws(() => uploadPanelResource([origin]));
});

Deno.test('malformed or incomplete API results never report a successful save', async () => {
  for (const body of [
    null,
    [],
    {},
    { data: null },
    { data: { status: 'unknown' } },
    { data: { status: 'saved' } },
    { data: { status: 'saved', cv: { ...cv, cvId: 'invalid' } } },
    { data: { status: 'saved', cv: { ...cv, versionId: 'invalid' } } },
    { data: { status: 'saved', cv: { ...cv, name: null } } },
  ])
    assert.throws(() => parseUploadStatus(body));
  assert.equal(parseUploadStatus({ data: { status: 'pending' } }).status, 'pending');
  assert.equal(
    parseUploadStatus({ data: { status: 'expired', name: 'CV', expiresAt: '2030-01-01' } }).status,
    'expired',
  );
  const file = new File(['original'], 'cv.pdf');
  for (const status of [402, 413, 503])
    await assert.rejects(
      saveCvFile(file, 'My CV', session, undefined, () =>
        Promise.resolve(Response.json({}, { status })),
      ),
    );
  for (const name of ['', ' '.repeat(3), 'x'.repeat(201)])
    await assert.rejects(saveCvFile(file, name, session));
  await assert.rejects(
    saveCvFile(file, 'My CV', session, undefined, () =>
      Promise.resolve(
        Response.json({ data: { status: 'saved', cv: { ...cv, name: 'Different CV' } } }),
      ),
    ),
  );
  assert.throws(() =>
    uploadCapability({ ...session, sessionId: '00000000-0000-4000-8000-000000000099' }),
  );
  assert.throws(() =>
    uploadCapability({
      ...session,
      uploadUrl: session.uploadUrl.replace('00000000-0000-4000-8000-000000000001.', 'not-a-uuid.'),
    }),
  );
});
Deno.test('a broken session response cannot produce a false upload link', async () => {
  for (const data of [
    {},
    { uploadUrl: 'https://evil.test/mcp/upload' },
    { ...session, expiresAt: null },
  ]) {
    const handler = createMcpHandler({ execute: () => Promise.resolve(data) });
    const result = await readRpc(await handler(rpc('tools/call', { name: 'upload_cv' })));
    assert.equal(result.result.isError, true);
  }
});
