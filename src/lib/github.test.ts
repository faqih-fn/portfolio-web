import { describe, it, expect, vi } from 'vitest';
import { fetchGitHubRepos } from './github';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('fetchGitHubRepos — graceful degradation (D-4)', () => {
  it('returns [] on 403 rate-limit without throwing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'rate limited' }, 403));
    const repos = await fetchGitHubRepos('faqih-fn', { fetchImpl });
    expect(repos).toEqual([]);
  });

  it('returns [] on any non-2xx (e.g. 500) without throwing', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    const repos = await fetchGitHubRepos('faqih-fn', { fetchImpl });
    expect(repos).toEqual([]);
  });

  it('returns [] on a network error without throwing', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const repos = await fetchGitHubRepos('faqih-fn', { fetchImpl });
    expect(repos).toEqual([]);
  });

  it('returns the repo array on 200', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ name: 'a', stargazers_count: 1 }], 200),
    );
    const repos = await fetchGitHubRepos('faqih-fn', { fetchImpl });
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('a');
  });

  it('sends a bearer header only when a token is provided', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([], 200));
    await fetchGitHubRepos('faqih-fn', { fetchImpl, token: 'secret-token' });
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe('Bearer secret-token');

    const fetchImpl2 = vi.fn<typeof fetch>(async () => jsonResponse([], 200));
    await fetchGitHubRepos('faqih-fn', { fetchImpl: fetchImpl2, token: undefined });
    const headers2 = (fetchImpl2.mock.calls[0]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers2.Authorization).toBeUndefined();
  });
});
