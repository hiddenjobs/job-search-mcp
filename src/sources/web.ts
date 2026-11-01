/** A handoff to the caller's native web search, never a claim of provider results. */
export function webSearchRequest(params: URLSearchParams) {
  const filters = Object.fromEntries(
    ['remoteLocation', 'category', 'employmentType', 'jobType']
      .map((key) => [key, params.get(key)])
      .filter((entry): entry is [string, string] => !!entry[1] && entry[1] !== 'All'),
  );
  return {
    source: 'web',
    jobs: [],
    status: 'requires_host_search',
    execution: 'host',
    request: {
      query: (params.get('q') ?? params.get('query') ?? '').trim(),
      filters,
      limit: Number(params.get('limit') ?? 10),
    },
    coverage: 'Pending native web search by the assistant; the MCP has not queried the web.',
    instructions:
      'Use your native web-search capability to find current job openings matching this request and the user’s stated preferences. Verify each listing, remote eligibility and published salary; cite its real URL. Keep web results distinct from connected-source results and deduplicate verified identical openings while preserving required attribution. Do not fabricate MCP IDs or use web URLs with MCP detail, application-link or Hidden Jobs-only tracking tools. Do not send CV contents or private profile information to a search engine. If web search is unavailable, report that limitation explicitly; this handoff is not a completed search and does not mean there are no matching jobs.',
  };
}
