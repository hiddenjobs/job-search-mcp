import { createMcpHandler } from './server.ts';
import { createRestClient } from './api/client.ts';

interface RestMcpOptions {
  apiBaseUrl?: string;
  metadataUrl?: string;
  careerEnabled?: boolean;
  uploadOrigins?: string[];
  fetcher?: typeof fetch;
}

/** Each request forwards its original OAuth token to the same REST operations. */
export function createRestMcpHandler(options: RestMcpOptions = {}) {
  return createMcpHandler({
    metadataUrl: options.metadataUrl,
    careerEnabled: options.careerEnabled,
    uploadOrigins: options.uploadOrigins,
    execute: (token, name, args) =>
      createRestClient(token, options.apiBaseUrl, options.fetcher).call(name, args),
  });
}
