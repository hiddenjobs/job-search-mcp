import { getWorkflow, WORKFLOW_VERSION, workflows } from '../src/resources/workflows.ts';

const root = new URL('../', import.meta.url);
const check = Deno.args.includes('--check');
let stale = false;
for (const [name, definition] of Object.entries(workflows)) {
  const directory = new URL(`skills/${name}/`, root);
  const workflow = getWorkflow(name);
  if (!workflow) throw new Error(`Missing workflow: ${name}`);
  const content = `---\nname: ${name}\ndescription: ${JSON.stringify(
    `${definition.title} using the connected Job Search MCP. Use when the user requests this career workflow.`,
  )}\n---\n\n# ${definition.title}\n\nWorkflow version: ${WORKFLOW_VERSION}.\n\n${
    workflow.instructions
  }\n`;
  const file = new URL('SKILL.md', directory);
  if (check) {
    let existing = '';
    try {
      existing = Deno.readTextFileSync(file);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    if (existing !== content) {
      console.error(`Out of date: ${file.pathname}`);
      stale = true;
    }
  } else {
    Deno.mkdirSync(directory, { recursive: true });
    Deno.writeTextFileSync(file, content);
  }
}
if (stale) Deno.exit(1);
