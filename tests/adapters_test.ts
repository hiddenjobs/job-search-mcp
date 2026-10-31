import { assert } from './helpers.ts';
import type { Source } from '../src/sources/schemas.ts';
import { createExternalJobs } from '../src/sources/index.ts';
import { normalize, parseFeed, locationMatches } from '../src/sources/jobs.ts';
import { decode, encode, type Row } from '../src/sources/validation.ts';
const requireJob = (source: Source, value: unknown) => {
  const job = normalize(source, value);
  assert.ok(job);
  return job;
};
const rss =
  '<rss><channel><item><title>Acme: TypeScript Engineer</title><link>https://weworkremotely.com/remote-jobs/acme-typescript</link><region>Europe</region><description><![CDATA[<p>Acme TypeScript &amp; SQL</p>]]></description><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>';
const samples = {
  jobicy: {
    id: 1,
    jobTitle: 'TypeScript Engineer',
    companyName: 'Acme',
    jobGeo: 'Europe',
    jobDescription: '<p>Acme TypeScript &amp; SQL</p>',
    url: 'https://jobicy.com/jobs/1-typescript',
    salaryMin: 60000,
    salaryMax: 80000,
    salaryCurrency: 'EUR',
    salaryPeriod: 'annual',
  },
  remoteok: {
    id: '1',
    position: 'TypeScript Engineer',
    company: 'Acme',
    location: 'Worldwide',
    description: 'Acme TypeScript',
    url: 'https://remoteok.com/remote-jobs/remote-typescript-1',
    salary_min: 0,
    salary_max: 0,
  },
  himalayas: {
    guid: 'h1',
    title: 'TypeScript Engineer',
    companyName: 'Acme',
    locationRestrictions: ['Spain'],
    timezoneRestrictions: [0, 1, 2],
    description: 'Acme TypeScript',
    applicationLink: 'https://himalayas.app/companies/acme/jobs/typescript?utm_source=api',
    minSalary: 40,
    maxSalary: 50,
    currency: 'USD',
    salaryPeriod: 'hourly',
  },
};
const requests: { url: URL; init?: RequestInit }[] = [];
const fake: typeof fetch = (input, init) => {
  const u = new URL(input instanceof Request ? input.url : input);
  requests.push({ url: u, init });
  if (u.hostname === 'weworkremotely.com') return Promise.resolve(new Response(rss));
  if (u.hostname === 'remoteok.com')
    return Promise.resolve(Response.json([{ legal: 'notice' }, samples.remoteok]));
  if (u.hostname === 'jobicy.com')
    return Promise.resolve(Response.json({ jobs: [samples.jobicy], nextCursor: null }));
  return Promise.resolve(Response.json({ jobs: [samples.himalayas] }));
};
const params = (args = {}) => new URLSearchParams({ q: 'typescript', limit: '10', ...args });
Deno.test(
  'all four public providers normalize jobs and preserve canonical links without account credentials or company names',
  async () => {
    const service = createExternalJobs(fake);
    for (const source of Object.keys({ ...samples, weworkremotely: {} }) as Source[]) {
      const result = await service.search(source, params());
      assert.equal(result.jobs.length, 1, JSON.stringify(result));
      const job = result.jobs[0];
      assert.equal(job.source, source);
      assert.equal(job.sourceUrl, job.applicationUrl);
      assert.ok(job.attribution.name);
      assert.equal(job.company, undefined);
      assert.ok(!JSON.stringify(job).includes('"company"'));
      const detail = await service.get(source, job.id);
      assert.ok(detail.description.includes('[company withheld]'));
      assert.ok(detail.description.includes('TypeScript'));
      assert.equal(detail.attribution.url, job.sourceUrl);
    }
    assert.ok(requests.every((r) => !new Headers(r.init?.headers).has('authorization')));
    const remote = requireJob('remoteok', samples.remoteok);
    assert.equal(remote.salary, '');
    assert.equal(remote.attribution.linkRel, 'follow');
    assert.match(requireJob('himalayas', samples.himalayas).salary, /hourly/);
    assert.deepEqual(requireJob('himalayas', samples.himalayas).timezoneRestrictions, [0, 1, 2]);
  },
);
Deno.test(
  'location eligibility is conservative, respects worldwide roles and covers region/country codes',
  () => {
    for (const [value, code, want] of [
      ['Worldwide', 'ES', true],
      ['Anywhere in the World', 'EUROPE', true],
      ['', 'ES', false],
      ['Spain', 'ES', true],
      ['Europe', 'ES', true],
      ['EMEA', 'ES', true],
      ['EU', 'GB', false],
      ['Latin America', 'MX', true],
      ['LATAM', 'US', false],
      ['APAC', 'AU', true],
      ['United States', 'EUROPE', false],
      ['Germany', 'EUROPE', true],
      ['Brazil', 'LATAM', true],
      ['Canada', 'AMERICAS', true],
      ['India', 'APAC', true],
      ['Middle East', 'EMEA', true],
      ['Europe', 'Worldwide', false],
      ['Remote', 'US', false],
      ['USA', 'US', true],
      ['', 'All', true],
    ] as [string, string, boolean][])
      assert.equal(locationMatches(value, code), want, value + ':' + code);
    assert.throws(() => locationMatches('Spain', 'MARS'));
  },
);
Deno.test(
  'RSS CDATA/entities are parsed without DTD support; provider URLs reject redirects to arbitrary hosts',
  () => {
    const row = parseFeed(rss)[0];
    assert.equal(row.title, 'TypeScript Engineer');
    assert.equal(row.company, 'Acme');
    assert.match(String(row.description), /TypeScript & SQL/);
    for (const xml of [
      '<html>blocked</html>',
      '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>',
    ])
      assert.throws(() => parseFeed(xml));
    for (const url of [
      'https://evil.test/jobs/1',
      'https://jobicy.com.evil.test/jobs/1',
      'https://user@jobicy.com/jobs/1',
      'http://jobicy.com/jobs/1',
      'https://jobicy.com/jobs/1?redirect=evil',
      'https://jobicy.com/admin',
    ])
      assert.throws(() => normalize('jobicy', { ...samples.jobicy, url }));
  },
);
Deno.test(
  'source failures, rate limits, invalid payloads and unsupported filters are explicit without discarding other sources',
  async () => {
    for (const response of [
      () => new Response('busy', { status: 429 }),
      () => new Response('bad', { status: 500 }),
      () => Response.json({ wrong: [] }),
      () => Response.json({ jobs: [{ ...samples.jobicy, url: 'https://evil.test/job' }] }),
      () => Promise.reject(Error('private upstream text')),
    ]) {
      const service = createExternalJobs(async () => response());
      const result = await service.search('jobicy', params());
      assert.ok(result.error);
      assert.deepEqual(result.jobs, []);
      assert.ok(!JSON.stringify(result).includes('private upstream text'));
    }
    const service = createExternalJobs(fake);
    assert.equal(
      (await service.search('jobicy', params({ category: 'Backend' }))).error?.code,
      'unsupported_filters',
    );
    assert.equal(
      (await service.search('remoteok', params({ page: '2' }))).error?.code,
      'unsupported_pagination',
    );
    await assert.rejects(() => service.search('jobicy', params({ remoteLocation: 'MARS' })), {
      status: 400,
    });
  },
);
Deno.test(
  'public feed cache coalesces calls, expires and never persists to a database',
  async () => {
    let count = 0,
      clock = 0;
    const service = createExternalJobs(
      async (...args) => {
        count++;
        return fake(...args);
      },
      () => clock,
    );
    await Promise.all([service.search('remoteok', params()), service.search('remoteok', params())]);
    assert.equal(count, 1);
    clock += 3600001;
    await service.search('remoteok', params());
    assert.equal(count, 2);
  },
);
Deno.test(
  'cursor pagination retains filters and does not lose the second half of a Himalayas page',
  async () => {
    const jobs = Array.from({ length: 20 }, (_, i) => ({
      ...samples.himalayas,
      guid: `h${i}`,
      applicationLink: `https://himalayas.app/companies/acme/jobs/typescript-${i}`,
    }));
    let calls = 0;
    const service = createExternalJobs((u) => {
      calls++;
      return Promise.resolve(
        Response.json({
          jobs:
            new URL(u instanceof Request ? u.url : u).searchParams.get('page') === '1' ? jobs : [],
        }),
      );
    });
    const first = await service.search('himalayas', params());
    assert.equal(first.jobs.length, 10);
    assert.ok(first.nextCursor);
    const second = await service.search(
      'himalayas',
      params({ cursors: JSON.stringify({ himalayas: first.nextCursor }) }),
    );
    assert.equal(second.jobs.length, 10);
    assert.equal(calls, 1);
    assert.notEqual(first.jobs[0].id, second.jobs[0].id);
    const end = await service.search(
      'himalayas',
      params({ cursors: JSON.stringify({ himalayas: second.nextCursor }) }),
    );
    assert.equal(end.jobs.length, 0);
    assert.equal(end.nextCursor, null);
    assert.equal(calls, 2);
    await assert.rejects(
      () =>
        service.search(
          'himalayas',
          params({ q: 'python', cursors: JSON.stringify({ himalayas: first.nextCursor }) }),
        ),
      { status: 400 },
    );
  },
);
Deno.test(
  'Jobicy forwards its native cursor; source references are rechecked and cannot cross providers',
  async () => {
    const seen: URL[] = [];
    const service = createExternalJobs((u) => {
      const url = new URL(u instanceof Request ? u.url : u);
      seen.push(url);
      return Promise.resolve(
        Response.json({
          jobs: [samples.jobicy],
          nextCursor: url.searchParams.has('cursor') ? null : 'native-cursor',
        }),
      );
    });
    const first = await service.search('jobicy', params());
    await service.search(
      'jobicy',
      params({ cursors: JSON.stringify({ jobicy: first.nextCursor }) }),
    );
    assert.equal(seen[1].searchParams.get('cursor'), 'native-cursor');
    await assert.rejects(() => service.get('remoteok', first.jobs[0].id), { status: 400 });
    await assert.rejects(() => service.get('jobicy', 'not-base64'), { status: 400 });
    const ref = decode(first.jobs[0].id);
    await assert.rejects(() => service.get('jobicy', encode({ ...ref, nativeId: 'missing' })), {
      status: 404,
    });
    await assert.rejects(
      () => service.get('jobicy', encode({ ...ref, url: 'https://evil.test/' })),
      {
        status: 400,
      },
    );
    await assert.rejects(
      () => service.get('jobicy', encode({ ...ref, continuation: { page: -1 } })),
      { status: 400 },
    );
  },
);
Deno.test(
  'oversized, empty, redirected and changed upstream responses fail safely with bounded retries',
  async () => {
    for (const fetcher of [
      () => Promise.resolve(new Response('x'.repeat(4 * 1024 * 1024 + 1))),
      () => Promise.resolve(new Response(null)),
      () => Promise.reject(Error('redirect blocked')),
    ]) {
      let calls = 0;
      const service = createExternalJobs(async () => {
        calls++;
        return fetcher();
      });
      const first = await service.search('remoteok', params());
      assert.equal(first.error?.code, 'source_unavailable');
      await service.search('remoteok', params());
      assert.equal(calls, 1, 'cooldown must prevent retry storms');
    }
    const absent = createExternalJobs(() => Promise.resolve(Response.json([])));
    assert.equal((await absent.search('remoteok', params())).jobs.length, 0);
    const reference = requireJob('jobicy', samples.jobicy).id;
    const forged = encode({
      ...decode(reference),
      query: 'typescript',
      limit: 10,
      continuation: {},
    });
    await assert.rejects(
      () =>
        createExternalJobs(() => Promise.resolve(Response.json({ jobs: [] }))).get(
          'jobicy',
          forged,
        ),
      { status: 404 },
    );
    await assert.rejects(
      () =>
        createExternalJobs(() => Promise.resolve(new Response('busy', { status: 500 }))).get(
          'jobicy',
          forged,
        ),
      { status: 503 },
    );
  },
);

Deno.test(
  'public normalization handles provider variations and rejects malformed listing identities',
  () => {
    const raw = (overrides: Row = {}) =>
      normalize('remoteok', { ...samples.remoteok, ...overrides });
    assert.equal(
      raw({ id: 2, date: 1792404000, salary_min: 60000, salary_max: 80000 })?.salary,
      'USD 60000–80000 annual',
    );
    assert.equal(raw({ salary: 'EUR 50000 annual' })?.salary, 'EUR 50000 annual');
    assert.equal(raw({ company: undefined, location: undefined })?.location, null);
    assert.equal(raw({ title: undefined, position: '' }), null);
    assert.throws(() => raw({ position: 'x'.repeat(501) }));
    assert.throws(() => raw({ id: 'x'.repeat(1001) }));
    assert.throws(() => raw({ url: 'https://remoteok.com/remote-jobs/' + 'x'.repeat(1000) }));
    const unrestricted = normalize('himalayas', {
      ...samples.himalayas,
      locationRestrictions: [],
      timezoneRestrictions: ['bad'],
      salaryPeriod: '',
      currency: '',
      minSalary: 40000,
      maxSalary: 40000,
    });
    assert.equal(unrestricted?.location, 'Worldwide');
    assert.deepEqual(unrestricted.timezoneRestrictions, []);
    assert.equal(
      normalize('himalayas', { ...samples.himalayas, timezoneRestrictions: null })?.salary,
      'USD 40–50 hourly',
    );
    const plain = parseFeed(
      '<rss><item><title>Engineer &#x26; SQL &#38; &#0;</title><link>https://weworkremotely.com/remote-jobs/engineer</link><description>Text &quot;quoted&quot; &apos;test&apos; &nbsp;</description><type>Full-time</type></item></rss>',
    )[0];
    assert.equal(plain.title, 'Engineer & SQL & ');
    assert.equal(plain.company, '');
    assert.equal(plain.employmentType, 'Full-time');
    assert.equal(normalize('weworkremotely', plain)?.location, null);
    for (const [value, code] of [
      ['LATAM', 'BR'],
      ['APAC', 'IN'],
      ['North America', 'CA'],
      ['Europe', 'PT'],
      ['Africa', 'EMEA'],
    ])
      assert.equal(locationMatches(value, code), true);
    assert.throws(() => locationMatches('Worldwide', ''), { code: 'invalid_remote_location' });
  },
);

Deno.test(
  'public privacy normalization strips contacts and identities in nested provider fields',
  async () => {
    const { anonymousJob } = await import('../src/sources/privacy.ts');
    const cleaned = anonymousJob({
      id: 'public-id',
      company: 'Example-Co, Inc.',
      company_name: '',
      companySlug: 'Example-Co',
      description:
        'Example Co Example-Co, Inc. &#x41; &#66; &#0; &#99999999; &amp; &nbsp; &quot; &apos; &lt;tag&gt; <script>secret</script><style>hidden</style> https://example.test/apply contact@example.test',
      requirements: ['Example-Co', { nested: 'Example Co', count: 2, empty: null }],
      skills: [false, 'TypeScript'],
      unknownSecret: 'omit',
    });
    assert.equal(cleaned.id, 'public-id');
    assert.equal(cleaned.unknownSecret, undefined);
    const output = JSON.stringify(cleaned);
    for (const forbidden of ['Example', 'contact@', 'https://', 'secret', 'hidden'])
      assert.ok(!output.includes(forbidden), forbidden);
    assert.match(String(cleaned.description), /A B/);
    assert.match(String(cleaned.description), /\[link withheld\]/);
    assert.match(String(cleaned.description), /\[email withheld\]/);
    assert.deepEqual(cleaned.skills, [false, 'TypeScript']);
  },
);

Deno.test(
  'source cursors and listing references validate bounds, filters and original sources before fetching',
  async () => {
    const { isExternal } = await import('../src/sources/index.ts');
    assert.equal(isExternal('remoteok'), true);
    assert.equal(isExternal('constructor'), false);
    let count = 0;
    const service = createExternalJobs((...args) => {
      count++;
      return fake(...args);
    });
    const key = JSON.stringify(['jobicy', 'typescript', 'All', 10]);
    for (const cursor of [
      7,
      'x'.repeat(2049),
      'bad',
      encode({ key: 'wrong', state: {} }),
      ...[
        null,
        [],
        false,
        'not-an-object',
        { page: '1' },
        { extra: 1 },
        { page: 0 },
        { page: 10001 },
        { page: 1.5 },
        { offset: -1 },
        { offset: 100001 },
        { offset: 'x' },
        { next: 3 },
        { next: 'x'.repeat(1025) },
      ].map((state) => encode({ key, state })),
    ]) {
      await assert.rejects(
        () => service.search('jobicy', params({ cursors: JSON.stringify({ jobicy: cursor }) })),
        { status: 400 },
      );
    }
    for (const limit of ['NaN', 'Infinity', '1.5']) {
      await assert.rejects(() => service.search('jobicy', params({ limit })), { status: 400 });
    }
    assert.equal(count, 0);
    const first = await service.search('jobicy', params());
    const reference = decode(first.jobs[0].id);
    for (const change of [
      { nativeId: '' },
      { nativeId: 3 },
      { query: 'x'.repeat(121) },
      { query: 3 },
      { limit: 0 },
      { limit: 51 },
      { limit: 1.2 },
    ])
      await assert.rejects(() => service.get('jobicy', encode({ ...reference, ...change })), {
        status: 400,
      });
    await assert.rejects(() => service.get('jobicy', 'x'.repeat(2001)), { status: 400 });
    const long = createExternalJobs(() =>
      Promise.resolve(
        Response.json([
          {
            ...samples.remoteok,
            id: 'x'.repeat(1000),
            url: 'https://remoteok.com/remote-jobs/' + 'y'.repeat(900),
          },
        ]),
      ),
    );
    assert.equal((await long.search('remoteok', params())).error?.code, 'source_unavailable');
    const mixed = createExternalJobs(() =>
      Promise.resolve(
        Response.json([samples.remoteok, { ...samples.remoteok, url: 'https://evil.test/job' }]),
      ),
    );
    assert.match((await mixed.search('remoteok', params())).warning ?? '', /malformed/);
    const fallback = await service.search(
      'jobicy',
      new URLSearchParams({ query: 'typescript', location: 'EUROPE' }),
    );
    assert.equal(fallback.jobs.length, 1);
  },
);

Deno.test(
  'bounded caches evict old query responses, reject invalid feed envelopes and cool down failures',
  async () => {
    let count = 0;
    const service = createExternalJobs((...args) => {
      count++;
      return fake(...args);
    });
    await service.search('jobicy', params({ q: 'first' }));
    for (let i = 0; i < 17; i++) await service.search('jobicy', params({ q: `query-${i}` }));
    await service.search('jobicy', params({ q: 'first' }));
    assert.equal(count, 19);
    assert.equal(
      (
        await createExternalJobs(() => Promise.resolve(Response.json({}))).search(
          'remoteok',
          params(),
        )
      ).error?.code,
      'source_unavailable',
    );
  },
);
