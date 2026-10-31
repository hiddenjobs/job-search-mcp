import { UPLOAD_URI, UPLOAD_MIME, isUploadResource, uploadPanelResource } from '../ui/panel.ts';
import { CareerError } from '../errors.ts';
import { getWorkflow, guides, templates, workflows } from './workflows.ts';

export type ResourceCall = (name: string, args?: Record<string, unknown>) => Promise<unknown>;
export const isSharedResource = (uri: string) =>
  isUploadResource(uri) || /^hiddenjobs:\/\/(workflows|guides|templates)\//.test(uri);

export const careerResources = {
  resourceList: () => ({
    resources: [
      { uri: UPLOAD_URI, name: 'Save your CV', mimeType: UPLOAD_MIME },
      ...Object.entries(workflows).map(([name, workflow]) => ({
        uri: `hiddenjobs://workflows/${name}`,
        name: workflow.title,
        mimeType: 'application/json',
      })),
      ...Object.keys(guides).map((name) => ({
        uri: `hiddenjobs://guides/${name}`,
        name,
        mimeType: 'text/plain',
      })),
      ...Object.keys(templates).map((name) => ({
        uri: `hiddenjobs://templates/${name}`,
        name,
        mimeType: 'text/plain',
      })),
    ],
  }),
  readResource: async (
    uri: string,
    call: ResourceCall,
    origins = ['https://api.hiddenjobs.dev'],
  ) => {
    if (isUploadResource(uri)) {
      const resource = uploadPanelResource(origins);
      return { contents: resource.contents.map((content) => ({ ...content, uri })) };
    }
    const shared = /^hiddenjobs:\/\/(workflows|guides|templates)\/([a-z-]+)$/.exec(uri);
    if (shared) {
      const entries = shared[1] === 'guides' ? guides : templates;
      const value =
        shared[1] === 'workflows'
          ? getWorkflow(shared[2])
          : Object.hasOwn(entries, shared[2])
            ? entries[shared[2]]
            : undefined;
      if (!value) throw new CareerError('not_found', 'Resource not found.', 404);
      return {
        contents: [
          {
            uri,
            mimeType: typeof value === 'string' ? 'text/plain' : 'application/json',
            text: typeof value === 'string' ? value : JSON.stringify(value),
          },
        ],
      };
    }
    let data;
    if (uri === 'hiddenjobs://me/profile') data = await call('get_candidate_profile');
    else {
      const match = /^hiddenjobs:\/\/me\/(cvs|applications|documents)\/([a-f0-9-]{36})$/.exec(uri);
      if (!match) throw new CareerError('not_found', 'Resource not found.', 404);
      const [tool, key] =
        match[1] === 'cvs'
          ? ['get_cv', 'cvId']
          : match[1] === 'applications'
            ? ['get_application', 'applicationId']
            : ['get_document', 'documentId'];
      data = await call(tool, { [key]: match[2] });
    }
    return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data) }] };
  },
  promptList: () => ({
    prompts: Object.entries(workflows).map(([name, workflow]) => ({
      name,
      title: workflow.title,
      description: workflow.title,
    })),
  }),
  getPrompt: (name: string) => {
    const workflow = getWorkflow(name);
    if (!workflow) throw new CareerError('not_found', 'Prompt not found.', 404);
    return {
      description: workflow.title,
      messages: [{ role: 'user', content: { type: 'text', text: workflow.instructions } }],
    };
  },
};
