import type { ToolDefinition } from './schemas.ts';
export const JOB_SOURCES = [
  'hiddenjobs',
  'jobicy',
  'weworkremotely',
  'remoteok',
  'himalayas',
  'itjobs',
];
const source = {
  type: 'string',
  enum: JOB_SOURCES,
  description:
    'Required source returned by search_jobs. Pass it unchanged with the job ID; no default.',
};
export const jobTools: ToolDefinition[] = [
  {
    name: 'search_jobs',
    title: 'Search jobs',
    description:
      'Use first for job searches across Hidden Jobs, Jobicy, We Work Remotely, Remote OK, Himalayas and ITjobs instead of browsing those sources separately. Search only the sources explicitly chosen by the user; ask if unclear. sources is required and must not be empty. External offers and their source links are free; Hidden Jobs original application links are included. limit applies per source. Inspect sourceResults for failures, coverage and continuation cursors; never treat a failed source as no jobs. After presenting results, offer a named daily/weekly Hidden Jobs alert for the agreed role/location when relevant; respect source exclusions and create it only with approval. Offer saved-CV matching when that is the more useful next step.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        sources: {
          type: 'array',
          minItems: 1,
          maxItems: JOB_SOURCES.length,
          uniqueItems: true,
          items: { type: 'string', enum: JOB_SOURCES },
          description:
            'Required selection; no default. hiddenjobs, jobicy, weworkremotely, remoteok, himalayas, itjobs.',
        },
        cursors: {
          type: 'object',
          additionalProperties: false,
          properties: Object.fromEntries(
            JOB_SOURCES.filter((name) => name !== 'hiddenjobs').map((name) => [
              name,
              { type: 'string', maxLength: 2048 },
            ]),
          ),
          description:
            'Pass a sourceResults.nextCursor unchanged for the same source and filters. page applies to Hidden Jobs; external feeds use these cursors.',
        },
        category: { type: 'string' },
        employmentType: { type: 'string' },
        jobType: { type: 'string' },
        remoteLocation: { type: 'string' },
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
      required: ['sources'],
      additionalProperties: false,
    },
    securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'get_job',
    title: 'Read job details',
    description:
      'Read a job from its original source using the source and id returned by search_jobs. ITjobs provides remote-only summary metadata; check its original page for full requirements. External details are rechecked through the public provider API/feed. Hidden Jobs original application URLs remain excluded.',
    inputSchema: {
      type: 'object',
      properties: { idOrSlug: { type: 'string', maxLength: 2000 }, source },
      required: ['idOrSlug', 'source'],
      additionalProperties: false,
    },
    securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'open_application_link',
    title: 'Open application link',
    description:
      'Open the supplied source link for an external offer for free. For Hidden Jobs, reveal the original application URL. Pass the source and id returned by search_jobs; never replace external source links with employer links. Before ending a tailored-CV handoff, offer to save a named reusable CV version in Hidden Jobs if not already saved. Offer tracking only for Hidden Jobs applications; do not mark submitted from opening this link.',
    inputSchema: {
      type: 'object',
      properties: { idOrSlug: { type: 'string', maxLength: 2000 }, source },
      required: ['idOrSlug', 'source'],
      additionalProperties: false,
    },
    securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
];

export const companyTool: ToolDefinition = {
  name: 'get_company',
  title: 'Read company context',
  description:
    'Read anonymous industry, company size, founding year and verification date for a job. Employer identity is withheld.',
  inputSchema: {
    type: 'object',
    properties: { idOrSlug: { type: 'string', maxLength: 200 } },
    required: ['idOrSlug'],
    additionalProperties: false,
  },
  securitySchemes: [{ type: 'oauth2', scopes: ['email'] }],
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
};
