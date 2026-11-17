import {
  getWorkflow,
  workflows,
  PROACTIVE_INSTRUCTIONS,
  LANGUAGE_INSTRUCTIONS,
} from '../src/resources/workflows.ts';
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
  assert(flow?.version === '1.12.10');
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
    for (const expected of ['named version', 'daily', 'native scheduler']) {
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
        String(parseResource(resource.result.contents[0].text).instructions),
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
    assert(apply.includes('A CV tailored for any source can be saved'));
    const search = getWorkflow('search')?.instructions ?? '';
    for (const rule of [
      'native scheduler',
      'reminders alone are not recurring searches',
      'timezone',
      'explicit and nonempty',
      'sourceResults',
      'new relevant matches',
      'Do not claim deduplication when state is unavailable',
      'embed tokens or CV contents',
      'verify its creation',
      'this alert covers Hidden Jobs only',
      'do not create both by default',
    ])
      assert(search.includes(rule), `Missing scheduling safeguard: ${rule}`);
    const searchTool = listed.result.tools.find((tool) => tool.name === 'search_jobs');
    assert(searchTool?.description.includes('native scheduler'));
    assert(searchTool?.description.includes('unattended MCP calls'));
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
      String(parseResource(resource.result.contents[0].text).instructions),
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
        ['externalJob', 'every saved application synchronized', 'saved cvVersionId'],
      ],
      [
        'source selection',
        getWorkflow('search')?.instructions ?? '',
        [
          'Open web search (web)',
          'Search all available sources by default',
          'source failures are not empty results',
          'one unified ranked list',
          'never separate sections or introductions by source',
          'Source IDs and opaque references remain internal',
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

Deno.test(
  'automatic progress guidance reaches initialization and every career workflow',
  async () => {
    const handler = createRestMcpHandler({
      fetcher: () => {
        throw new Error('No account request expected');
      },
    });
    const initialized = await readRpc(await handler(rpc('initialize', {}, '')));
    for (const instructions of [
      initialized.result.instructions,
      ...Object.keys(workflows).map((name) => getWorkflow(name)?.instructions ?? ''),
    ]) {
      for (const rule of [
        'without waiting for the user',
        'successful submission receipt',
        'CAPTCHA or login alone does not',
        'Before ending the turn, reconcile',
        'same requestId',
        'preserving unrelated changes',
      ]) {
        assert(instructions.includes(rule), `Missing synchronization rule: ${rule}`);
      }
      assert(!instructions.includes('Mark applied only after the user confirms'));
    }
    assert(getWorkflow('apply')?.instructions.includes('requires explicit user authorization'));
    assert(getWorkflow('email-sync')?.instructions.includes('authorizes email synchronization'));
  },
);

Deno.test(
  'all sources are the default across discovery and workflows while explicit restrictions persist',
  async () => {
    const handler = createRestMcpHandler({
      fetcher: () => {
        throw new Error('Discovery must not execute a search');
      },
    });
    const initialized = await readRpc(await handler(rpc('initialize', {}, '')));
    const prompt = await readRpc(await handler(rpc('prompts/get', { name: 'search' }, '')));
    const resource = await readRpc(
      await handler(rpc('resources/read', { uri: 'hiddenjobs://workflows/search' }, '')),
    );
    for (const instructions of [
      initialized.result.instructions,
      prompt.result.messages[0].content.text,
      String(parseResource(resource.result.contents[0].text).instructions),
      getWorkflow('search')?.instructions ?? '',
    ]) {
      assert(typeof instructions === 'string');
      assert(
        instructions.includes(
          'Search all available sources by default, without asking the user to choose sources',
        ),
      );
      assert(instructions.includes('Do not enumerate individual external platforms'));
      assert(instructions.includes('reuse it for follow-up searches until the user changes it'));
      assert(!instructions.includes('Would you like me to search Hidden Jobs only'));
      assert(!instructions.includes('Offer exactly these two choices'));
      assert(
        instructions.includes(
          'all available sources, all or everything to [hiddenjobs, jobicy, weworkremotely, remoteok, himalayas, itjobs, web]',
        ),
      );
      assert(instructions.includes('Honor an explicit narrower selection or exclusion'));
      assert(instructions.includes('If the host cannot search the web, disclose that limitation'));
      assert(!instructions.includes('Offer seven search options'));
    }
    const tools = await readRpc(await handler(rpc('tools/list', {}, '')));
    const search = tools.result.tools.find((tool: { name: string }) => tool.name === 'search_jobs');
    assert(search);
    assert(search.description.includes('Search all available sources by default'));
    assert(!search.description.includes('If unclear, ask:'));
    assert(search.description.includes('without asking the user to choose sources'));
    assert(
      search.description.includes(
        '[hiddenjobs, jobicy, weworkremotely, remoteok, himalayas, itjobs, web]',
      ),
    );
    assert(search.description.includes('until the user changes it'));
    assert(
      search.description.includes(
        'All available sources means hiddenjobs, every integrated external provider and web',
      ),
    );
    assert(Array.isArray(search.inputSchema.required));
    assert(search.inputSchema.required.includes('sources'));
  },
);

Deno.test(
  'salary research is discoverable without a salary API or private-data access',
  async () => {
    for (const careerEnabled of [false, true]) {
      const handler = createRestMcpHandler({
        careerEnabled,
        fetcher: () => {
          throw new Error('Salary guidance must not call a search engine or private API');
        },
      });
      const initialized = await readRpc(await handler(rpc('initialize', {}, '')));
      const tools = await readRpc(await handler(rpc('tools/list', {}, '')));
      const search = tools.result.tools.find(
        (tool: { name: string }) => tool.name === 'search_jobs',
      );
      assert(search);
      const instructions: unknown[] = [initialized.result.instructions, search.description];
      if (careerEnabled) {
        const guide = await readRpc(
          await handler(rpc('resources/read', { uri: 'hiddenjobs://guides/interview' }, '')),
        );
        instructions.push(guide.result.contents[0].text);
        for (const name of ['search', 'interview']) {
          const prompt = await readRpc(await handler(rpc('prompts/get', { name }, '')));
          const resource = await readRpc(
            await handler(rpc('resources/read', { uri: `hiddenjobs://workflows/${name}` }, '')),
          );
          instructions.push(
            prompt.result.messages[0].content.text,
            String(parseResource(resource.result.contents[0].text).instructions),
          );
        }
      }
      for (const text of [
        ...instructions,
        ...Object.keys(workflows).map((name) => getWorkflow(name)?.instructions ?? ''),
      ]) {
        assert(typeof text === 'string');
        assert.match(text, /first publish the actual relevant offer list/);
        assert.match(
          text,
          /missing pay is never a reason to exclude, rank down or postpone an offer/,
        );
        assert.match(text, /without waiting for another user message/);
        assert.match(text, /do not repeat, shrink or replace the job list/);
        assert.match(text, /keep every already-shared offer/);
        assert.match(text, /Preserve employer-published pay unchanged/);
        assert.match(
          text,
          /If every displayed offer already publishes pay, skip estimate research/,
        );
        assert.match(text, /For an explicit salary follow-up/);
        assert.match(text, /When an offer has no published salary/);
        assert.match(text, /host assistant’s native web search/);
        assert.match(text, /Estimated gross annual base salary/);
        assert.match(text, /cite the actual URLs/);
        assert.match(text, /Never infer or reveal a hidden employer/);
        assert.match(text, /never send a CV, profile, email, tokens or private career records/);
        assert.match(text, /Do not bypass logins or paywalls/);
        assert.match(text, /does not expand the agreed job sources/);
        assert.match(text, /omit the salary field instead of printing Not listed or guessing/);
        assert.doesNotMatch(text, /salary only when published|Salary discussion may use only/);
      }
      assert(!tools.result.tools.some((tool: { name: string }) => tool.name === 'research_salary'));
    }
  },
);

Deno.test(
  'user-language guidance reaches discovery, tool-only clients, workflows and prompts',
  async () => {
    for (const careerEnabled of [false, true]) {
      const handler = createRestMcpHandler({
        careerEnabled,
        fetcher: () => {
          throw new Error('Language guidance must not call a detector or backend');
        },
      });
      const initialized = await readRpc(await handler(rpc('initialize', {}, '')));
      const tools = await readRpc(await handler(rpc('tools/list', {}, '')));
      const search = tools.result.tools.find(
        (tool: { name: string }) => tool.name === 'search_jobs',
      );
      assert(initialized.result.instructions.includes(LANGUAGE_INSTRUCTIONS));
      assert(search?.description.startsWith(LANGUAGE_INSTRUCTIONS));
      if (!careerEnabled) continue;
      for (const name of Object.keys(workflows)) {
        const prompt = await readRpc(await handler(rpc('prompts/get', { name }, '')));
        const resource = await readRpc(
          await handler(rpc('resources/read', { uri: `hiddenjobs://workflows/${name}` }, '')),
        );
        for (const instructions of [
          getWorkflow(name)?.instructions,
          prompt.result.messages[0].content.text,
          String(parseResource(resource.result.contents[0].text).instructions),
        ]) {
          assert(typeof instructions === 'string');
          assert(instructions.includes(LANGUAGE_INSTRUCTIONS));
        }
      }
    }
    for (const requirement of [
      'only from actual user messages',
      'tool arguments or results',
      'previous assistant messages',
      'preceding substantive user request',
      'follow a new language or explicit language instruction',
      'Do not continue an earlier assistant language mistake',
      'preserving original job titles',
      'CV/document language separately from the conversation language',
      'do not make a separate language-detection request',
      'English request mentioning Barcelona stays English',
      'Spanish request mentioning Berlin stays Spanish',
      'more after an English request stays English even if the offers are in German',
    ])
      assert(LANGUAGE_INSTRUCTIONS.includes(requirement));
  },
);

Deno.test(
  'offer-count guidance separates pagination from presentation across discovery and workflows',
  async () => {
    for (const careerEnabled of [false, true]) {
      const handler = createRestMcpHandler({
        careerEnabled,
        fetcher: () => {
          throw new Error('Count guidance must not execute searches');
        },
      });
      const initialized = await readRpc(await handler(rpc('initialize', {}, '')));
      const tools = await readRpc(await handler(rpc('tools/list', {}, '')));
      const search = tools.result.tools.find(
        (tool: { name: string }) => tool.name === 'search_jobs',
      );
      if (!search) throw new Error('Missing search_jobs');
      const limit = (
        search.inputSchema.properties as Record<
          string,
          { description: string; minimum: number; maximum: number; default: number }
        >
      ).limit;
      assert(search.description.includes('not the number of offers to display'));
      assert(limit.description.includes('not a total display limit'));
      assert.equal(limit.minimum, 1);
      assert.equal(limit.maximum, 50);
      assert.equal(limit.default, 10);
      const texts = [initialized.result.instructions];
      if (careerEnabled)
        for (const name of Object.keys(workflows)) {
          const prompt = await readRpc(await handler(rpc('prompts/get', { name }, '')));
          const resource = await readRpc(
            await handler(rpc('resources/read', { uri: `hiddenjobs://workflows/${name}` }, '')),
          );
          texts.push(
            prompt.result.messages[0].content.text,
            String(parseResource(resource.result.contents[0].text).instructions),
            getWorkflow(name)?.instructions ?? '',
          );
        }
      for (const instructions of texts) {
        assert(
          instructions.includes('Do not impose a preset number of offers to retrieve or display'),
        );
        assert(
          instructions.includes('Respect a specific count only when the user explicitly asks'),
        );
        assert(instructions.includes('Do not shorten a combined list to the default page size'));
        assert(instructions.includes('within the host’s existing time, token and tool budgets'));
        assert(instructions.includes('Do not claim all results or a source are exhausted'));
        assert(
          instructions.includes('A short or empty filtered page may still have a continuation'),
        );
        assert(instructions.includes('Do not make unlimited calls, repeat identical pages'));
      }
    }
  },
);
