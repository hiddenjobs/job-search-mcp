import { anonymousJob } from './privacy.ts';
import { SOURCE_LIMITS, providers, type ExternalJob, type Source } from './schemas.ts';
import { record, text, strings, encode, sourceUrl, type Row } from './validation.ts';

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
  if (!/<rss\b/i.test(xml) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid RSS');
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
export function normalize(source: Source, value: unknown): ExternalJob | null {
  const row = record(value);
  const title = (text(row.jobTitle) || text(row.position) || text(row.title)).trim();
  const nativeId =
    (typeof row.id === 'number' && row.id ? String(row.id) : text(row.id)) ||
    text(row.guid) ||
    text(row.url);
  if (!title || !nativeId) return null; // Remote OK includes a non-job legal notice.
  if (title.length > SOURCE_LIMITS.titleLength || nativeId.length > SOURCE_LIMITS.nativeIdLength)
    throw new Error('Invalid provider job');
  const url = sourceUrl(source, text(row.url) || text(row.applicationLink));
  const restrictions = row.locationRestrictions;
  const validRestrictions =
    Array.isArray(restrictions) &&
    restrictions.every((item: unknown) => typeof item === 'string' && !!item.trim());
  const location =
    source === 'himalayas'
      ? validRestrictions
        ? strings(restrictions).join(', ') || 'Worldwide'
        : null
      : text(row.jobGeo) || text(row.location) || strings(restrictions).join(', ') || null;
  const publicFields = anonymousJob({
    id: nativeId,
    title,
    company: text(row.companyName) || text(row.company),
    description: (text(row.jobDescription) || text(row.description)).slice(
      0,
      SOURCE_LIMITS.descriptionLength,
    ),
    descriptionPreview: (text(row.jobExcerpt) || text(row.excerpt) || text(row.description)).slice(
      0,
      SOURCE_LIMITS.previewLength,
    ),
    location,
    category: strings(row.jobIndustry ?? row.categories).join(', ') || text(row.category),
    employmentType: strings(row.jobType).join(', ') || text(row.employmentType),
    createdAt: date(row.pubDate ?? row.date),
    salary: salary(row, source),
    hasApplicationLink: true,
  });
  return {
    ...publicFields,
    title: text(publicFields.title),
    description: text(publicFields.description),
    salary: text(publicFields.salary),
    location: typeof publicFields.location === 'string' ? publicFields.location : null,
    id: encode({ source, nativeId, query: title.slice(0, SOURCE_LIMITS.queryLength), url }),
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
const canonicalLocation = (value: string): string =>
  (countries[value.toUpperCase()]?.[0] ?? value).toLowerCase();
const knownLocations = new Set(
  [
    ...Object.values(countries).flatMap((names) => names ?? []),
    ...europe,
    'Americas',
    'North America',
    'South America',
    'Latin America',
    'LATAM',
    'APAC',
    'Asia Pacific',
    'Asia',
    'Oceania',
    'EMEA',
    'Middle East',
    'Africa',
  ].map(canonicalLocation),
);
function locationList(value: string): string[] | null {
  const names = value
    .trim()
    .replace(/^(?:anywhere (?:in|within) |(?:in|within|from) )(?:the )?/, '')
    .split(/[,;|/]|\s+(?:or|and)\s+/)
    .map((name) => canonicalLocation(name.trim()));
  return names.every((name) => knownLocations.has(name)) ? names : null;
}

export function locationMatches(value: unknown, code: string): boolean {
  if (!code || code === 'All') return true;

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
  if (!aliases && code !== 'Worldwide') throw new Error('Unsupported location');
  const location = text(value).toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = location.split(/\s+(?:except|excluding|but not|not including)\s+/);
  if (parts.length > 2) return false;
  const included = parts[0].replace(/^remote[\s:-]+/, '');
  const excluded = parts.length === 1 ? [] : locationList(parts[1]);
  if (!excluded) return false;
  const accepted = new Set((aliases ?? []).map(canonicalLocation));
  if (excluded.some((name) => accepted.has(name))) return false;
  const worldwide =
    /^(?:worldwide|global|anywhere|anywhere in (?:the )?world|work from anywhere)$/.test(included);
  if (code === 'Worldwide') return worldwide && excluded.length === 0;
  if (worldwide) return true;
  return locationList(included)?.some((name) => accepted.has(name)) ?? false;
}
