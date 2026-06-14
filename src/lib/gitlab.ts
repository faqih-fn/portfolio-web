// src/lib/gitlab.ts
// Build-time GitLab fetcher (D-4, baseline §3d). Fetches PUBLIC projects for the
// configured personal user from gitlab.com ONLY — unauthenticated, read-only. No other
// GitLab host may ever appear here (account separation, baseline §3d; grep-guarded).
//
// Graceful degradation (D-4 / NFR-7): ALL errors are caught and result in [] plus a
// build-log warning — the build must NEVER fail on API unavailability.

/** Raw GitLab project shape (only the fields we consume). */
export interface GitLabProject {
  name: string;
  description: string | null;
  web_url: string;
  star_count: number;
  topics?: string[];
  tag_list?: string[];
  last_activity_at: string;
}

export interface GitLabFetchDeps {
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

// gitlab.com ONLY (baseline §3d). Never parameterize the host.
const GITLAB_API = 'https://gitlab.com/api/v4';

/**
 * Fetch public projects for `username` from gitlab.com. Returns [] on ANY failure (D-4).
 */
export async function fetchGitLabProjects(
  username: string,
  deps: GitLabFetchDeps = {},
): Promise<GitLabProject[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const url = `${GITLAB_API}/users/${encodeURIComponent(
    username,
  )}/projects?visibility=public&per_page=100`;

  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'portfolio-web-build' },
    });
    if (!res.ok) {
      // Covers 403/429 rate-limit and every other non-2xx (D-4).
      console.warn(
        `[gitlab] non-2xx response (${res.status}) for ${username}; degrading to [].`,
      );
      return [];
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      console.warn('[gitlab] unexpected response shape; degrading to [].');
      return [];
    }
    return data as GitLabProject[];
  } catch (err) {
    console.warn(`[gitlab] fetch failed (${String(err)}); degrading to [].`);
    return [];
  }
}
