import { define, id, obj, key, page, revision, type ToolDefinition } from './schemas.ts';
export const STATUSES = [
  'saved',
  'preparing',
  'prepared',
  'applied',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
];
export const externalApplicationJob = {
  type: 'object',
  description:
    'For provider offers use source and the exact opaque id from search_jobs. For web offers use source web, the verified public HTTPS url and title; optional fields must be observed, not inferred.',
  properties: {
    source: {
      type: 'string',
      enum: ['jobicy', 'weworkremotely', 'remoteok', 'himalayas', 'itjobs', 'web'],
    },
    id: { type: 'string', minLength: 1, maxLength: 2000 },
    url: { type: 'string', minLength: 1, maxLength: 4096 },
    title: { type: 'string', minLength: 1, maxLength: 300 },
    company: { type: 'string', minLength: 1, maxLength: 200 },
    location: { type: 'string', minLength: 1, maxLength: 300 },
    description: { type: 'string', minLength: 1, maxLength: 12000 },
  },
  required: ['source'],
  additionalProperties: false,
};
export const applicationsTools: ToolDefinition[] = [
  define(
    'list_applications',
    'List applications',
    'List saved applications. Prepared does not mean submitted.',
    {
      ...page,
      status: { type: 'string', enum: STATUSES },
    },
  ),
  define(
    'get_application',
    'Get application',
    'Read one application and a page of its history.',
    {
      applicationId: id,
      ...page,
    },
    ['applicationId'],
  ),
  define(
    'save_application',
    'Save application',
    'Track an application from any source using an exact saved Hidden Jobs CV version. Provide exactly one of jobId (Hidden Jobs) or externalJob. Provider offers use externalJob source and opaque id; the server rereads their snapshot. Web offers use source web, verified public HTTPS url and title, with only observed optional facts. Read the offer, get_candidate_profile and list_cvs first; if no suitable CV exists, follow setup. This creates a saved draft, not a submission. Verify the returned record and synchronize subsequent evidenced progress with update_application.',
    { jobId: id, externalJob: externalApplicationJob, cvVersionId: id, data: obj, requestId: key },
    ['cvVersionId', 'requestId'],
    true,
  ),
  define(
    'update_application',
    'Update application',
    'Update state, notes, next steps or final document references. Proactively synchronize verified progress during an authorized application workflow without another confirmation. Mark applied only with evidence of successful submission; a prepared form or attempted send is insufficient. Read get_application first, pass its revision and verify the saved result. Store minimal evidence references and notes.',
    {
      applicationId: id,
      status: { type: 'string', enum: STATUSES },
      data: obj,
      cvDocumentId: id,
      coverLetterDocumentId: id,
      interviewDocumentId: id,
      expectedRevision: revision,
      requestId: key,
    },
    ['applicationId', 'expectedRevision', 'requestId'],
    true,
  ),
];
