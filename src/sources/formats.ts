import { anonymousJob } from './privacy.ts';

export const providers = {
  jobicy: { name: 'Jobicy', origin: 'https://jobicy.com', path: /^\/jobs\/[^/]+$/ },
  weworkremotely: {
    name: 'We Work Remotely',
    origin: 'https://weworkremotely.com',
    path: /^\/remote-jobs\/[^/]+$/,
  },
  remoteok: { name: 'Remote OK', origin: 'https://remoteok.com', path: /^\/remote-jobs\/[^/]+$/ },
  himalayas: {
    name: 'Himalayas',
    origin: 'https://himalayas.app',
    path: /^\/companies\/[^/]+\/jobs\/[^/]+$/,
  },
};
export type Source = keyof typeof providers;
export type Row = Record<string, unknown>;
export const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
export const text = (value: unknown): string => (typeof value === 'string' ? value : '');
export const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
export const encode = (value: unknown): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export const decode = (value: string): Row =>
  record(
    JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (ch) =>
          ch.charCodeAt(0),
        ),
      ),
    ),
  );

/** Only canonical provider pages can become references or application destinations. */
export function sourceUrl(source: Source, value: unknown): string {
  if (text(value).length > 1000) throw Error('Invalid provider URL');
  const url = new URL(text(value));
  if (
    url.origin !== providers[source].origin ||
    url.username ||
    url.password ||
    [...url.searchParams].some(
      ([key, value]) =>
        !['utm_source', 'utm_medium', 'utm_campaign'].includes(key) || value.length > 200,
    ) ||
    url.hash ||
    !providers[source].path.test(url.pathname)
  )
    throw Error('Invalid provider URL');
  return url.href;
}
const entity = (value: string) =>
  value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, (match) => {
    const named: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&apos;': "'",
      '&nbsp;': ' ',
    };
    if (Object.hasOwn(named, match.toLowerCase())) return named[match.toLowerCase()];
    const n = match.toLowerCase().startsWith('&#x')
      ? parseInt(match.slice(3, -1), 16)
      : Number(match.slice(2, -1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
export function parseFeed(xml: string): Row[] {
  if (!/<rss\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('Invalid RSS');
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([, item]) => {
    const field = (name: string) => {
      const value =
        new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i').exec(
          item,
        )?.[1] ?? '';
      return entity(value.trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1'));
    };
    const title = field('title');
    const separator = title.indexOf(':');
    return {
      id: field('link'),
      url: field('link'),
      title: separator > 0 ? title.slice(separator + 1).trim() : title,
      company: separator > 0 ? title.slice(0, separator) : '',
      description: field('description'),
      location: field('region'),
      category: field('category'),
      date: field('pubDate'),
      employmentType: field('type'),
    };
  });
}
function date(value: unknown): string {
  const timestamp = typeof value === 'number' ? value * 1000 : text(value);
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}
function salary(row: Row, source: Source): string {
  if (typeof row.salary === 'string') return row.salary;
  const low = Number(
    source === 'jobicy' ? row.salaryMin : source === 'remoteok' ? row.salary_min : row.minSalary,
  );
  const high = Number(
    source === 'jobicy' ? row.salaryMax : source === 'remoteok' ? row.salary_max : row.maxSalary,
  );
  const numbers = [low, high].filter((value) => Number.isFinite(value) && value > 0);
  if (!numbers.length) return '';
  const period = text(row.salaryPeriod) || (source === 'remoteok' ? 'annual' : '');
  return [
    text(row.currency) || text(row.salaryCurrency) || (source === 'remoteok' ? 'USD' : ''),
    [...new Set(numbers)].join('–'),
    period,
  ]
    .filter(Boolean)
    .join(' ');
}
export function normalize(source: Source, value: unknown): Row | null {
  const row = record(value);
  const title = (text(row.jobTitle) || text(row.position) || text(row.title)).trim();
  const nativeId =
    (typeof row.id === 'number' && row.id ? String(row.id) : text(row.id)) ||
    text(row.guid) ||
    text(row.url);
  if (!title || !nativeId) return null; // Remote OK includes a non-job legal notice.
  if (title.length > 500 || nativeId.length > 1000) throw Error('Invalid provider job');
  const url = sourceUrl(source, text(row.url) || text(row.applicationLink));
  const locations = strings(row.locationRestrictions);
  const location = text(row.jobGeo) || text(row.location) || locations.join(', ');
  const publicFields = anonymousJob({
    id: nativeId,
    title,
    company: text(row.companyName) || text(row.company),
    description: (text(row.jobDescription) || text(row.description)).slice(0, 60000),
    descriptionPreview: (text(row.jobExcerpt) || text(row.excerpt) || text(row.description)).slice(
      0,
      600,
    ),
    location: location || (source === 'himalayas' ? 'Worldwide' : null),
    category: strings(row.jobIndustry ?? row.categories).join(', ') || text(row.category),
    employmentType: strings(row.jobType).join(', ') || text(row.employmentType),
    createdAt: date(row.pubDate ?? row.date),
    salary: salary(row, source),
    hasApplicationLink: true,
  });
  return {
    ...publicFields,
    id: encode({ source, nativeId, query: title.slice(0, 120), url }),
    source,
    sourceName: providers[source].name,
    sourceUrl: url,
    applicationUrl: url,
    attribution: {
      name: providers[source].name,
      url,
      ...(source === 'remoteok' ? { linkRel: 'follow', logoAllowed: false } : {}),
    },
    ...(source === 'himalayas'
      ? {
          timezoneRestrictions: Array.isArray(row.timezoneRestrictions)
            ? row.timezoneRestrictions.filter((item) => typeof item === 'number')
            : [],
        }
      : {}),
  };
}
const countries: Partial<Record<string, string[]>> = {
  US: ['United States', 'USA'],
  CA: ['Canada'],
  GB: ['United Kingdom', 'UK'],
  ES: ['Spain'],
  DE: ['Germany'],
  FR: ['France'],
  PL: ['Poland'],
  RO: ['Romania'],
  NL: ['Netherlands'],
  IE: ['Ireland'],
  PT: ['Portugal'],
  CH: ['Switzerland'],
  BR: ['Brazil'],
  MX: ['Mexico'],
  CO: ['Colombia'],
  AR: ['Argentina'],
  AU: ['Australia'],
  IN: ['India'],
};
const europe = [
  'Europe',
  'EU',
  'EEA',
  ...['GB', 'ES', 'DE', 'FR', 'PL', 'RO', 'NL', 'IE', 'PT', 'CH'].flatMap(
    (key) => countries[key] ?? [],
  ),
  'Albania',
  'Andorra',
  'Austria',
  'Belgium',
  'Bosnia and Herzegovina',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czechia',
  'Denmark',
  'Estonia',
  'Finland',
  'Greece',
  'Hungary',
  'Iceland',
  'Italy',
  'Latvia',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Moldova',
  'Monaco',
  'Montenegro',
  'North Macedonia',
  'Norway',
  'San Marino',
  'Serbia',
  'Slovakia',
  'Slovenia',
  'Sweden',
  'Ukraine',
];
export function locationMatches(value: unknown, code: string): boolean {
  if (!code || code === 'All') return true;
  const location = text(value).toLowerCase();
  if (/\b(worldwide|anywhere|global)\b/.test(location)) return true;
  if (code === 'Worldwide') return false;
  const country = countries[code];
  const regional = ['US', 'CA', 'MX'].includes(code)
    ? ['Americas', 'North America']
    : ['BR', 'CO', 'AR'].includes(code)
      ? ['Americas', 'Latin America', 'LATAM']
      : code === 'AU'
        ? ['APAC', 'Asia Pacific', 'Oceania']
        : code === 'IN'
          ? ['APAC', 'Asia Pacific', 'Asia']
          : country
            ? ['Europe', 'EMEA', ...(['GB', 'CH'].includes(code) ? [] : ['EU', 'EEA'])]
            : [];
  if (code === 'MX') regional.push('Latin America', 'LATAM');
  const aliases =
    (country ? [...country, ...regional] : undefined) ??
    (
      {
        EUROPE: europe,
        LATAM: [
          'LATAM',
          'Latin America',
          ...['BR', 'MX', 'CO', 'AR'].flatMap((key) => countries[key] ?? []),
        ],
        AMERICAS: [
          'Americas',
          'North America',
          'South America',
          'Latin America',
          ...['US', 'CA', 'BR', 'MX', 'CO', 'AR'].flatMap((key) => countries[key] ?? []),
        ],
        APAC: ['APAC', 'Asia Pacific', 'Asia', 'Australia', 'India'],
        EMEA: ['EMEA', ...europe, 'Middle East', 'Africa'],
      } as Partial<Record<string, string[]>>
    )[code];
  if (!aliases) throw Error('Unsupported location');
  return aliases.some((name) =>
    new RegExp('(^|[^a-z])' + name.toLowerCase() + '([^a-z]|$)').test(location),
  );
}
