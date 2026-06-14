import { describe, it, expect, vi } from 'vitest';
import { fetchGitLabProjects } from './gitlab';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('fetchGitLabProjects — gitlab.com only + graceful degradation', () => {
  it('targets gitlab.com only (baseline §3d)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse([], 200));
    await fetchGitLabProjects('faqihmuhammad111', { fetchImpl });
    const calledUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(calledUrl.startsWith('https://gitlab.com/api/v4/')).toBe(true);
  });

  it('returns [] on non-2xx without throwing (D-4)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    const projects = await fetchGitLabProjects('faqihmuhammad111', { fetchImpl });
    expect(projects).toEqual([]);
  });

  it('returns [] on a network error without throwing (D-4)', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ENOTFOUND');
    });
    const projects = await fetchGitLabProjects('faqihmuhammad111', { fetchImpl });
    expect(projects).toEqual([]);
  });

  it('returns the project array on 200', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ name: 'p', web_url: 'https://gitlab.com/u/p', star_count: 2 }], 200),
    );
    const projects = await fetchGitLabProjects('faqihmuhammad111', { fetchImpl });
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('p');
  });
});
