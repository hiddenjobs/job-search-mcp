import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';

const jobsTable = Deno.env.get('SUPABASE_JOBS_TABLE') || 'jobs';

const categories = new Set([
  'Frontend',
  'Backend',
  'Full Stack',
  'DevOps',
  'Mobile',
  'Data Scientist',
  'Data Analyst',
  'Data Engineer',
  'MLOps',
  'AI Engineer',
  'Design',
  'Video',
  'Support',
  'Project Management',
  'Other',
]);

const employmentTypes = new Set(['Full-time', 'Part-time']);
const jobTypes = new Set(['Permanent', 'Freelance']);
const remoteLocations = new Set([
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
]);

const remoteLocationMatchCodes: Record<string, string[]> = {
  US: ['US', 'AMERICAS'],
  CA: ['CA', 'AMERICAS'],
  GB: ['GB', 'EUROPE', 'EMEA'],
  EUROPE: ['EUROPE', 'EU', 'EEA', 'EMEA'],
  ES: ['ES', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  DE: ['DE', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  FR: ['FR', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  PL: ['PL', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  RO: ['RO', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  NL: ['NL', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  IE: ['IE', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  PT: ['PT', 'EU', 'EEA', 'EUROPE', 'EMEA'],
  CH: ['CH', 'EUROPE', 'EMEA'],
  LATAM: ['LATAM', 'AMERICAS'],
  BR: ['BR', 'LATAM', 'AMERICAS'],
  MX: ['MX', 'LATAM', 'AMERICAS'],
  CO: ['CO', 'LATAM', 'AMERICAS'],
  AR: ['AR', 'LATAM', 'AMERICAS'],
  AMERICAS: ['AMERICAS'],
  APAC: ['APAC'],
  AU: ['AU', 'APAC'],
  IN: ['IN', 'APAC'],
  EMEA: ['EMEA'],
};

const searchStopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'for',
  'i',
  'in',
  'is',
  'job',
  'jobs',
  'looking',
  'of',
  'on',
  'or',
  'remote',
  'role',
  'roles',
  'show',
  'the',
  'to',
  'want',
  'we',
  'with',
  'work',
]);

export type PublicJob = {
  id: string;
  slug: string | null;
  title: string;
  description: string;
  descriptionPreview: string;
  salary: string;
  company: string | null;
  companySlug: string | null;
  location: string | null;
  category: string;
  employmentType: string | null;
  jobType: string | null;
  createdAt: string;
  updatedAt: string | null;
  validThrough: string | null;
  experienceLevel: string | null;
  skills: string[];
  remoteScope: string | null;
  remoteLocationCodes: string[];
  remoteLocationLabel: string | null;
  hasApplicationLink: boolean;
};

export type JobsSearchParams = {
  query: string;
  category: string;
  employmentType: string;
  jobType: string;
  remoteLocation: string;
  page: number;
  limit: number;
};

const asText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const asNullableText = (value: unknown) => {
  const normalized = asText(value);
  return normalized || null;
};

const asStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim())
      .filter(Boolean)
    : [];

const isHttpUrl = (value: unknown) =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim());

const normalizeSearchText = (value: unknown) =>
  (typeof value === 'string' ? value : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

const tokenizeSearchQuery = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !searchStopWords.has(token));

const getDatabaseSearchTerms = (query: string) =>
  Array.from(
    new Set(
      tokenizeSearchQuery(query)
        .flatMap((term) => term.split(/[^a-z0-9]+/i))
        .map((term) => term.toLowerCase().trim())
        .filter((term) => term.length > 1),
    ),
  ).slice(0, 12);

const normalizeAllowed = (value: string, allowed: Set<string>) =>
  allowed.has(value) ? value : 'All';

const normalizeRemoteLocation = (value: string) => {
  if (value === 'EU' || value === 'European Union') return 'EUROPE';
  return normalizeAllowed(value, remoteLocations);
};

export const normalizeJobsSearchParams = (params: URLSearchParams): JobsSearchParams => {
  const requestedPage = Number.parseInt(params.get('page') || '1', 10);
  const requestedLimit = Number.parseInt(params.get('limit') || '20', 10);
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(requestedPage, 10000)) : 1;
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : 20;

  return {
    query: normalizeSearchText(params.get('q') || params.get('query')),
    category: normalizeAllowed(params.get('category') || 'All', categories),
    employmentType: normalizeAllowed(params.get('employmentType') || 'All', employmentTypes),
    jobType: normalizeAllowed(params.get('jobType') || 'All', jobTypes),
    remoteLocation: normalizeRemoteLocation(
      params.get('remoteLocation') || params.get('location') || 'All',
    ),
    page,
    limit,
  };
};

const buildRpcFilters = (params: JobsSearchParams) => ({
  category: params.category,
  employmentType: params.employmentType,
  jobType: params.jobType,
  remoteLocation: params.remoteLocation,
  remoteLocationCodes: params.remoteLocation === 'All' || params.remoteLocation === 'Worldwide'
    ? []
    : remoteLocationMatchCodes[params.remoteLocation] || [],
});

const mapPublicJob = (row: Record<string, unknown>): PublicJob => {
  const description = asText(row.description, 'No description provided yet.');
  const storedUrl = asText(row.url);
  const applicationUrl = asText(row.application_url);

  return {
    id: asText(row.id),
    slug: asNullableText(row.slug),
    title: asText(row.title, 'Untitled role'),
    description,
    descriptionPreview: description.slice(0, 220),
    salary: asText(row.salary, 'Not specified') || 'Not specified',
    company: asNullableText(row.company),
    companySlug: asNullableText(row.company_slug),
    location: asNullableText(row.location),
    category: asText(row.category, 'Other') || 'Other',
    employmentType: asNullableText(row.employment_type),
    jobType: asNullableText(row.job_type),
    createdAt: asText(row.created_at),
    updatedAt: asNullableText(row.updated_at),
    validThrough: asNullableText(row.valid_through),
    experienceLevel: asNullableText(row.experience_level),
    skills: asStringArray(row.skills),
    remoteScope: asNullableText(row.remote_scope),
    remoteLocationCodes: asStringArray(row.remote_location_codes),
    remoteLocationLabel: asNullableText(row.remote_location_label),
    hasApplicationLink: isHttpUrl(applicationUrl) || isHttpUrl(storedUrl),
  };
};

const parseSearchRpcPayload = (data: unknown) => {
  if (!data || typeof data !== 'object') return { jobs: [], totalCount: 0 };
  const payload = data as { jobs?: unknown; totalCount?: unknown };
  return {
    jobs: Array.isArray(payload.jobs)
      ? payload.jobs.map((row) => mapPublicJob((row || {}) as Record<string, unknown>))
      : [],
    totalCount: typeof payload.totalCount === 'number' && Number.isFinite(payload.totalCount)
      ? Math.max(0, Math.floor(payload.totalCount))
      : 0,
  };
};

export const searchPublicJobs = async (
  supabase: SupabaseClient,
  params: JobsSearchParams,
) => {
  const offset = (params.page - 1) * params.limit;
  const terms = getDatabaseSearchTerms(params.query);

  if (terms.length > 0) {
    const { data, error } = await supabase.rpc('search_jobs', {
      p_terms: terms,
      p_filters: buildRpcFilters(params),
      p_limit: params.limit,
      p_offset: offset,
    });

    if (error) throw new Error(`Job search failed: ${error.message}`);

    const result = parseSearchRpcPayload(data);
    return {
      jobs: result.jobs,
      totalCount: result.totalCount,
      page: params.page,
      limit: params.limit,
      hasMore: offset + result.jobs.length < result.totalCount,
    };
  }

  let query = supabase
    .from(jobsTable)
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + params.limit - 1);

  if (params.category !== 'All') query = query.eq('category', params.category);
  if (params.employmentType !== 'All') query = query.eq('employment_type', params.employmentType);
  if (params.jobType !== 'All') query = query.eq('job_type', params.jobType);

  if (params.remoteLocation === 'Worldwide') {
    query = query.eq('remote_scope', 'worldwide');
  } else if (params.remoteLocation !== 'All') {
    const codeFilters = (remoteLocationMatchCodes[params.remoteLocation] || [])
      .map((code) => `remote_location_codes.cs.{${code}}`);
    query = query.or(['remote_scope.eq.worldwide', ...codeFilters].join(','));
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`Job lookup failed: ${error.message}`);

  const jobs = (data || []).map((row) => mapPublicJob(row as Record<string, unknown>));
  const totalCount = count || 0;

  return {
    jobs,
    totalCount,
    page: params.page,
    limit: params.limit,
    hasMore: offset + jobs.length < totalCount,
  };
};

export const getPublicJob = async (supabase: SupabaseClient, idOrSlug: string) => {
  const identifier = idOrSlug.trim();
  if (!identifier) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    identifier,
  );
  const { data, error } = await supabase
    .from(jobsTable)
    .select('*')
    .eq(isUuid ? 'id' : 'slug', identifier)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Job lookup failed: ${error.message}`);
  return data ? mapPublicJob(data as Record<string, unknown>) : null;
};

export const getApplicationLink = async (supabase: SupabaseClient, idOrSlug: string) => {
  const identifier = idOrSlug.trim();
  if (!identifier) return null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    identifier,
  );
  const { data, error } = await supabase
    .from(jobsTable)
    .select('url, application_url')
    .eq(isUuid ? 'id' : 'slug', identifier)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw new Error(`Application link lookup failed: ${error.message}`);

  const row = data as { url?: unknown; application_url?: unknown } | null;
  const url = isHttpUrl(row?.url)
    ? String(row?.url).trim()
    : isHttpUrl(row?.application_url)
    ? String(row?.application_url).trim()
    : null;

  return url;
};

export const hasActiveSubscription = async (supabase: SupabaseClient, userId: string) => {
  const { data, error } = await supabase
    .from('stripe_subscriptions')
    .select('id, current_period_end')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'cancelling'])
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[jobs-api] subscription lookup failed:', error.message);
    return false;
  }

  const subscription = data?.[0] as { current_period_end?: string | null } | undefined;
  if (!subscription) return false;
  if (!subscription.current_period_end) return true;

  return Date.parse(subscription.current_period_end) > Date.now();
};
