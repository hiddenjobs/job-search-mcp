import { CareerError } from './errors.ts';

export const remoteLocations = [
  'All',
  'Worldwide',
  'US',
  'CA',
  'GB',
  'EUROPE',
  'ES',
  'DE',
  'FR',
  'PL',
  'RO',
  'NL',
  'IE',
  'PT',
  'CH',
  'LATAM',
  'BR',
  'MX',
  'CO',
  'AR',
  'AMERICAS',
  'APAC',
  'AU',
  'IN',
  'EMEA',
];

export const remoteLocationError =
  'remoteLocation must use an exact, case-sensitive value: ' +
  remoteLocations.join(', ') +
  '. Use country codes such as PT or US, regional codes such as EUROPE, or All/Worldwide. Names, aliases and lowercase codes are not accepted. Omit the filter or use All for no location restriction.';

export const remoteLocationSchema = {
  type: 'string',
  enum: remoteLocations,
  description: remoteLocationError,
};

export const isRemoteLocation = (value: unknown): value is string =>
  typeof value === 'string' && remoteLocations.includes(value);

export function assertRemoteLocation(value: unknown): asserts value is string {
  if (!isRemoteLocation(value))
    throw new CareerError('invalid_remote_location', remoteLocationError, 400);
}
