import { define, id, type ToolDefinition } from './schemas.ts';

export const alertFilters = {
  category: [
    'All',
    'Frontend',
    'Backend',
    'Full Stack',
    'DevOps',
    'Mobile',
    'Data Scientist',
    'Data Analyst',
    'Data Engineer',
    'MLOps',
    'AI Engineer',
    'Design',
    'Video',
    'Support',
    'Project Management',
    'Other',
  ],
  employmentType: ['All', 'Full-time', 'Part-time', 'Intern', 'Other'],
  jobType: ['All', 'Permanent', 'Freelance'],
  remoteLocation: [
    'All',
    'Worldwide',
    'US',
    'CA',
    'GB',
    'EUROPE',
    'ES',
    'DE',
    'FR',
    'PL',
    'RO',
    'NL',
    'IE',
    'PT',
    'CH',
    'LATAM',
    'BR',
    'MX',
    'CO',
    'AR',
    'AMERICAS',
    'APAC',
    'AU',
    'IN',
    'EMEA',
  ],
};
const expectedVersion = {
  type: 'integer',
  minimum: 0,
  description:
    'Last config.version from get_job_alerts; use 0 before the first alert. Reread after a conflict.',
};
const fields = {
  name: { type: 'string', minLength: 1, maxLength: 80 },
  query: { type: 'string', minLength: 0, maxLength: 120 },
  frequency: { type: 'string', enum: ['daily', 'weekly'] },
  enabled: { type: 'boolean' },
  ...Object.fromEntries(
    Object.entries(alertFilters).map(([name, values]) => [
      name,
      {
        type: 'array',
        minItems: 1,
        maxItems: values.length,
        items: { type: 'string', enum: values },
        description:
          'Match any selected value within this filter. All removes the filter; different filters combine with AND.',
      },
    ]),
  ),
};
export const alertTools: ToolDefinition[] = [
  define(
    'get_job_alerts',
    'Read the connected account’s email alerts, global pause state, config.version, subscription status and allowed filter values. These are the same alerts as the dashboard.',
  ),
  define(
    'create_job_alert',
    'Create an email alert requested by the user, up to five per account. Requires Access and confirmed email. Omitted filters match All; query defaults to empty and enabled defaults to true. Preserves the account’s global pause state.',
    { ...fields, expectedVersion },
    ['name', 'frequency', 'expectedVersion'],
    true,
  ),
  define(
    'update_job_alert',
    'Change an existing alert’s name, query, filters, daily/weekly frequency or enabled state. Only supplied fields change. Requires Access and confirmed email. Read get_job_alerts first.',
    { alertId: id, ...fields, expectedVersion },
    ['alertId', 'expectedVersion'],
    true,
  ),
  define(
    'delete_job_alert',
    'Delete one saved alert after the user requests removal. Requires its UUID and the latest config.version. Available without Access; other alerts remain unchanged.',
    { alertId: id, expectedVersion },
    ['alertId', 'expectedVersion'],
    true,
    true,
  ),
  define(
    'pause_job_alerts',
    'Stop all email alerts immediately without deleting saved searches. Available without Access or confirmed email. Does not send a test email.',
    {},
    [],
    true,
  ),
  define(
    'resume_job_alerts',
    'Reactivate saved email alerts when the user requests it, preserving each alert’s enabled state. Requires Access, confirmed email and the latest config.version.',
    { expectedVersion },
    ['expectedVersion'],
    true,
  ),
];
