export const MAX_CV_BYTES = 2 * 1024 * 1024;
export interface UploadBridge {
  call: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  put(url: string, file: File, headers: Record<string, string>): Promise<void>;
  origins: readonly string[];
}
export interface SavedCv {
  cvId: string;
  versionId: string;
  version: number;
  name: string;
}
const mimeTypes: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);

/** Keep write keys and confirmed results across retries; never change an existing CV/default. */
export function createCvUpload(file: File, name: string, bridge: UploadBridge) {
  name = name.trim();
  const mimeType = mimeTypes[file.name.split('.').pop()?.toLowerCase() ?? ''];
  if (!mimeType || !file.size || file.size > MAX_CV_BYTES || file.name.length > 200) {
    throw new Error('Choose a PDF or DOCX up to 2 MiB.');
  }
  if (!name || name.length > 200) throw new Error('Enter a CV name of up to 200 characters.');
  const uploadKey = crypto.randomUUID(),
    saveKey = crypto.randomUUID();
  let document: Record<string, unknown> | undefined;
  let ready: Record<string, unknown> | undefined;
  let version: Record<string, unknown> | undefined;
  let transferFailed = false;
  let saved: SavedCv | undefined;
  let running = false;
  return async (progress: (message: string) => void): Promise<SavedCv> => {
    if (saved) return saved;
    if (running) throw new Error('This upload is already running.');
    if (transferFailed) throw new Error('Select the file again to start a new upload.');
    running = true;
    try {
      const bytes = await file.arrayBuffer();
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
      progress('Preparing secure upload…');
      document ??= await bridge.call('create_document_upload', {
        filename: file.name,
        mimeType,
        kind: 'cv',
        byteSize: bytes.byteLength,
        sha256: hash,
        mode: 'signed',
        requestId: uploadKey,
      });
      if (!uuid(document.id)) throw new Error('The upload could not be prepared.');
      if (!ready) {
        if (document.state !== 'ready' && document.state !== 'uploaded') {
          let url: URL;
          try {
            url = new URL(String(document.uploadUrl));
          } catch {
            throw new Error('The upload destination is unavailable.');
          }
          if (
            url.protocol !== 'https:' ||
            url.username ||
            url.password ||
            url.hash ||
            !bridge.origins.includes(url.origin) ||
            document.method !== 'PUT'
          ) {
            throw new Error('The upload destination is not approved.');
          }
          progress('Uploading your original file…');
          try {
            await bridge.put(url.href, file, { 'Content-Type': mimeType });
          } catch {
            transferFailed = true;
            throw new Error('Upload failed. Select the file again to retry.');
          }
          // Retain transfer success so a failed finalization/save can retry without another PUT.
          document = { ...document, state: 'uploaded' };
        }
        progress('Verifying your document…');
        ready = await bridge.call('finalize_document_upload', { documentId: document.id });
      }
      if (
        ready.id !== document.id ||
        ready.state !== 'ready' ||
        ready.byte_size !== file.size ||
        ready.sha256 !== hash
      )
        throw new Error('Document verification failed. The CV was not saved.');
      progress('Saving your CV…');
      version ??= await bridge.call('save_cv', {
        name,
        documentId: document.id,
        expectedRevision: 0,
        requestId: saveKey,
      });
      if (
        !uuid(version.cv_id) ||
        !uuid(version.id) ||
        version.document_id !== document.id ||
        version.version !== 1
      )
        throw new Error('The CV save could not be verified.');
      const cv = await bridge.call('get_cv', { cvId: version.cv_id });
      const versions = record(cv.versions) ? cv.versions.items : undefined;
      if (
        cv.id !== version.cv_id ||
        cv.name !== name ||
        !Array.isArray(versions) ||
        !versions.some(
          (item: unknown) =>
            record(item) &&
            item.id === version?.id &&
            item.document_id === document?.id &&
            item.version === 1,
        )
      ) {
        throw new Error('The saved version could not be verified. Retry the confirmation.');
      }
      saved = { cvId: version.cv_id, versionId: version.id, version: 1, name };
      return saved;
    } finally {
      running = false;
    }
  };
}
