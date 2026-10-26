import { define } from '../tools/schemas.ts';
import { UPLOAD_HTML } from './panel.generated.ts';

export const UPLOAD_URI = 'ui://hiddenjobs/upload-cv-v1.html';
export const UPLOAD_MIME = 'text/html;profile=mcp-app';
export const uploadCvTool = {
  ...define(
    'upload_cv',
    'Upload CV',
    'Open an interactive file picker to save an original PDF or DOCX as a new CV in Hidden Jobs. Use when the client cannot import an attachment or upload its bytes reliably. Ask the user to select the file in the panel, even if already attached to the chat. The user confirms the upload there. Return this panel immediately and wait for the user; do not poll, reproduce base64, or claim success before the panel confirms a saved version. Clients without an interactive panel can upload at https://hiddenjobs.dev/dashboard/career.',
    { name: { type: 'string', maxLength: 200 } },
  ),
  _meta: { ui: { resourceUri: UPLOAD_URI }, 'ui/resourceUri': UPLOAD_URI },
};

export function uploadPanelResource(origins: string[]) {
  const approved = [
    ...new Set(
      origins.map((origin) => {
        const url = new URL(origin);
        if (url.protocol !== 'https:' || url.origin !== origin)
          throw new Error('Invalid upload origin');
        return url.origin;
      }),
    ),
  ];
  const config = JSON.stringify({ origins: approved }).replaceAll('<', '\\u003c');
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
