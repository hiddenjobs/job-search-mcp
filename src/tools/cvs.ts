import { define, id, key, page, revision, stringProperty, type ToolDefinition } from './schemas.ts';
export const cvsTools: ToolDefinition[] = [
  define('list_cvs', "List the user's independent CVs; each has immutable versions.", {
    ...page,
    includeArchived: { type: 'boolean' },
  }),
  define(
    'get_cv',
    'Read a CV and a page of its versions. Read the linked document to get its text.',
    { cvId: id, ...page },
    ['cvId'],
  ),
  define(
    'save_cv',
    'Create a CV or append an immutable version from a ready CV document. Never overwrite an existing version.',
    {
      cvId: id,
      name: stringProperty(),
      language: stringProperty(),
      focus: stringProperty(),
      documentId: id,
      expectedRevision: revision,
      requestId: key,
    },
    ['name', 'documentId', 'expectedRevision', 'requestId'],
    true,
  ),
  define(
    'update_cv',
    'Rename or archive a CV without modifying its versions.',
    {
      cvId: id,
      name: stringProperty(),
      archived: { type: 'boolean' },
      expectedRevision: revision,
      requestId: key,
    },
    ['cvId', 'expectedRevision', 'requestId'],
    true,
  ),
  define(
    'set_default_cv',
    'Choose the default CV. Existing applications retain their selected version.',
    { cvId: id, expectedRevision: revision, requestId: key },
    ['cvId', 'expectedRevision', 'requestId'],
    true,
  ),
  define(
    'select_application_cv',
    'Select the exact base CV version for a draft application. Submitted applications retain their historical selection.',
    { applicationId: id, cvVersionId: id, expectedRevision: revision, requestId: key },
    ['applicationId', 'cvVersionId', 'expectedRevision', 'requestId'],
    true,
  ),
];
