/**
 * Public search: strangers finding group runs marked "public". Built, off by default.
 *
 * Switch it on with the environment variable PUBLIC_SEARCH_ENABLED=true (a deploy setting, so the
 * owner can turn it on or off without a code change; tests set it too). With it off, every public
 * route answers 404, nobody can mark a run public, and the Map has no "Everyone" option.
 *
 * Do not turn it on before the stranger-safety checklist in docs/PUBLIC-SEARCH.md is complete.
 */
export function publicSearchEnabled(): boolean {
  return process.env.PUBLIC_SEARCH_ENABLED === "true";
}

/**
 * The owner's rule of thumb for switching public search on: this many active groups with at
 * least one run in the last 30 days. Below that a public map looks empty. It is a decision for the
 * owner, not something the code checks.
 */
export const PUBLIC_SEARCH_THRESHOLD_ACTIVE_GROUPS = 200;

export const PUBLIC_SEARCH = {
  /** The most runs one map view returns. */
  maxRuns: 200,
  /** A map view wider than this many degrees is refused, so the whole world cannot be copied in one call. */
  maxSpanDeg: 6,
  /** First and last metres hidden on every public route, whatever the admin chose. */
  routeTrimM: 200,
  /** Reports about public runs, per address, per day. */
  reportsPerDay: 10,
} as const;
