// src/lib/github.ts
// Build-time GitHub fetcher (D-4, F-02). Fetches public repos for the configured user
// from the GitHub REST API. An optional GITHUB_TOKEN (build env only, NEVER PUBLIC_-
// prefixed, never shipped to the client — F-02.2) is sent as a bearer header when present.
//
// Graceful degradation (D-4 / NFR-7): ALL errors (network, 403 rate-limit, any non-2xx)
// are caught and result in [] plus a build-log warning — the build must NEVER fail on
// API unavailability.

/** Raw GitHub repo shape (only the fields we consume). */
export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  topics?: string[];
  pushed_at: string;
  updated_at: string;
  fork: boolean;
  archived: boolean;
}

export interface FetchDeps {
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Optional build-time token. Defaults to process.env.GITHUB_TOKEN. */
  token?: string | undefined;
}

const GITHUB_API = 'https://api.github.com';

/**
 * Fetch public, owner-type repos for `username`. Returns [] on ANY failure (D-4).
 */
export async function fetchGitHubRepos(
  username: string,
  deps: FetchDeps = {},
): Promise<GitHubRepo[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const token =
    deps.token ?? (typeof process !== 'undefined' ? process.env.GITHUB_TOKEN : undefined);

  const url = `${GITHUB_API}/users/${encodeURIComponent(
    username,
  )}/repos?per_page=100&type=owner`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'portfolio-web-build',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      // Covers 403 rate-limit and every other non-2xx (D-4).
      console.warn(
        `[github] non-2xx response (${res.status}) for ${username}; degrading to [].`,
      );
      return [];
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data)) {
      console.warn('[github] unexpected response shape; degrading to [].');
      return [];
    }
    return data as GitHubRepo[];
  } catch (err) {
    // Network errors, JSON parse errors, anything.
    console.warn(`[github] fetch failed (${String(err)}); degrading to [].`);
    return [];
  }
}
