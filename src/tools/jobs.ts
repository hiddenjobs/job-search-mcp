import {
  LANGUAGE_INSTRUCTIONS,
  SALARY_INSTRUCTIONS,
  PRESENTATION_INSTRUCTIONS,
  SEARCH_FAILURE_INSTRUCTIONS,
} from '../resources/workflows.ts';
import { remoteLocationSchema } from '../locations.ts';
import type { ToolDefinition } from './schemas.ts';
export const JOB_SOURCES = [
  'hiddenjobs',
  'jobicy',
  'weworkremotely',
  'remoteok',
  'himalayas',
  'itjobs',
];
export const SEARCH_SOURCES = [...JOB_SOURCES, 'web'];
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
      LANGUAGE_INSTRUCTIONS +
      ' ' +
      'Choose connected job sources or Open web search (web), alone or together. For web, the MCP returns a requires_host_search request; the assistant must execute it using its own native web search, verify live listings and cite their real URLs. If native web search is unavailable, report that limitation; never treat the handoff as completed search or zero matches. Web results do not have MCP job IDs and cannot use get_job or open_application_link. Use the MCP for the six connected sources instead of browsing them separately. Search all available sources by default, without asking the user to choose sources. With no explicit source preference, pass [hiddenjobs, jobicy, weworkremotely, remoteok, himalayas, itjobs, web] and search immediately. Do not enumerate external platforms as a preamble. All available sources means hiddenjobs, every integrated external provider and web. Honor explicit narrower selections or exclusions and reuse the selection for follow-up searches until the user changes it. sources is required and must not be empty. External offers and their source links are free; Hidden Jobs original application links are included. limit controls page size per source, not the number of offers to display. Do not impose a preset result count or truncate combined relevant results to the page size. Respect a count only when the user explicitly asks. For more or all results, continue available pages/cursors within existing host budgets; preserve returned continuation references and do not claim completeness while pages remain. Inspect sourceResults for failures, coverage and continuation cursors; never treat a failed source as no jobs. ' +
      PRESENTATION_INSTRUCTIONS +
      ' ' +
      SEARCH_FAILURE_INSTRUCTIONS +
      ' After presenting results, first offer a daily search through the assistant’s native scheduler if it supports unattended MCP calls; load get_workflow search for scheduling guidance. Preserve sources, filters and the selected profile/CV; notify about new relevant matches. Verify scheduler support and user approval before creating a task; never claim a reminder can run searches. If unavailable or the user prefers email, offer Hidden Jobs-only alerts with approval. Offer saved-CV matching when that is the more useful next step. ' +
      SALARY_INSTRUCTIONS,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        sources: {
          type: 'array',
          minItems: 1,
          maxItems: SEARCH_SOURCES.length,
          uniqueItems: true,
          items: { type: 'string', enum: SEARCH_SOURCES },
          description:
            'Required explicit array; the assistant selects all available sources by default without asking. The API still rejects a missing or empty array. hiddenjobs only selects Hidden Jobs. All available sources selects hiddenjobs, jobicy, weworkremotely, remoteok, himalayas, itjobs and web. Respect explicit subsets or exclusions. web uses the assistant’s own web search; it is not a provider API.',
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
        remoteLocation: remoteLocationSchema,
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          default: 10,
          description:
            'Page size per selected source, not a total display limit or a requested number of web results. Respect an explicit user result count separately; continue returned pages/cursors within the host budget when more results are requested.',
        },
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
      'Read a job from its original source using the source and id returned by search_jobs. External details are rechecked through the public provider API/feed. Hidden Jobs original application URLs remain excluded.',
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
