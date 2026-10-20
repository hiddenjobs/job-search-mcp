import { define, id, obj, key, page, revision, type ToolDefinition } from './schemas.ts';
export const activityTools: ToolDefinition[] = [
  define('get_search_history', 'Get search history', 'Read saved search history.', page),
  define(
    'save_search_history',
    'Save search history',
    'Record search filters and optional notes.',
    { data: obj, requestId: key },
    ['data', 'requestId'],
    true,
  ),
  define(
    'list_job_activity',
    'List job activity',
    "List the user's saved, seen or discarded offers.",
    {
      ...page,
      state: { type: 'string', enum: ['seen', 'saved', 'discarded'] },
    },
  ),
  define(
    'update_job_activity',
    'Update job activity',
    'Mark a Hidden Jobs offer seen, saved or discarded.',
    {
      jobId: id,
      state: { type: 'string', enum: ['seen', 'saved', 'discarded'] },
      expectedRevision: revision,
      requestId: key,
    },
    ['jobId', 'state', 'expectedRevision', 'requestId'],
    true,
  ),
  define(
    'get_job_evaluations',
    'Get job evaluations',
    'Read saved assistant evaluations; optionally filter by job.',
    {
      ...page,
      jobId: id,
    },
  ),
  define(
    'save_job_evaluation',
    'Save job evaluation',
    "Save the user's assistant's evaluation and evidence, including exact CV version and workflow version. It is an assessment, not a fact supplied by Hidden Jobs.",
    { jobId: id, cvVersionId: id, data: obj, requestId: key },
    ['jobId', 'cvVersionId', 'data', 'requestId'],
    true,
  ),
];
export const learningTools: ToolDefinition[] = [
  define('get_learning_plan', 'Get learning plan', 'Read a learning plan or list plans.', {
    planId: id,
    ...page,
  }),
  define(
    'save_learning_plan',
    'Save learning plan',
    'Save an assistant-written learning plan and user-reported progress.',
    { planId: id, data: obj, expectedRevision: revision, requestId: key },
    ['data', 'expectedRevision', 'requestId'],
    true,
  ),
];
