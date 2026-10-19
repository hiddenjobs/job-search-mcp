import { validateCareerArguments as validate } from '../src/tools/validation.ts';
import { assert, UUID } from './helpers.ts';

Deno.test('tool validation enforces types, bounds, enums, patterns and UUIDs', () => {
  const cases: [Parameters<typeof validate>[0], unknown[], unknown[]][] = [
    [
      {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } },
        additionalProperties: false,
      },
      [{ name: 'CV' }],
      [null, [], 'CV', {}, { name: 3 }, { name: 'CV', extra: true }],
    ],
    [{ type: 'object' }, [{ arbitrary: true }], [false]],
    [{ type: 'string', minLength: 2, maxLength: 3 }, ['ab', 'abc'], ['', 'a', 'abcd', 12]],
    [{ type: 'string' }, ['CV'], ['', 'x'.repeat(12001)]],
    [{ type: 'integer', minimum: 1, maximum: 50 }, [1, 50], [0, 51, 1.5, '1', NaN, Infinity]],
    [{ type: 'integer' }, [-1, 0, 1], [Number.MAX_SAFE_INTEGER + 1]],
    [
      {
        type: 'array',
        items: { type: 'string', enum: ['All', 'EUROPE'] },
        minItems: 1,
        maxItems: 2,
      },
      [['All'], ['EUROPE', 'All']],
      [[], ['All', 'All', 'All'], 'All', [1]],
    ],
    [{ type: 'array' }, [[], [1, 2]], [null]],
    [{ type: 'boolean' }, [true, false], [0, 'true']],
    [{ enum: ['applied', 'saved'] }, ['applied', 'saved'], ['unknown', null]],
    [{ pattern: '^[a-z]+$' }, ['cv'], ['CV', 2]],
    [{ format: 'uuid' }, [UUID, UUID.toUpperCase()], ['invalid', 1]],
  ];
  for (const [schema, accepted, rejected] of cases) {
    for (const value of accepted) {
      assert.equal(validate(schema, value), true, JSON.stringify({ schema, value }));
    }
    for (const value of rejected) {
      assert.equal(validate(schema, value), false, JSON.stringify({ schema, value }));
    }
  }
});

Deno.test('tool validation accepts only declared own properties and requires own values', () => {
  const schema = {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: false,
  };
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal(validate(schema, JSON.parse(`{"name":"CV","${key}":"unexpected"}`)), false, key);
  }
  const inherited: unknown = Object.create({ name: 'CV' });
  assert.equal(validate(schema, inherited), false);
  assert.equal(
    validate(
      { type: 'object', properties: {}, additionalProperties: true },
      JSON.parse('{"constructor":"a user field"}'),
    ),
    true,
  );
});
