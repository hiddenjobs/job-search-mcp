import { App } from '@modelcontextprotocol/ext-apps';
import { createCvUpload, type SavedCv } from '../src/ui/upload.ts';

const app = new App({ name: 'Hidden Jobs CV upload', version: '1.0.0' }, {});
function required<T>(element: T | null): T {
  if (!element) throw new Error('Upload panel is incomplete.');
  return element;
}
const form = required(document.querySelector('form'));
const fileInput = required(document.querySelector<HTMLInputElement>('#file'));
const nameInput = required(document.querySelector<HTMLInputElement>('#name'));
const submit = required(document.querySelector<HTMLButtonElement>('button[type=submit]'));
const status = required(document.querySelector<HTMLElement>('#status'));
const config = JSON.parse(required(document.querySelector('#config')).textContent) as {
  origins: string[];
};
let connected = false,
  busy = false;
let save: ReturnType<typeof createCvUpload> | undefined;
const text = (message: string) => {
  status.textContent = message;
};
app.addEventListener('toolresult', (result) => {
  const data = result.structuredContent as { name?: string } | undefined;
  if (data?.name && !nameInput.value) nameInput.value = data.name;
});
fileInput.addEventListener('change', () => {
  save = undefined;
  if (!nameInput.value && fileInput.files?.[0])
    nameInput.value = fileInput.files[0].name.replace(/\.[^.]+$/, '');
  text('Your original file will be saved as a new CV.');
});
nameInput.addEventListener('input', () => {
  save = undefined;
});
const call = async (name: string, args: Record<string, unknown>) => {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError)
    throw new Error('Hidden Jobs could not complete this step. Reconnect if needed, then retry.');
  const data: unknown = (result.structuredContent as { data?: unknown } | undefined)?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Hidden Jobs returned an invalid response.');
  return data as Record<string, unknown>;
};
const announce = async (cv: SavedCv) => {
  const summary = `Saved CV “${cv.name}”, version ${cv.version}, in Hidden Jobs. CV ID: ${cv.cvId}. Version ID: ${cv.versionId}. Original/default CV unchanged. Use the saved version for the next career step.`;
  try {
    await app.updateModelContext({ content: [{ type: 'text', text: summary }] });
    await app.sendMessage({ role: 'user', content: [{ type: 'text', text: summary }] });
  } catch {
    text(`Saved “${cv.name}”, version ${cv.version}. Tell your assistant the CV is ready.`);
  }
};
required(document.querySelector('a')).addEventListener('click', (event) => {
  if (!connected) return;
  event.preventDefault();
  void app.openLink({ url: 'https://hiddenjobs.dev/dashboard/career' }).catch(() => {
    text('Open https://hiddenjobs.dev/dashboard/career in your browser.');
  });
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy || !connected) return;
  const file = fileInput.files?.[0];
  if (!file) {
    text('Choose your PDF or DOCX first.');
    return;
  }
  busy = true;
  submit.disabled = true;
  fileInput.disabled = true;
  nameInput.disabled = true;
  void (async () => {
    try {
      save ??= createCvUpload(file, nameInput.value, {
        call,
        origins: config.origins,
        put: async (url, selected, headers) => {
          const response = await fetch(url, {
            method: 'PUT',
            body: selected,
            headers,
            credentials: 'omit',
            redirect: 'error',
            signal: AbortSignal.timeout(60000),
          });
          if (!response.ok) throw new Error('Upload failed.');
        },
      });
      const cv = await save(text);
      text(
        `Saved “${cv.name}”, version ${cv.version}. Your original and default CV are unchanged.`,
      );
      submit.textContent = 'Saved';
      await announce(cv);
    } catch (error) {
      text(error instanceof Error ? error.message : 'Could not save the CV. Please retry.');
      submit.disabled = false;
      fileInput.disabled = false;
      nameInput.disabled = false;
    } finally {
      busy = false;
    }
  })();
});
void app
  .connect()
  .then(() => {
    connected = true;
    submit.disabled = false;
    text('Choose your file and confirm to save it in Hidden Jobs.');
  })
  .catch(() => {
    text('This client could not open the upload panel. Use the dashboard link below.');
  });
