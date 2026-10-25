import { assert } from './helpers.ts';
import { createExternalJobs } from '../src/sources/index.ts';
import { locationMatches, normalize } from '../src/sources/jobs.ts';
import { anonymousJob } from '../src/sources/privacy.ts';

Deno.test('qualified global labels never override a country restriction or exclusion', () => {
  for (const [location, country, expected] of [
    ['Anywhere in the US', 'ES', false],
    ['Anywhere in the US', 'US', true],
    ['Anywhere within Canada', 'ES', false],
    ['Worldwide except Spain', 'ES', false],
    ['Worldwide except Spain', 'US', true],
    ['Worldwide except Spain', 'Worldwide', false],
    ['Europe excluding Spain', 'ES', false],
    ['Europe excluding Spain', 'FR', true],
    ['Worldwide excluding an unspecified region', 'US', false],
    ['Worldwide, US only', 'ES', false],
    ['Not Spain', 'ES', false],
    ['United States or Canada', 'ES', false],
    ['United States or Canada', 'CA', true],
    ['Worldwide', 'ES', true],
    ['Anywhere in the World', 'ES', true],
  ] as const)
    assert.equal(locationMatches(location, country), expected, `${location}: ${country}`);
  assert.throws(() => locationMatches('Worldwide', 'MARS'));
});

const himalayas = {
  guid: 'remote-role',
  title: 'Golang Engineer',
  companyName: 'Example',
  description: 'Golang and Django',
  applicationLink: 'https://himalayas.app/companies/example/jobs/engineer',
};
Deno.test(
  'only a valid empty restriction array means unrestricted Himalayas coverage',
  async () => {
    for (const restrictions of ['Spain', null, undefined, {}, ['Spain', null], [''], [42]]) {
      const job = normalize('himalayas', { ...himalayas, locationRestrictions: restrictions });
      assert.ok(job);
      assert.equal(job.location, null);
      const service = createExternalJobs(() =>
        Promise.resolve(
          Response.json({ jobs: [{ ...himalayas, locationRestrictions: restrictions }] }),
        ),
      );
      for (const remoteLocation of ['ES', 'US', 'Worldwide']) {
        const result = await service.search('himalayas', new URLSearchParams({ remoteLocation }));
        assert.equal(result.jobs.length, 0);
        assert.equal(result.error, undefined);
      }
    }
    assert.equal(
      normalize('himalayas', { ...himalayas, locationRestrictions: [] })?.location,
      'Worldwide',
    );
    assert.equal(
      normalize('himalayas', { ...himalayas, locationRestrictions: ['Spain'] })?.location,
      'Spain',
    );
  },
);

Deno.test(
  'employer redaction matches complete Unicode tokens without corrupting technologies',
  () => {
    const job = anonymousJob({
      company: 'Go',
      title: 'Golang Engineer',
      description: 'Django and Golang at Go. Go is hiring.',
      skills: ['Golang', 'Django', 'MongoDB', 'GoLand'],
    });
    assert.equal(job.title, 'Golang Engineer');
    assert.equal(
      job.description,
      'Django and Golang at [company withheld]. [company withheld] is hiring.',
    );
    assert.deepEqual(job.skills, ['Golang', 'Django', 'MongoDB', 'GoLand']);
    const accented = anonymousJob({ company: 'Go', title: 'éGo Engineer', description: 'Go!' });
    assert.equal(accented.title, 'éGo Engineer');
    assert.equal(accented.description, '[company withheld]!');
  },
);

Deno.test('technology queries still find redacted external offers', async () => {
  const service = createExternalJobs(() =>
    Promise.resolve(
      Response.json([
        {
          id: 1,
          position: 'Golang Engineer',
          company: 'Go',
          location: 'Anywhere in the US',
          description: 'Django and Golang at Go',
          url: 'https://remoteok.com/remote-jobs/golang-1',
        },
      ]),
    ),
  );
  for (const query of ['golang', 'django']) {
    const matches = await service.search(
      'remoteok',
      new URLSearchParams({ q: query, remoteLocation: 'US' }),
    );
    assert.equal(matches.jobs.length, 1);
    assert.equal(matches.jobs[0].title, 'Golang Engineer');
    assert.equal(
      (await service.search('remoteok', new URLSearchParams({ q: query, remoteLocation: 'ES' })))
        .jobs.length,
      0,
    );
  }
});
