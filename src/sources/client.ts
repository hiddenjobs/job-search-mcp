import { CareerError } from '../errors.ts';
import { parseFeed } from './jobs.ts';
import { record, text, sourceUrl } from './validation.ts';
import type { ProviderPage, SourceContinuation, Source } from './schemas.ts';

const ITJOBS_FEED = 'https://feeds.itjobs.pt/feed/emprego?remote=1&limit=100';
const CACHE_CAPACITY = 16;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FAILURE_COOLDOWN_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

class ProviderHttpError extends Error {
  constructor(public status: number) {
    super(status === 429 ? 'rate_limit' : 'source_unavailable');
  }
}

/** Public data only. The cache is bounded, temporary and never contains user tokens. */
export function createProviderClient(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
  async function loadPublicResponse(
    url: URL,
    ttl: number,
    rss: 'weworkremotely' | 'itjobs' | false = false,
  ): Promise<unknown> {
    const key = url.href;
    const entry = cache.get(key);
    if (entry && entry.expires > now()) return entry.value;
    if (cache.size >= CACHE_CAPACITY) {
      const oldest = [...cache.keys()].find((key) => key !== ITJOBS_FEED);
      if (oldest !== undefined) cache.delete(oldest);
    }
    const value = (async () => {
      const response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          Accept: rss ? 'application/rss+xml, application/xml' : 'application/json',
          'User-Agent': 'HiddenJobs-MCP/1.0 (+https://hiddenjobs.dev/mcp/docs)',
        },
      });
      if (!response.ok) throw new ProviderHttpError(response.status);
      const reader = (response.body as ReadableStream<Uint8Array> | null)?.getReader();
      if (!reader) throw new Error('source_unavailable');
      let size = 0;
      let body = '';
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) throw new Error('source_unavailable');
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        await reader.cancel();
      }
      return rss ? parseFeed(body, rss) : (JSON.parse(body) as unknown);
    })();
    cache.set(key, { expires: now() + ttl, value });
    try {
      return await value;
    } catch (error) {
      cache.set(key, { expires: now() + (key === ITJOBS_FEED ? ttl : FAILURE_COOLDOWN_MS), value });
      throw error;
    }
  }
  return {
    async himalayasJob(guid: string): Promise<unknown> {
      const canonical = new URL(sourceUrl('himalayas', guid));
      canonical.search = '';
      const url = new URL('/jobs/api' + canonical.pathname, canonical.origin);
      try {
        const data = record(await loadPublicResponse(url, 10 * 60 * 1000));
        const job = record(data.job);
        if (job.guid !== canonical.href) throw new Error('source_unavailable');
        return job;
      } catch (error) {
        if (error instanceof ProviderHttpError && (error.status === 404 || error.status === 410))
          throw new CareerError(
            'not_found',
            error.status === 410
              ? 'The provider reports that this offer has closed.'
              : 'The provider could not find this offer. Search again for current listings.',
            error.status,
          );
        throw new CareerError(
          'source_unavailable',
          'The external source is temporarily unavailable. Retry later.',
          503,
        );
      }
    },
    async page(
      source: Source,
      query: string,
      limit: number,
      continuation: SourceContinuation = {},
    ): Promise<ProviderPage> {
      if (source === 'itjobs') {
        const rows = await loadPublicResponse(new URL(ITJOBS_FEED), HOUR_MS, 'itjobs');
        if (!Array.isArray(rows)) throw new Error('source_unavailable');
        return {
          rows,
          next: null,
          coverage:
            'Current remote-only feed (up to 100 entries); Portugal-focused summary metadata, refreshed hourly.',
        };
      }
      if (source === 'remoteok' || source === 'weworkremotely') {
        const rss = source === 'weworkremotely';
        const data = await loadPublicResponse(
          new URL(rss ? 'https://weworkremotely.com/remote-jobs.rss' : 'https://remoteok.com/api'),
          HOUR_MS,
          rss ? 'weworkremotely' : false,
        );
        if (!Array.isArray(data)) throw new Error('source_unavailable');
        return {
          rows: data,
          next: null,
          coverage: 'Current public feed only; not the full historical job board.',
        };
      }
      const url = new URL(
        source === 'jobicy'
          ? 'https://jobicy.com/api/v2/remote-jobs'
          : 'https://himalayas.app/jobs/api/search',
      );
      if (source === 'jobicy') {
        url.searchParams.set('count', String(limit));
        if (query) url.searchParams.set('tag', query);
        if (typeof continuation.next === 'string')
          url.searchParams.set('cursor', continuation.next);
      } else {
        if (query) url.searchParams.set('q', query);
        url.searchParams.set('page', String(continuation.page ?? 1));
      }
      const data = record(await loadPublicResponse(url, source === 'jobicy' ? HOUR_MS : DAY_MS));
      if (!Array.isArray(data.jobs)) throw new Error('source_unavailable');
      const cursor = text(data.nextCursor);
      return {
        rows: data.jobs,
        next:
          source === 'jobicy'
            ? cursor
              ? { next: cursor }
              : null
            : data.jobs.length
              ? { page: (continuation.page ?? 1) + 1 }
              : null,
        coverage:
          source === 'jobicy'
            ? 'Public listings from the last seven days, delayed by three hours.'
            : 'Public search results, refreshed daily. Verify country and timezone eligibility.',
      };
    },
  };
}
