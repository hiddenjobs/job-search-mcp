import { CareerError } from '../errors.ts';
import {
  providers,
  type Source,
  type Row,
  record,
  text,
  normalize,
  locationMatches,
  encode,
  decode,
  sourceUrl,
} from './formats.ts';
import { createProviderClient } from './providers.ts';

export interface SourceSearchResult {
  source: Source;
  jobs: Row[];
  nextCursor?: string | null;
  coverage?: string;
  warning?: string;
  error?: { code: string; fields?: string[]; message: string };
}
export const isExternal = (source: string): source is Source => Object.hasOwn(providers, source);
const invalid = () =>
  new CareerError(
    'invalid_arguments',
    'Invalid source, job reference or cursor. Read search_jobs again.',
    400,
  );
function continuation(value: unknown): Row {
  const row = record(value);
  if (Object.keys(row).some((key) => !['page', 'next', 'offset'].includes(key))) throw invalid();
  if (
    row.page !== undefined &&
    (!Number.isSafeInteger(row.page) || Number(row.page) < 1 || Number(row.page) > 10000)
  )
    throw invalid();
  if (
    row.offset !== undefined &&
    (!Number.isSafeInteger(row.offset) || Number(row.offset) < 0 || Number(row.offset) > 100000)
  )
    throw invalid();
  if (row.next !== undefined && (typeof row.next !== 'string' || row.next.length > 1024))
    throw invalid();
  return row;
}
/** Reads public provider APIs/feeds; no database, email, user documents or write operations. */
export function createExternalJobs(fetcher: typeof fetch = fetch, now = Date.now) {
  const client = createProviderClient(fetcher, now);
  async function normalized(source: Source, query: string, limit: number, state: Row) {
    const page = await client.page(source, query, limit, state);
    let rejected = 0;
    const jobs = page.rows.flatMap((row) => {
      try {
        const job = normalize(source, row);
        if (!job) return [];
        job.id = encode({
          ...decode(String(job.id)),
          query,
          limit,
          continuation: { ...state, offset: 0 },
        });
        if (String(job.id).length > 2000) throw Error('Invalid provider reference');
        return [job];
      } catch {
        rejected++;
        return [];
      }
    });
    if (page.rows.length && !jobs.length) throw Error('source_unavailable');
    return { ...page, jobs, rejected };
  }
  return {
    async search(source: Source, params: URLSearchParams): Promise<SourceSearchResult> {
      const query = (text(params.get('q')) || text(params.get('query'))).trim().slice(0, 120);
      const location = text(params.get('remoteLocation')) || text(params.get('location')) || 'All';
      const limit = Math.max(1, Math.min(Number(text(params.get('limit')) || 20), 50));
      const key = JSON.stringify([source, query, location, limit]);
      let state: Row = {};
      const cursors = params.get('cursors');
      try {
        const cursor = record(cursors ? JSON.parse(cursors) : {})[source];
        if (cursor !== undefined) {
          if (typeof cursor !== 'string' || cursor.length > 2048) throw invalid();
          const decoded = decode(cursor);
          if (decoded.key !== key) throw invalid();
          state = continuation(decoded.state);
        }
      } catch {
        throw invalid();
      }
      const unsupported = ['category', 'employmentType', 'jobType'].filter(
        (name) => params.has(name) && params.get(name) !== 'All',
      );
      if (unsupported.length)
        return {
          source,
          jobs: [],
          error: {
            code: 'unsupported_filters',
            fields: unsupported,
            message:
              'These filters use Hidden Jobs taxonomies. Omit them for this external source; use query and remoteLocation.',
          },
        };
      if (Number(text(params.get('page')) || 1) !== 1)
        return {
          source,
          jobs: [],
          error: {
            code: 'unsupported_pagination',
            message:
              'External sources use cursors, not page. Pass their nextCursor and keep page at 1.',
          },
        };
      // Validate location even when a provider returns an empty page.
      try {
        locationMatches('', location);
      } catch {
        throw invalid();
      }
      try {
        const page = await normalized(source, query, limit, state);
        const words = query.toLowerCase().split(/\s+/).filter(Boolean);
        const matched = page.jobs.filter((job) => {
          const haystack = [job.title, job.description, job.category].join(' ').toLowerCase();
          return (
            (source === 'jobicy' ||
              source === 'himalayas' ||
              words.every((word) => haystack.includes(word))) &&
            locationMatches(job.location, location)
          );
        });
        const offset = Number(state.offset ?? 0);
        const jobs = matched.slice(offset, offset + limit).map((job) => {
          const summary = { ...job };
          delete summary.description;
          return summary;
        });
        let next: Row | null =
          offset + limit < matched.length ? { ...state, offset: offset + limit } : null;
        if (!next && page.next)
          next = source === 'jobicy' ? { next: page.next } : { page: Number(page.next) };
        return {
          source,
          jobs,
          nextCursor: next ? encode({ key, state: next }) : null,
          coverage: page.coverage,
          ...(page.rejected ? { warning: 'Some malformed provider entries were omitted.' } : {}),
        };
      } catch (error) {
        return {
          source,
          jobs: [],
          error: {
            code:
              error instanceof Error && error.message === 'rate_limit'
                ? 'source_rate_limit'
                : 'source_unavailable',
            message:
              'This source could not be searched. Retry later; do not interpret this as no matching jobs.',
          },
        };
      }
    },
    async get(source: Source, reference: string) {
      let ref: Row;
      try {
        if (reference.length > 2000) throw invalid();
        ref = decode(reference);
        if (
          ref.source !== source ||
          typeof ref.nativeId !== 'string' ||
          !ref.nativeId ||
          typeof ref.query !== 'string' ||
          ref.query.length > 120 ||
          !Number.isSafeInteger(ref.limit) ||
          Number(ref.limit) < 1 ||
          Number(ref.limit) > 50
        )
          throw invalid();
        sourceUrl(source, ref.url);
        continuation(ref.continuation);
      } catch {
        throw invalid();
      }
      let jobs: Row[];
      try {
        jobs = (
          await normalized(
            source,
            text(ref.query),
            Number(ref.limit),
            continuation(ref.continuation),
          )
        ).jobs;
      } catch {
        throw new CareerError(
          'source_unavailable',
          'The external source is temporarily unavailable.',
          503,
        );
      }
      const job = jobs.find((item) => {
        const current = decode(String(item.id));
        return current.nativeId === ref.nativeId && item.sourceUrl === ref.url;
      });
      if (!job)
        throw new CareerError(
          'not_found',
          'This offer is no longer available in the provider feed. Search again; its absence does not confirm that the job has closed.',
          404,
        );
      return job;
    },
  };
}
