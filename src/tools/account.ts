import { define, stringProperty, type ToolDefinition } from './schemas.ts';
export const workflowTool = define(
  'get_workflow',
  'Get workflow',
  "Read a Hidden Jobs career workflow. The user's assistant performs all reasoning and drafting.",
  { name: stringProperty() },
  ['name'],
);
export const accountTools: ToolDefinition[] = [
  define(
    'get_application_report',
    'Get application report',
    'Read application counts by state and recent activity. Use list_applications for detail.',
  ),
  define(
    'export_user_data',
    'Export user data',
    'Export private career metadata with short-lived links to original files. Download files before links expire.',
  ),
  define(
    'reset_user_data',
    'Reset user data',
    'Preview career-data deletion and return an account page for the user to confirm. This tool never deletes data or changes subscriptions.',
    {},
    [],
    false,
    true,
  ),
];
