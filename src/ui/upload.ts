export const MAX_CV_BYTES = 2 * 1024 * 1024;
export interface SavedCv {
  cvId: string;
  versionId: string;
  version: number;
  name: string;
}
export interface UploadSession {
  sessionId: string;
  uploadUrl: string;
  expiresAt: string;
  name?: string;
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

export function uploadCapability(session: UploadSession) {
  const url = new URL(session.uploadUrl);
  const match = /^#([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(url.hash);
  if (
    url.origin !== 'https://hiddenjobs.dev' ||
    url.pathname !== '/mcp/upload' ||
    url.search ||
    !match ||
    !uuid(match[1]) ||
    match[1] !== session.sessionId
  )
    throw new Error('Invalid upload link. Ask your assistant for a new one.');
  return { id: match[1], secret: match[2] };
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function parseUploadStatus(body: unknown): {
  status: 'pending' | 'expired' | 'saved';
  name: string;
  expiresAt: string;
  cv?: SavedCv;
} {
  const data = record(body) && record(body.data) ? body.data : undefined;
  if (!data || !['pending', 'expired', 'saved'].includes(String(data.status)))
    throw new Error('Invalid upload response.');
  const cv = data.cv;
  if (
    data.status === 'saved' &&
    (!record(cv) ||
      !uuid(cv.cvId) ||
      !uuid(cv.versionId) ||
      cv.version !== 1 ||
      typeof cv.name !== 'string')
  )
    throw new Error('The saved CV could not be verified.');
  return {
    status: data.status as 'pending' | 'expired' | 'saved',
    name: typeof data.name === 'string' ? data.name : '',
    expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '',
    ...(data.status === 'saved' ? { cv: cv as SavedCv } : {}),
  };
}
/** Both embedded and terminal-browser forms send the original file directly, without model tools. */
export async function saveCvFile(
  file: File,
  name: string,
  session: UploadSession,
  apiOrigin = 'https://hiddenjobs.dev',
  fetcher: typeof fetch = fetch,
): Promise<SavedCv> {
  name = name.trim();
  if (
    !/\.(pdf|docx)$/i.test(file.name) ||
    !file.size ||
    file.size > MAX_CV_BYTES ||
    file.name.length > 200
  )
    throw new Error('Choose a PDF or DOCX up to 2 MiB.');
  if (!name || name.length > 200) throw new Error('Enter a CV name of up to 200 characters.');
  const { id, secret } = uploadCapability(session);
  const form = new FormData();
  form.set('file', file);
  form.set('name', name);
  const response = await fetcher(`${apiOrigin}/api/cv-uploads/${id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    body: form,
    credentials: 'omit',
    redirect: 'error',
    signal: AbortSignal.timeout(90000),
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? 'This upload link is invalid or expired. Ask your assistant for a new one.'
        : response.status === 402
          ? 'Your MCP access has expired. Activate access in Hidden Jobs.'
          : 'The file could not be saved. Retry the same file or request a new upload link.',
    );
  const result = parseUploadStatus(body);
  if (result.status !== 'saved' || result.cv?.name !== name)
    throw new Error('The saved CV could not be verified. Ask your assistant to check this upload.');
  return result.cv;
}
