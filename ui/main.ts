import { App } from '@modelcontextprotocol/ext-apps';
import {
  saveCvFile,
  parseUploadStatus,
  uploadCapability,
  type SavedCv,
  type UploadSession,
} from '../src/ui/upload.ts';
function required<T>(value: T | null): T {
  if (!value) throw new Error('Upload panel is incomplete.');
  return value;
}
const form = required(document.querySelector('form'));
const file = required(document.querySelector<HTMLInputElement>('#file'));
const name = required(document.querySelector<HTMLInputElement>('#name'));
const submit = required(document.querySelector<HTMLButtonElement>('button[type=submit]'));
const status = required(document.querySelector<HTMLElement>('#status'));
const config = JSON.parse(required(document.querySelector('#config')).textContent) as {
  standalone?: boolean;
};
const app = config.standalone
  ? undefined
  : new App({ name: 'Hidden Jobs CV upload', version: '2.0.0' }, {});
let session: UploadSession | undefined,
  busy = false;
const text = (message: string) => {
  status.textContent = message;
};
function prepare(value: UploadSession) {
  uploadCapability(value);
  session = value;
  if (!name.value && value.name) name.value = value.name;
  submit.disabled = false;
  text('Choose your file and confirm to save a new CV in Hidden Jobs.');
}
file.addEventListener('change', () => {
  if (!name.value && file.files?.[0]) name.value = file.files[0].name.replace(/\.[^.]+$/, '');
});
async function announce(cv: SavedCv) {
  if (!app) return;
  const message = `Saved CV “${cv.name}”, version ${cv.version}, in Hidden Jobs. CV ID: ${cv.cvId}. Version ID: ${cv.versionId}. Original/default CV unchanged.`;
  try {
    await app.updateModelContext({ content: [{ type: 'text', text: message }] });
    await app.sendMessage({ role: 'user', content: [{ type: 'text', text: message }] });
  } catch {
    text(`Saved “${cv.name}”, version ${cv.version}. Tell your assistant the CV is ready.`);
  }
}
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy || !session) return;
  const selected = file.files?.[0];
  if (!selected) {
    text('Choose your PDF or DOCX first.');
    return;
  }
  busy = true;
  submit.disabled = true;
  file.disabled = true;
  name.disabled = true;
  text('Uploading and verifying your original file…');
  void saveCvFile(selected, name.value, session, config.standalone ? location.origin : undefined)
    .then(async (cv) => {
      submit.textContent = 'Saved';
      text(
        `Saved “${cv.name}”, version ${cv.version}. Your default CV is unchanged. You can return to your assistant.`,
      );
      await announce(cv);
    })
    .catch((error: unknown) => {
      text(error instanceof Error ? error.message : 'Could not save your CV.');
      submit.disabled = false;
      file.disabled = false;
      name.disabled = false;
    })
    .finally(() => {
      busy = false;
    });
});
if (app) {
  app.addEventListener('toolresult', (result) => {
    try {
      prepare(result.structuredContent as UploadSession);
    } catch {
      text('The upload link is unavailable. Ask your assistant for a new one.');
    }
  });
  void app.connect().catch(() => {
    text(
      'This client cannot open the panel. Open the private upload link returned by your assistant.',
    );
  });
} else {
  const fragment = location.hash;
  history.replaceState(null, '', location.pathname);
  const match = /^#([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(fragment);
  if (!match) text('This upload link is invalid. Ask your assistant for a new one.');
  else {
    const value = {
      sessionId: match[1],
      uploadUrl: `https://hiddenjobs.dev/mcp/upload${fragment}`,
      expiresAt: '',
    };
    void fetch(`/api/cv-uploads/${match[1]}`, {
      headers: { Authorization: `Bearer ${match[2]}` },
      credentials: 'omit',
      redirect: 'error',
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'This upload link is invalid or expired. Ask your assistant for a new one.',
          );
        const body: unknown = await response.json();
        const data = parseUploadStatus(body);
        if (data.status === 'saved' && data.cv) {
          text(
            `Saved “${data.cv.name}”, version ${data.cv.version}. Return to your assistant to continue.`,
          );
          return;
        }
        prepare({ ...value, name: data.name, expiresAt: data.expiresAt });
      })
      .catch((error: unknown) => {
        text(error instanceof Error ? error.message : 'Could not open the upload link.');
      });
  }
}
