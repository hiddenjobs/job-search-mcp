import { type Source, type Row, parseFeed, record, text } from './formats.ts';

interface Page {
  rows: unknown[];
  next: string | null;
  offset?: number;
  coverage: string;
}
/** Public data only. The cache is bounded, temporary and never contains user tokens. */
export function createProviderClient(fetcher: typeof fetch = fetch, now = Date.now) {
  const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
  async function load(url: URL, ttl: number, rss = false): Promise<unknown> {
    const key = url.href;
    const entry = cache.get(key);
    if (entry && entry.expires > now()) return entry.value;
    if (cache.size >= 16) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    const value = (async () => {
      const response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: rss ? 'application/rss+xml, application/xml' : 'application/json',
          'User-Agent': 'HiddenJobs-MCP/1.0 (+https://hiddenjobs.dev/mcp/docs)',
        },
      });
      if (!response.ok) throw Error(response.status === 429 ? 'rate_limit' : 'source_unavailable');
      const reader = (response.body as ReadableStream<Uint8Array> | null)?.getReader();
      if (!reader) throw Error('source_unavailable');
      let size = 0,
        body = '';
      const decoder = new TextDecoder();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) throw Error('source_unavailable');
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } finally {
        await reader.cancel();
      }
      return rss ? parseFeed(body) : (JSON.parse(body) as unknown);
    })();
    cache.set(key, { expires: now() + ttl, value });
    try {
      return await value;
    } catch (error) {
      cache.set(key, { expires: now() + 60000, value });
      throw error;
    }
  }
  return {
    async page(
      source: Source,
      query: string,
      limit: number,
      continuation: Row = {},
    ): Promise<Page> {
      if (source === 'remoteok' || source === 'weworkremotely') {
        const rss = source === 'weworkremotely';
        const data = await load(
          new URL(rss ? 'https://weworkremotely.com/remote-jobs.rss' : 'https://remoteok.com/api'),
          3600000,
          rss,
        );
        if (!Array.isArray(data)) throw Error('source_unavailable');
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
        url.searchParams.set('page', String(Number(continuation.page ?? 1)));
      }
      const data = record(await load(url, source === 'jobicy' ? 3600000 : 86400000));
      if (!Array.isArray(data.jobs)) throw Error('source_unavailable');
      return {
        rows: data.jobs,
        next:
          source === 'jobicy'
            ? text(data.nextCursor) || null
            : data.jobs.length
              ? String(Number(continuation.page ?? 1) + 1)
              : null,
        coverage:
          source === 'jobicy'
            ? 'Public listings from the last seven days, delayed by three hours.'
            : 'Public search results, refreshed daily. Verify country and timezone eligibility.',
      };
    },
  };
}
