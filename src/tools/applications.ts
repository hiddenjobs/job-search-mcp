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
export const applicationsTools: ToolDefinition[] = [
  define('list_applications', 'List saved applications. Prepared does not mean submitted.', {
    ...page,
    status: { type: 'string', enum: STATUSES },
  }),
  define(
    'get_application',
    'Read one application and a page of its history.',
    {
      applicationId: id,
      ...page,
    },
    ['applicationId'],
  ),
  define(
    'save_application',
    'Create a draft application with a server-captured Hidden Jobs offer snapshot and an exact base CV version. Does not submit anything.',
    { jobId: id, cvVersionId: id, data: obj, requestId: key },
    ['jobId', 'cvVersionId', 'requestId'],
    true,
  ),
  define(
    'update_application',
    'Update state, notes, next steps or final document references. Only mark applied after the user confirms submission. Gmail-derived changes need user approval; store only approved references and minimal notes.',
    {
      applicationId: id,
      status: { type: 'string', enum: STATUSES },
      data: obj,
      cvDocumentId: id,
      coverLetterDocumentId: id,
      interviewDocumentId: id,
      userConfirmed: { type: 'boolean' },
      expectedRevision: revision,
      requestId: key,
    },
    ['applicationId', 'expectedRevision', 'requestId'],
    true,
  ),
];
