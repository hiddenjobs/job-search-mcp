import { CareerError } from '../errors.ts';
import { SOURCE_LIMITS, providers, type Source, type SourceContinuation } from './schemas.ts';

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
  if (text(value).length > SOURCE_LIMITS.urlLength) throw new Error('Invalid provider URL');
  const url = new URL(text(value));
  if (
    url.origin !== providers[source].origin ||
    url.username ||
    url.password ||
    [...url.searchParams].some(
      ([key, value]) =>
        !['utm_source', 'utm_medium', 'utm_campaign'].includes(key) ||
        value.length > SOURCE_LIMITS.trackingValueLength,
    ) ||
    url.hash ||
    !providers[source].path.test(url.pathname)
  )
    throw new Error('Invalid provider URL');
  return url.href;
}
export const invalidSourceArguments = () =>
  new CareerError(
    'invalid_arguments',
    'Invalid source, job reference or cursor. Read search_jobs again.',
    400,
  );
export function parseContinuation(value: unknown): SourceContinuation {
  if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value)))
    throw invalidSourceArguments();
  const row = record(value);
  if (Object.keys(row).some((key) => !['page', 'next', 'offset'].includes(key)))
    throw invalidSourceArguments();
  const { page, next, offset } = row;
  if (
    page !== undefined &&
    (typeof page !== 'number' ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > SOURCE_LIMITS.pageNumber)
  )
    throw invalidSourceArguments();
  if (
    offset !== undefined &&
    (typeof offset !== 'number' ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > SOURCE_LIMITS.offset)
  )
    throw invalidSourceArguments();
  if (
    next !== undefined &&
    (typeof next !== 'string' || next.length > SOURCE_LIMITS.nativeCursorLength)
  )
    throw invalidSourceArguments();
  return { page, next, offset };
}
