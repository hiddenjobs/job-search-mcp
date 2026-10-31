import { define, id } from '../tools/schemas.ts';
import { UPLOAD_HTML } from './panel.generated.ts';

export const UPLOAD_URI = 'ui://hiddenjobs/upload-cv-v1.html';
export const UPLOAD_MIME = 'text/html;profile=mcp-app';
export const uploadCvTool = {
  ...define(
    'upload_cv',
    'Upload CV',
    'Upload an original PDF or DOCX through the visual panel. In terminal clients, open the returned short-lived uploadUrl in a browser. The user selects the file and confirms saving a new CV. Never send file bytes through the model. Wait for the user; then call get_cv_upload with sessionId to verify the saved CV. Do not claim success merely because a link was created.',
    { name: { type: 'string', maxLength: 200 } },
    [],
    true,
  ),
  _meta: { ui: { resourceUri: UPLOAD_URI }, 'ui/resourceUri': UPLOAD_URI },
};

export const cvUploadStatusTool = define(
  'get_cv_upload',
  'Get CV upload status',
  'After the user confirms uploading through upload_cv, check this sessionId for a saved CV and exact version. Do not poll while the user is choosing a file. Only the connected account can read its own session.',
  { sessionId: id },
  ['sessionId'],
);

export function uploadPanelResource(origins: string[], standalone = false) {
  const approved = [
    ...new Set(
      [...origins, 'https://hiddenjobs.dev'].map((origin) => {
        const url = new URL(origin);
        if (url.protocol !== 'https:' || url.origin !== origin)
          throw new Error('Invalid upload origin');
        return url.origin;
      }),
    ),
  ];
  const config = JSON.stringify({ origins: approved, standalone }).replaceAll('<', '\\u003c');
  return {
    contents: [
      {
        uri: UPLOAD_URI,
        mimeType: UPLOAD_MIME,
        text: UPLOAD_HTML.replace('__UPLOAD_CONFIG__', () => config),
        _meta: { ui: { prefersBorder: true, csp: { connectDomains: approved } } },
      },
    ],
  };
}
