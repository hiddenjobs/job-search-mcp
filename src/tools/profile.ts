import { define, obj, revision, key, type ToolDefinition } from './schemas.ts';
export const profileTools: ToolDefinition[] = [
  define(
    'get_candidate_profile',
    'Get candidate profile',
    "Read the connected user's confirmed profile and preferences.",
  ),
  define(
    'save_candidate_profile',
    'Save candidate profile',
    'Save only profile information confirmed by the user. Preserve unknown facts as unknown.',
    { profile: obj, expectedRevision: revision, requestId: key },
    ['profile', 'expectedRevision', 'requestId'],
    true,
  ),
];
