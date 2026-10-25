import { CareerError } from '../errors.ts';
import {
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
import {
  SOURCE_LIMITS,
  providers,
  type Source,
  type ExternalJob,
  type ExternalJobSummary,
  type SourceContinuation,
  type SourceSearchResult,
} from './contracts.ts';
export type { SourceSearchResult } from './contracts.ts';

export const isExternal = (source: string): source is Source => Object.hasOwn(providers, source);
const invalidSourceArguments = () =>
  new CareerError(
    'invalid_arguments',
    'Invalid source, job reference or cursor. Read search_jobs again.',
    400,
  );
function parseContinuation(value: unknown): SourceContinuation {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value)))
    throw invalidSourceArguments();
  const row = record(value);
  if (Object.keys(row).some((key) => !['page', 'next', 'offset'].includes(key)))
    throw invalidSourceArguments();
  const { page, next, offset } = row;
  if (
    page !== undefined &&
    (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1 || page > 10000)
  )
    throw invalidSourceArguments();
  if (
    offset !== undefined &&
    (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
  )
    throw invalidSourceArguments();
  if (next !== undefined && (typeof next !== 'string' || next.length > 1024))
    throw invalidSourceArguments();
  return { page, next, offset };
}
/** Reads public provider APIs/feeds; no database, email, user documents or write operations. */
export function createExternalJobs(fetcher: typeof fetch = fetch, now = Date.now) {
  const client = createProviderClient(fetcher, now);
  async function readNormalizedPage(
    source: Source,
    query: string,
    limit: number,
    state: SourceContinuation,
  ) {
    const page = await client.page(source, query, limit, state);
    let rejected = 0;
    const jobs = page.rows.flatMap((row) => {
      try {
        const job = normalize(source, row);
        if (!job) return [];
        job.id = encode({
          ...decode(job.id),
          query,
          limit,
          continuation: { ...state, offset: 0 },
        });
        if (job.id.length > SOURCE_LIMITS.referenceLength)
          throw new Error('Invalid provider reference');
        return [job];
      } catch {
        rejected++;
        return [];
      }
    });
    if (page.rows.length && !jobs.length) throw new Error('source_unavailable');
    return { ...page, jobs, rejected };
  }
  return {
    async search(source: Source, params: URLSearchParams): Promise<SourceSearchResult> {
      const query = (text(params.get('q')) || text(params.get('query')))
        .trim()
        .slice(0, SOURCE_LIMITS.queryLength);
      const location = text(params.get('remoteLocation')) || text(params.get('location')) || 'All';
      const requestedLimit = Number(text(params.get('limit')) || 20);
      if (!Number.isSafeInteger(requestedLimit)) throw invalidSourceArguments();
      const limit = Math.max(1, Math.min(requestedLimit, SOURCE_LIMITS.pageSize));
      const key = JSON.stringify([source, query, location, limit]);
      let state: SourceContinuation = {};
      const cursors = params.get('cursors');
      try {
        const cursor = record(cursors ? JSON.parse(cursors) : {})[source];
        if (cursor !== undefined) {
          if (typeof cursor !== 'string' || cursor.length > SOURCE_LIMITS.cursorLength)
            throw invalidSourceArguments();
          const decoded = decode(cursor);
          if (decoded.key !== key) throw invalidSourceArguments();
          state = parseContinuation(decoded.state);
        }
      } catch {
        throw invalidSourceArguments();
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
        throw invalidSourceArguments();
      }
      try {
        const page = await readNormalizedPage(source, query, limit, state);
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
        const offset = state.offset ?? 0;
        const jobs = matched.slice(offset, offset + limit).map((job) => {
          const summary: ExternalJobSummary = { ...job };
          delete summary.description;
          return summary;
        });
        let next: SourceContinuation | null =
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
        if (reference.length > SOURCE_LIMITS.referenceLength) throw invalidSourceArguments();
        ref = decode(reference);
        if (
          ref.source !== source ||
          typeof ref.nativeId !== 'string' ||
          !ref.nativeId ||
          typeof ref.query !== 'string' ||
          ref.query.length > SOURCE_LIMITS.queryLength ||
          !Number.isSafeInteger(ref.limit) ||
          Number(ref.limit) < 1 ||
          Number(ref.limit) > SOURCE_LIMITS.pageSize
        )
          throw invalidSourceArguments();
        sourceUrl(source, ref.url);
        parseContinuation(ref.continuation);
      } catch {
        throw invalidSourceArguments();
      }
      let jobs: ExternalJob[];
      try {
        jobs = (
          await readNormalizedPage(
            source,
            text(ref.query),
            Number(ref.limit),
            parseContinuation(ref.continuation),
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
        const current = decode(item.id);
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
