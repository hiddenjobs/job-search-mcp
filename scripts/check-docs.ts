import { guides, templates, workflows } from '../src/resources/workflows.ts';
import { createRestMcpHandler } from '../src/index.ts';
import { restRoutes } from '../src/api/routes.ts';
import { validateCareerArguments } from '../src/tools/validation.ts';

const root = new URL('../', import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, root));
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
// Only discovery runs; no credentials, user records, network or backend operations.
const handler = createRestMcpHandler({
  fetcher: () => {
    throw new Error('Documentation checks must not call the API');
  },
});
const discovery = await handler(
  new Request('https://example.test/mcp', {
    method: 'POST',
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  }),
);
const payload = (await discovery.json()) as {
  result: { tools: { name: string; inputSchema: Record<string, unknown> }[] };
};
const tools = payload.result.tools;
const readme = await read('README.md');
const reference = await read('docs/tool-reference.md');
const skillGuide = await read('docs/skills.md');
const resources = await read('docs/resources.md');
assert(tools.length === 45, 'Update documented tool count');
assert(Object.keys(workflows).length === 15, 'Update documented skill/prompt count');
assert(
  Object.keys(guides).length + Object.keys(templates).length + Object.keys(workflows).length === 22,
  'Update documented shared-resource count',
);
assert(
  JSON.stringify(Object.keys(restRoutes).sort()) ===
    JSON.stringify(tools.map((t) => t.name).sort()),
  'Every tool needs an HTTP route',
);
for (const tool of tools) {
  assert(readme.includes('`' + tool.name + '`'), `README missing tool: ${tool.name}`);
  const section = reference.split('## `' + tool.name + '`\n')[1]?.split('\n## ')[0];
  assert(section, `Tool reference missing section: ${tool.name}`);
  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  for (const name of Object.keys(schema.properties ?? {})) {
    const row = section
      .split('\n')
      .find((line) => new RegExp('^\\|\\s*`' + name + '`\\s*\\|').test(line));
    assert(row, `Missing ${tool.name} argument: ${name}`);
    const required = schema.required?.includes(name) ? 'Yes' : 'No';
    assert(row.split('|')[3]?.trim() === required, `Incorrect required flag: ${tool.name}.${name}`);
  }
}
const skillDirectories = [];
for await (const entry of Deno.readDir(new URL('skills/', root))) {
  if (entry.isDirectory) skillDirectories.push(entry.name);
}
assert(
  JSON.stringify(skillDirectories.sort()) === JSON.stringify(Object.keys(workflows).sort()),
  'Skill directories must match the workflow names without prefixes or duplicate legacy folders',
);
for (const name of Object.keys(workflows)) {
  const path = `skills/${name}/SKILL.md`;
  assert(readme.includes(`](${path})`), `README missing linked skill: ${name}`);
  assert(
    skillGuide.includes(`hiddenjobs://workflows/${name}`),
    `Skill guide missing resource: ${name}`,
  );
  assert(skillGuide.includes(`MCP prompt: \`${name}\``), `Skill guide missing prompt: ${name}`);
  assert((await read(path)).includes(`name: ${name}`), `Incorrect portable skill: ${name}`);
}
for (const name of [...Object.keys(workflows), ...Object.keys(guides), ...Object.keys(templates)]) {
  assert(resources.includes('`' + name + '`'), `Resource reference missing name: ${name}`);
}
async function markdownFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(new URL(directory + '/', root))) {
    const path = directory + '/' + entry.name;
    if (entry.isDirectory) files.push(...(await markdownFiles(path)));
    else if (entry.name.endsWith('.md')) files.push(path);
  }
  return files;
}
const files = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  ...(await markdownFiles('docs')),
  ...(await markdownFiles('skills')),
];
let examples = 0,
  links = 0;
for (const path of files) {
  const text = await read(path);
  assert(
    !/career_permission_required|separate read\/write\/delete permissions|grant that client the career permissions/i.test(
      text,
    ),
    `Outdated extra career authorization in ${path}`,
  );
  assert(
    !/unreleased|upcoming release|not yet enabled|workspace preview|under development/i.test(text),
    `Outdated release framing: ${path}`,
  );
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const target = match[1];
    if (/^[a-z]+:|^#/i.test(target)) continue;
    const url = new URL(target.split('#')[0], new URL(path, root));
    try {
      await Deno.stat(url);
    } catch {
      throw Error(`Broken link in ${path}: ${target}`);
    }
    links++;
    const anchor = target.split('#')[1];
    if (anchor && url.pathname.endsWith('.md')) {
      const linked = await Deno.readTextFile(url);
      const anchors = [...linked.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) =>
        m[1]
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, '')
          .trim()
          .replace(/\s/g, '-'),
      );
      assert(anchors.includes(anchor), `Broken anchor in ${path}: ${target}`);
    }
  }
  for (const block of text.matchAll(/```json\s*\n([\s\S]*?)```/g)) {
    const json = JSON.parse(block[1]) as {
      method?: string;
      params?: { name?: string; arguments?: unknown };
    };
    if (json.method !== 'tools/call') continue;
    const tool = tools.find((tool) => tool.name === json.params?.name);
    assert(tool, `Unknown tool in ${path}: ${json.params?.name}`);
    assert(
      validateCareerArguments(tool.inputSchema, json.params?.arguments ?? {}),
      `Invalid tool example in ${path}: ${tool.name}`,
    );
    examples++;
  }
}
console.log(
  `Documentation verified: ${tools.length} tools, ${
    Object.keys(workflows).length
  } skills/prompts, 22 shared resources, ${examples} tool examples, ${links} local links across ${files.length} Markdown files.`,
);
