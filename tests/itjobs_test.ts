import { assert } from './helpers.ts';
import { createExternalJobs } from '../src/sources/index.ts';
import { parseFeed, normalize } from '../src/sources/jobs.ts';
import { decode } from '../src/sources/validation.ts';
const params = (args: Record<string, string> = {}) =>
  new URLSearchParams({ sources: 'itjobs', ...args });
const item = ({
  id = 1,
  model = 'Remoto',
  location = 'Lisboa',
  salary = 'n/d',
  title = 'Platform: TypeScript &amp; SQL',
  url = `https://www.itjobs.pt/oferta/${id}/typescript`,
  company = 'Example Consulting',
  type = 'Full-time',
}: {
  id?: number;
  model?: string;
  location?: string;
  salary?: string;
  title?: string;
  url?: string;
  company?: string;
  type?: string;
} = {}) =>
  `<item><title><![CDATA[${title}]]></title><guid isPermaLink="false">job-${id}</guid><link>${url}</link><pubDate>Fri, 23 Oct 2026 12:29:18 +0000</pubDate><description><![CDATA[Função: ${title}<br />Empresa: ${company}<br />Tipo: ${type}<br />Contrato: Contrato sem termo<br />Localidade: ${location}<br />Modelo de trabalho: ${model}<br />Salário anual: ${salary}]]></description></item>`;
const feed = (...items: string[]) =>
  `<rss version="2.0"><channel>${items.join('')}</channel></rss>`;

Deno.test(
  'ITjobs parses remote-only Portuguese metadata without assuming worldwide eligibility or using its logo',
  async () => {
    const xml = feed(
      item({ salary: '€28&#160;000 - €35&#160;000' }),
      item({ id: 2, model: 'Híbrido' }),
      item({ id: 3, model: 'Presencial' }),
      item({ id: 4, model: 'n/d' }),
    );
    const service = createExternalJobs(() => Promise.resolve(new Response(xml)));
    const result = await service.search('itjobs', params({ remoteLocation: 'PT' }));
    assert.equal(result.jobs.length, 1);
    const job = result.jobs[0];
    assert.equal(job.source, 'itjobs');
    assert.equal(job.sourceName, 'ITjobs');
    assert.equal(job.title, 'Platform: TypeScript & SQL');
    assert.equal(job.location, 'Lisboa, Portugal');
    assert.equal(job.workModel, 'Remote');
    assert.equal(job.employmentType, 'Full-time');
    assert.equal(job.contract, 'Contrato sem termo');
    assert.equal(job.descriptionKind, 'summary');
    assert.match(job.salary, /28\s000.*35\s000 EUR gross annual/);
    assert.equal(job.createdAt, '2026-10-23T12:29:18.000Z');
    assert.deepEqual(job.attribution, {
      name: 'ITjobs',
      url: 'https://www.itjobs.pt/oferta/1/typescript',
      logoAllowed: false,
    });
    assert.equal(job.company, undefined);
    assert.equal(decode(job.id).nativeId, 'job-1');
    assert.match(result.coverage ?? '', /100.*summary metadata/);
    const detail = await service.get('itjobs', job.id);
    assert.equal(detail.applicationUrl, job.attribution.url);
    assert.match(detail.description, /Example|company withheld/);
    assert.ok(!detail.description.includes('Example Consulting'));
    for (const remoteLocation of ['ES', 'US', 'Worldwide']) {
      const otherCountry = await service.search('itjobs', params({ remoteLocation }));
      assert.deepEqual(otherCountry.jobs, []);
      assert.equal(otherCountry.error, undefined);
    }
    const unspecified = createExternalJobs(() =>
      Promise.resolve(new Response(feed(item({ location: 'n/d', type: 'n/d' })))),
    );
    const unknown = (await unspecified.search('itjobs', params())).jobs[0];
    assert.equal(unknown.location, 'Portugal');
    assert.equal(unknown.salary, '');
    assert.equal(unknown.employmentType, '');
  },
);

Deno.test(
  'hybrid-only, unknown-model and empty ITjobs feeds return an honest empty result',
  async () => {
    for (const xml of [feed(item({ model: 'Híbrido' })), feed(item({ model: '' })), feed()]) {
      const result = await createExternalJobs(() => Promise.resolve(new Response(xml))).search(
        'itjobs',
        params(),
      );
      assert.equal(result.error, undefined);
      assert.deepEqual(result.jobs, []);
      assert.equal(result.nextCursor, null);
    }
  },
);

Deno.test(
  'ITjobs deduplicates stable GUIDs and links, filters locally, and paginates the shared remote feed',
  async () => {
    let count = 0;
    const xml = feed(
      ...Array.from({ length: 12 }, (_, id) => item({ id })),
      item({ id: 0 }),
      item({ id: 30, url: 'https://www.itjobs.pt/oferta/1/typescript' }),
      item({ id: 40, model: 'Híbrido' }),
    );
    const service = createExternalJobs((url, init) => {
      count++;
      assert.equal(
        String(url instanceof Request ? url.url : url),
        'https://feeds.itjobs.pt/feed/emprego?remote=1&limit=100',
      );
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init.headers).has('authorization'), false);
      return Promise.resolve(new Response(xml));
    });
    const first = await service.search('itjobs', params({ q: 'typescript sql', limit: '10' }));
    assert.equal(first.jobs.length, 10);
    assert.ok(first.nextCursor);
    const second = await service.search(
      'itjobs',
      params({
        q: 'typescript sql',
        limit: '10',
        cursors: JSON.stringify({ itjobs: first.nextCursor }),
      }),
    );
    assert.equal(second.jobs.length, 2);
    assert.equal(second.nextCursor, null);
    assert.equal(
      new Set([...first.jobs, ...second.jobs].map((j) => decode(j.id).nativeId)).size,
      12,
    );
    assert.equal((await service.search('itjobs', params({ q: 'python' }))).jobs.length, 0);
    assert.equal(count, 1);
    const changedFilters: Record<string, string>[] = [
      { q: 'python', limit: '10' },
      { q: 'typescript sql', limit: '5' },
      { q: 'typescript sql', limit: '10', remoteLocation: 'PT' },
    ];
    for (const args of changedFilters) {
      await assert.rejects(
        () =>
          service.search(
            'itjobs',
            params({
              ...args,
              cursors: JSON.stringify({ itjobs: first.nextCursor }),
            }),
          ),
        { status: 400 },
      );
    }
  },
);

Deno.test(
  'ITjobs hourly cache covers different queries, detail reads, concurrency and upstream failures',
  async () => {
    for (const fail of [false, true]) {
      let count = 0,
        clock = 0;
      const service = createExternalJobs(
        () => {
          count++;
          return Promise.resolve(
            fail ? new Response('limited', { status: 429 }) : new Response(feed(item())),
          );
        },
        () => clock,
      );
      const [result] = await Promise.all([
        service.search('itjobs', params()),
        service.search('itjobs', params({ q: 'sql' })),
      ]);
      assert.equal(count, 1);
      if (!fail) await service.get('itjobs', result.jobs[0].id);
      else assert.equal(result.error?.code, 'source_rate_limit');
      clock = 60001;
      await service.search('itjobs', params({ q: 'python' }));
      assert.equal(count, 1);
      clock = 3599999;
      await service.search('itjobs', params());
      assert.equal(count, 1);
      clock = 3600000;
      await service.search('itjobs', params());
      assert.equal(count, 2);
    }
  },
);

Deno.test(
  'other provider query cache pressure cannot evict ITjobs during its hourly interval',
  async () => {
    let count = 0;
    const service = createExternalJobs((url) => {
      if (new URL(url instanceof Request ? url.url : url).hostname === 'feeds.itjobs.pt') {
        count++;
        return Promise.resolve(new Response(feed(item())));
      }
      return Promise.resolve(Response.json({ jobs: [] }));
    });
    await service.search('itjobs', params());
    for (let i = 0; i < 25; i++) await service.search('jobicy', params({ q: `different-${i}` }));
    await service.search('itjobs', params());
    assert.equal(count, 1);
  },
);

Deno.test(
  'ITjobs rejects forged destinations, unsafe XML and upstream failures; missing feed entries are not declared closed',
  async () => {
    for (const url of [
      'https://evil.test/oferta/1/job',
      'https://www.itjobs.pt.evil.test/oferta/1/job',
      'https://www.itjobs.pt/oferta/1/job?redirect=evil',
      'https://www.itjobs.pt/admin',
      'http://www.itjobs.pt/oferta/1/job',
    ]) {
      const result = await createExternalJobs(() =>
        Promise.resolve(new Response(feed(item({ url })))),
      ).search('itjobs', params());
      assert.equal(result.error?.code, 'source_unavailable');
    }
    assert.throws(() => parseFeed('<!DOCTYPE rss><rss/>', 'itjobs'));
    assert.equal(
      normalize('itjobs', parseFeed(feed(item({ model: 'Híbrido' })), 'itjobs')[0]),
      null,
    );
    let clock = 0,
      xml = feed(item());
    const service = createExternalJobs(
      () => Promise.resolve(new Response(xml)),
      () => clock,
    );
    const result = await service.search('itjobs', params());
    xml = feed(item({ model: 'Híbrido' }));
    clock = 3600000;
    await assert.rejects(() => service.get('itjobs', result.jobs[0].id), {
      code: 'not_found',
    });
    for (const xml of ['<html>blocked</html>', '<!DOCTYPE rss><rss/>']) {
      const result = await createExternalJobs(() => Promise.resolve(new Response(xml))).search(
        'itjobs',
        params(),
      );
      assert.equal(result.error?.code, 'source_unavailable');
    }
  },
);

Deno.test(
  'malformed remote ITjobs entries produce source errors or partial-result warnings',
  async () => {
    const invalid = [
      item({ title: '' }),
      item({ title: '   ' }),
      item()
        .replace(/<guid[^>]*>.*?<\/guid>/, '')
        .replace(/<link>.*?<\/link>/, ''),
    ];
    for (const malformed of invalid) {
      const unavailable = await createExternalJobs(() =>
        Promise.resolve(new Response(feed(malformed))),
      ).search('itjobs', params());
      assert.equal(unavailable.error?.code, 'source_unavailable');
      assert.deepEqual(unavailable.jobs, []);

      const partial = await createExternalJobs(() =>
        Promise.resolve(new Response(feed(malformed, item({ id: 2 })))),
      ).search('itjobs', params());
      assert.equal(partial.error, undefined);
      assert.equal(partial.jobs.length, 1);
      assert.equal(partial.warning, 'Some malformed provider entries were omitted.');
    }
    const excluded = await createExternalJobs(() =>
      Promise.resolve(new Response(feed(item({ title: '', model: 'Híbrido' })))),
    ).search('itjobs', params());
    assert.deepEqual(excluded.jobs, []);
    assert.equal(excluded.error, undefined);
    assert.equal(excluded.warning, undefined);
  },
);
