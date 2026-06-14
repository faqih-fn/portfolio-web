// src/lib/stats.ts
// Derive Dashboard stats (F-01.2) from the fetched repo set, at BUILD TIME only:
// public repo count, total stars, top languages, last-push date. No client-side fetch.

import type { GitHubRepo } from './github';

export interface SiteStats {
  /** Count of public, non-fork, non-archived repos. */
  repoCount: number;
  /** Sum of stargazers across counted repos. */
  totalStars: number;
  /** Top languages by repo frequency (most common first). */
  topLanguages: string[];
  /** Most recent pushed_at across counted repos, or null when there are none. */
  lastPush: string | null;
}

export interface DeriveStatsOptions {
  /** How many top languages to surface. Default 3. */
  topN?: number;
}

/**
 * Derive SiteStats from GitHub repos. Excludes forks and archived repos so the counts
 * reflect original public work. Pure + deterministic for unit testing.
 */
export function deriveStats(
  repos: GitHubRepo[],
  options: DeriveStatsOptions = {},
): SiteStats {
  const topN = options.topN ?? 3;
  const counted = repos.filter((r) => !r.fork && !r.archived);

  const repoCount = counted.length;
  const totalStars = counted.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0);

  const langFreq = new Map<string, number>();
  for (const r of counted) {
    if (r.language) {
      langFreq.set(r.language, (langFreq.get(r.language) ?? 0) + 1);
    }
  }
  const topLanguages = [...langFreq.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0, topN)
    .map(([lang]) => lang);

  let lastPush: string | null = null;
  for (const r of counted) {
    const t = r.pushed_at;
    if (t && (lastPush === null || Date.parse(t) > Date.parse(lastPush))) {
      lastPush = t;
    }
  }

  return { repoCount, totalStars, topLanguages, lastPush };
}
