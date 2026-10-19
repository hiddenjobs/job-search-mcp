import { checkCoverage } from '../scripts/check-coverage.ts';
import { assert } from './helpers.ts';

const report = (file: string, lines = 100, branches = 100, functions = 100) =>
  `SF:${file}\nLF:100\nLH:${lines}\nBRF:100\nBRH:${branches}\nFNF:100\nFNH:${functions}\nend_of_record\n`;

Deno.test('coverage gate accepts threshold boundaries and reports aggregate coverage', () => {
  assert.equal(
    checkCoverage(report('src/a.ts', 95, 90, 95), ['src/a.ts']),
    'lines: 95.00%, branches: 90.00%, functions: 95.00%',
  );
  assert.equal(
    checkCoverage(report('src/a.ts') + report('src/b.ts'), ['src/a.ts', 'src/b.ts']),
    'lines: 100.00%, branches: 100.00%, functions: 100.00%',
  );
});

Deno.test('coverage gate rejects regressions per file even when aggregate coverage passes', () => {
  for (const [lines, branches, functions, metric] of [
    [94, 100, 100, 'lines'],
    [100, 89, 100, 'branches'],
    [100, 100, 94, 'functions'],
  ] as const) {
    assert.throws(
      () =>
        checkCoverage(report('src/a.ts') + report('src/b.ts', lines, branches, functions), [
          'src/a.ts',
          'src/b.ts',
        ]),
      new RegExp(`src/b.ts: ${metric}`),
    );
  }
});

Deno.test('coverage gate fails closed on missing files and empty or invalid reports', () => {
  assert.throws(() => checkCoverage('', ['src/a.ts']), /Missing coverage/);
  assert.throws(
    () => checkCoverage(report('src/a.ts'), ['src/a.ts', 'src/untested.ts']),
    /Missing coverage/,
  );
  assert.throws(() => checkCoverage('', []), /No source files/);
  assert.throws(
    () => checkCoverage(report('src/a.ts').replace('LH:100', 'LH:101'), ['src/a.ts']),
    /Invalid lines/,
  );
  assert.throws(
    () => checkCoverage(report('src/a.ts').replace('BRH:100\n', ''), ['src/a.ts']),
    /Invalid branches/,
  );
  assert.throws(
    () => checkCoverage(report('src/a.ts') + report('src/a.ts'), ['src/a.ts']),
    /Duplicate coverage/,
  );
  assert.throws(
    () => checkCoverage(report('src/a.ts').replaceAll(':100', ':0'), ['src/a.ts']),
    /no executable lines/,
  );
});
