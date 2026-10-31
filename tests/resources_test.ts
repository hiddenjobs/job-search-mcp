import { getWorkflow, workflows, PROACTIVE_INSTRUCTIONS } from '../src/resources/workflows.ts';
import { careerResources } from '../src/resources/index.ts';
import { createRestMcpHandler } from '../src/index.ts';
import { assert, rpc, UUID, readRpc, parseResource } from './helpers.ts';

Deno.test(
  'all shared workflows, guides, templates and prompts are available without account access',
  async () => {
    const handler = createRestMcpHandler({
      fetcher: () => {
        throw new Error('Unexpected REST call');
      },
    });
    assert.equal(careerResources.resourceList().resources.length, 23);
    assert.equal(careerResources.promptList().prompts.length, 15);
    for (const resource of careerResources.resourceList().resources) {
      const result = await readRpc(await handler(rpc('resources/read', { uri: resource.uri }, '')));
      assert.equal(result.result.contents[0].uri, resource.uri);
    }
    for (const name of ['match', 'email-sync']) {
      const prompt = await readRpc(await handler(rpc('prompts/get', { name }, '')));
      assert.equal(prompt.result.messages[0].content.text, getWorkflow(name)?.instructions);
    }
    assert.equal(
      (await readRpc(await handler(rpc('prompts/get', { name: 'unknown' })))).error.code,
      -32602,
    );
    const unknown = await readRpc(
      await handler(rpc('resources/read', { uri: 'hiddenjobs://guides/unknown' }, '')),
    );
    assert.equal(unknown.error.code, -32002);
  },
);
Deno.test('private resources require OAuth and use their matching REST operations', async () => {
  const requests: Request[] = [];
  const handler = createRestMcpHandler({
    fetcher: (input, init) => {
      requests.push(new Request(input, init));
      return Promise.resolve(Response.json({ data: { id: UUID } }));
    },
  });
  const blocked = await handler(rpc('resources/read', { uri: 'hiddenjobs://me/profile' }, ''));
  assert.equal(blocked.status, 401);
  assert.equal(requests.length, 0);
  for (const [uri, path] of [
    ['hiddenjobs://me/profile', '/me/profile'],
    ...['cvs', 'applications', 'documents'].map((type) => [
      `hiddenjobs://me/${type}/${UUID}`,
      `/me/${type}/${UUID}`,
    ]),
  ]) {
    const result = await readRpc(await handler(rpc('resources/read', { uri })));
    assert.equal(parseResource(result.result.contents[0].text).id, UUID);
    assert.equal(new URL(requests.at(-1)?.url ?? '').pathname, '/v1' + path);
    assert.equal(requests.at(-1)?.headers.get('Authorization'), 'Bearer a.b.c');
  }
});
Deno.test(
  'foreign-owner arguments are rejected and document denials remain tool errors',
  async () => {
    let calls = 0;
    const handler = createRestMcpHandler({
      fetcher: () => {
        calls++;
        return Promise.resolve(
          Response.json({ code: 'not_found', error: 'private error' }, { status: 404 }),
        );
      },
    });
    const invalid = await readRpc(
      await handler(
        rpc('tools/call', { name: 'get_document', arguments: { documentId: UUID, userId: UUID } }),
      ),
    );
    assert.equal(invalid.error.code, -32602);
    assert.equal(calls, 0);
    const denied = await readRpc(
      await handler(rpc('tools/call', { name: 'get_document', arguments: { documentId: UUID } })),
    );
    assert.equal(denied.result.structuredContent.status, 404);
    assert.equal(denied.result.isError, true);
    const resource = await readRpc(
      await handler(rpc('resources/read', { uri: `hiddenjobs://me/documents/${UUID}` })),
    );
    assert.equal(resource.error.code, -32002);
    assert(!JSON.stringify(resource).includes('private error'));
  },
);

Deno.test('portable workflow instructions preserve facts, chosen CV version and user model', () => {
  assert(Object.keys(workflows).length === 15);
  const flow = getWorkflow('apply');
  assert(flow?.version === '1.9.0');
  assert(flow.instructions.includes('exact base CV version'));
  assert(flow.instructions.includes("user's own assistant"));
  assert(getWorkflow('unknown') === null);
});

Deno.test(
  'career follow-ups reach clients before a workflow is selected without writes',
  async () => {
    let calls = 0;
    const handler = createRestMcpHandler({
      fetcher: () => {
        calls++;
        throw new Error('Guidance discovery must not access account data');
      },
    });
    const initialized = await readRpc(await handler(rpc('initialize', {}, '')));
    const firstContext = initialized.result.instructions.slice(0, 512);
    for (const expected of ['named version', 'daily/weekly', 'Ask before saving']) {
      assert(firstContext.includes(expected), `Missing early follow-up: ${expected}`);
    }
    const listed = await readRpc(await handler(rpc('tools/list', {}, '')));
    for (const name of ['get_cv', 'get_document', 'render_document', 'open_application_link']) {
      const tool = listed.result.tools.find((tool) => tool.name === name);
      assert(tool?.description.includes('named'), `${name} must offer a concrete CV save`);
      assert(tool?.description.includes('version'), `${name} must distinguish a CV version`);
    }
    for (const name of ['setup', 'search', 'apply', 'export', 'outcome']) {
      const prompt = await readRpc(await handler(rpc('prompts/get', { name }, '')));
      const resource = await readRpc(
        await handler(rpc('resources/read', { uri: `hiddenjobs://workflows/${name}` }, '')),
      );
      for (const instructions of [
        prompt.result.messages[0].content.text,
        parseResource(resource.result.contents[0].text).instructions,
      ]) {
        assert(typeof instructions === 'string');
        assert(!instructions.includes('upload_document_chunk'));
        assert(!instructions.includes('mode chunks'));
        assert(instructions.startsWith(PROACTIVE_INSTRUCTIONS));
        assert(instructions.includes('An offer of a next step is not permission to execute it'));
        assert(instructions.includes('skip declined or completed offers'));
      }
    }
    const apply = getWorkflow('apply')?.instructions ?? '';
    assert(apply.includes('Do not finish with only downloads'));
    assert(apply.includes('If that save was already requested, execute it'));
    assert(apply.includes('External application tracking is not supported, but a CV'));
    assert(getWorkflow('search')?.instructions.includes('this alert covers Hidden Jobs only'));
    assert.equal(calls, 0);
  },
);

Deno.test('shared resource names cannot resolve inherited object properties', async () => {
  const handler = createRestMcpHandler({
    fetcher: () => {
      throw new Error('Shared reads must not reach REST');
    },
  });
  for (const group of ['guides', 'templates', 'workflows']) {
    const result = await readRpc(
      await handler(rpc('resources/read', { uri: `hiddenjobs://${group}/constructor` }, '')),
    );
    assert.equal(result.error.code, -32002);
    assert.equal('result' in result, false);
  }
  assert.equal(getWorkflow('constructor'), null);
});

Deno.test(
  'application guidance reaches clients through prompts, resources and workflow tools',
  async () => {
    const workflow = getWorkflow('apply');
    assert(workflow);
    const calls: string[] = [];
    const handler = createRestMcpHandler({
      fetcher: (input) => {
        const request = new Request(input);
        calls.push(new URL(request.url).pathname);
        return Promise.resolve(Response.json({ data: workflow }));
      },
    });
    const prompt = await readRpc(await handler(rpc('prompts/get', { name: 'apply' }, '')));
    const resource = await readRpc(
      await handler(rpc('resources/read', { uri: 'hiddenjobs://workflows/apply' }, '')),
    );
    const tool = await readRpc(
      await handler(rpc('tools/call', { name: 'get_workflow', arguments: { name: 'apply' } })),
    );
    assert.equal(prompt.result.messages[0].content.text, workflow.instructions);
    assert.equal(
      parseResource(resource.result.contents[0].text).instructions,
      workflow.instructions,
    );
    assert.deepEqual(tool.result.structuredContent.data, workflow);
    assert.deepEqual(calls, ['/v1/workflows/apply']);

    const scenarios: [string, string, string[]][] = [
      [
        'saved CV',
        workflow.instructions,
        ['list_cvs', 'get_cv and get_document', 'exact CV version'],
      ],
      [
        'missing CV',
        getWorkflow('setup')?.instructions ?? '',
        ['offer upload_cv', 'upload_cv', 'get_cv_upload', 'terminal'],
      ],
      [
        'external offer',
        workflow.instructions,
        ['External application tracking is not supported', 'without save_application'],
      ],
      [
        'source selection',
        getWorkflow('search')?.instructions ?? '',
        [
          'before general web search',
          'ask which connected sources',
          'source failures are not empty results',
        ],
      ],
    ];
    for (const [scenario, instructions, requirements] of scenarios) {
      assert.equal(typeof instructions, 'string');
      for (const requirement of requirements) {
        assert(instructions.includes(requirement), `${scenario}: ${requirement}`);
      }
    }
  },
);

Deno.test('upload fallback reaches initialization, prompts and shared resources', async () => {
  const handler = createRestMcpHandler({
    fetcher: () => {
      throw new Error('No REST request expected');
    },
  });
  const initialized = await readRpc(await handler(rpc('initialize', {}, '')));
  const setupPrompt = await readRpc(await handler(rpc('prompts/get', { name: 'setup' }, '')));
  const setupResource = await readRpc(
    await handler(rpc('resources/read', { uri: 'hiddenjobs://workflows/setup' }, '')),
  );
  const requirements = [
    'upload_cv',
    'get_cv_upload',
    '15 minutes',
    'private uploadUrl',
    'Do not poll',
    'original PDF or DOCX',
  ];
  for (const instructions of [
    initialized.result.instructions,
    setupPrompt.result.messages[0].content.text,
    parseResource(setupResource.result.contents[0].text).instructions,
  ]) {
    assert(typeof instructions === 'string');
    assert(!instructions.includes('upload_document_chunk'));
    assert(!instructions.includes('mode chunks'));
    for (const requirement of requirements) assert(instructions.includes(requirement), requirement);
  }
});
