/** External job representation only; website records remain unchanged. */
export function anonymousJob(row: Record<string, unknown>): Record<string, unknown> {
  const identities = [row.company, row.company_name, row.companySlug, row.company_slug]
    .filter((v): v is string => typeof v === 'string' && !!v.trim())
    .flatMap((v) => [
      v.trim(),
      v.trim().replace(/[-_]+/g, ' '),
      v.trim().replace(/,?\s+(?:inc\.?|llc|ltd\.?|limited|gmbh|corporation|corp\.?)$/i, ''),
    ])
    .sort((a, b) => b.length - a.length);
  const names = [...new Set(identities)].map((identity) =>
    identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'),
  );
  const employer = names.length
    ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
    : null;
  const entities: Record<string, string> = {
    amp: '&',
    nbsp: ' ',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
  };
  const clean = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const text = value
        .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_match, code: string) => {
          const n = code.toLowerCase().startsWith('x') ? parseInt(code.slice(1), 16) : Number(code);
          return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
        })
        .replace(
          /&(amp|nbsp|quot|apos|lt|gt);/gi,
          (_match, entity: string) => entities[entity.toLowerCase()],
        )
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/https?:\/\/[^\s<>"')]+/gi, '[link withheld]')
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email withheld]');
      return employer ? text.replace(employer, '[company withheld]') : text;
    }
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
    }
    return value;
  };
  // Explicit allowlist also protects historical snapshots with extra source fields.
  const fields = [
    'id',
    'title',
    'description',
    'descriptionPreview',
    'salary',
    'location',
    'category',
    'employmentType',
    'contract',
    'jobType',
    'createdAt',
    'updatedAt',
    'validThrough',
    'experienceLevel',
    'skills',
    'remoteScope',
    'remoteLocationCodes',
    'remoteLocationLabel',
    'hasApplicationLink',
    'about',
    'requirements',
    'responsibilities',
    'benefits',
    'department',
    'team',
    'posted_at',
  ];
  return Object.fromEntries(
    fields
      .filter((k) => Object.hasOwn(row, k))
      .map((k) => [k, k === 'id' ? row[k] : clean(row[k])]),
  );
}
