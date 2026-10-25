export const providers = {
  jobicy: { name: 'Jobicy', origin: 'https://jobicy.com', path: /^\/jobs\/[^/]+$/ },
  weworkremotely: {
    name: 'We Work Remotely',
    origin: 'https://weworkremotely.com',
    path: /^\/remote-jobs\/[^/]+$/,
  },
  remoteok: { name: 'Remote OK', origin: 'https://remoteok.com', path: /^\/remote-jobs\/[^/]+$/ },
  himalayas: {
    name: 'Himalayas',
    origin: 'https://himalayas.app',
    path: /^\/companies\/[^/]+\/jobs\/[^/]+$/,
  },
};
export type Source = keyof typeof providers;

/** Only validated provider continuation state crosses the transport boundary. */
export interface SourceContinuation {
  page?: number;
  next?: string;
  offset?: number;
}

export interface ProviderPage {
  rows: unknown[];
  next: string | null;
  coverage: string;
}

/** Normalized routing fields are separate from untrusted provider metadata. */
export interface ExternalJobSummary extends Record<string, unknown> {
  title: string;
  description?: string;
  salary: string;
  location: string | null;
  id: string;
  source: Source;
  sourceName: string;
  sourceUrl: string;
  applicationUrl: string;
  attribution: {
    name: string;
    url: string;
    linkRel?: 'follow';
    logoAllowed?: boolean;
  };
}

export interface ExternalJob extends ExternalJobSummary {
  description: string;
}

export interface SourceSearchResult {
  source: Source;
  jobs: ExternalJobSummary[];
  nextCursor?: string | null;
  coverage?: string;
  warning?: string;
  error?: { code: string; fields?: string[]; message: string };
}

export const SOURCE_LIMITS = {
  queryLength: 120,
  defaultPageSize: 20,
  pageSize: 50,
  pageNumber: 10000,
  offset: 100000,
  nativeCursorLength: 1024,
  urlLength: 1000,
  trackingValueLength: 200,
  titleLength: 500,
  nativeIdLength: 1000,
  descriptionLength: 60000,
  previewLength: 600,
  referenceLength: 2000,
  cursorLength: 2048,
} as const;
