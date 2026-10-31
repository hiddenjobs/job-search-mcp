import { assert } from './helpers.ts';
import { createExternalJobs } from '../src/sources/index.ts';
import { encode } from '../src/sources/validation.ts';
import { CareerError } from '../src/errors.ts';

const guid = 'https://himalayas.app/companies/acme/jobs/risk-consultant';
const row = {
  guid,
  title: 'Risk consultant',
  companyName: 'Acme',
  description: 'Acme risk consultant role',
  applicationLink: guid + '?utm_source=api',
  locationRestrictions: ['United States'],
};
const reference = (overrides = {}) =>
  encode({
    source: 'himalayas',
    nativeId: guid,
    url: guid,
    query: 'third party risk',
    limit: 15,
    continuation: { page: 8, offset: 0 },
    ...overrides,
  });
const fails = (status: number) => (error: unknown) =>
  error instanceof CareerError && error.status === status;

Deno.test(
  'Himalayas detail survives changed tracking URLs and movement between search pages',
  async () => {
    let requests = 0;
    let clock = 0;
    const service = createExternalJobs(
      async (input, init) => {
        requests++;
        assert.equal(
          input instanceof Request ? input.url : input.toString(),
          guid.replace('/companies/', '/jobs/api/companies/'),
        );
        assert.equal(init?.redirect, 'error');
        assert.ok(init.signal);
        assert.ok(!new Headers(init.headers).has('authorization'));
        return Promise.resolve(Response.json({ job: row }));
      },
      () => clock,
    );
    const [first, second] = await Promise.all([
      service.get('himalayas', reference()),
      service.get('himalayas', reference()),
    ]);
    assert.equal(first.applicationUrl, row.applicationLink);
    assert.equal(second.id, reference());
    assert.ok(!first.description.includes('Acme'));
    assert.equal(requests, 1);
    clock = 600001;
    await service.get('himalayas', reference({ url: guid + '?utm_source=old' }));
    assert.equal(requests, 2);
  },
);

Deno.test('Himalayas distinguishes missing or closed offers from provider failures', async () => {
  for (const status of [404, 410, 429, 500]) {
    const service = createExternalJobs(() => Promise.resolve(new Response(null, { status })));
    await assert.rejects(
      () => service.get('himalayas', reference()),
      fails(status < 429 ? status : 503),
    );
  }
  const unavailable = [
    {},
    { job: null },
    { job: { ...row, guid: guid + '-other' } },
    { job: { ...row, title: '' } },
    { job: { ...row, applicationLink: 'https://evil.example/job' } },
  ];
  for (const body of unavailable) {
    const service = createExternalJobs(() => Promise.resolve(Response.json(body)));
    await assert.rejects(() => service.get('himalayas', reference()), fails(503));
  }
  const service = createExternalJobs(() => Promise.reject(new Error('Network failure')));
  await assert.rejects(() => service.get('himalayas', reference()), fails(503));
});

Deno.test('Himalayas rejects forged identities before making a request', async () => {
  const service = createExternalJobs(() => {
    throw new Error('Must not fetch');
  });
  for (const nativeId of [
    'h1',
    'https://evil.example/job',
    guid + '-different',
    guid + '#fragment',
  ]) {
    await assert.rejects(() => service.get('himalayas', reference({ nativeId })), fails(400));
  }
});
