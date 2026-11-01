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
    'After reading the offer and selecting a saved CV version, create a draft application with a server-captured Hidden Jobs offer snapshot. If no suitable CV exists, ask for one and follow get_workflow setup first. Requires a Hidden Jobs jobId; external offers cannot be tracked here. Does not submit anything.',
    { jobId: id, cvVersionId: id, data: obj, requestId: key },
    ['jobId', 'cvVersionId', 'requestId'],
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
