import { describe, it, expect } from 'vitest';
import { deriveStats } from './stats';
import type { GitHubRepo } from './github';

function repo(partial: Partial<GitHubRepo>): GitHubRepo {
  return {
    name: 'r',
    full_name: 'u/r',
    description: null,
    html_url: 'https://github.com/u/r',
    homepage: null,
    language: null,
    stargazers_count: 0,
    topics: [],
    pushed_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    fork: false,
    archived: false,
    ...partial,
  };
}

describe('deriveStats (F-01.2)', () => {
  it('derives repo count, total stars, top languages, and last-push from the set', () => {
    const repos: GitHubRepo[] = [
      repo({ name: 'a', language: 'TypeScript', stargazers_count: 5, pushed_at: '2024-05-01T00:00:00Z' }),
      repo({ name: 'b', language: 'TypeScript', stargazers_count: 3, pushed_at: '2024-06-15T00:00:00Z' }),
      repo({ name: 'c', language: 'Python', stargazers_count: 2, pushed_at: '2024-02-01T00:00:00Z' }),
    ];
    const stats = deriveStats(repos);
    expect(stats.repoCount).toBe(3);
    expect(stats.totalStars).toBe(10);
    expect(stats.topLanguages[0]).toBe('TypeScript');
    expect(stats.topLanguages).toContain('Python');
    expect(stats.lastPush).toBe('2024-06-15T00:00:00Z');
  });

  it('excludes forks and archived repos from counts', () => {
    const repos: GitHubRepo[] = [
      repo({ name: 'a', stargazers_count: 5 }),
      repo({ name: 'fork', fork: true, stargazers_count: 99 }),
      repo({ name: 'old', archived: true, stargazers_count: 99 }),
    ];
    const stats = deriveStats(repos);
    expect(stats.repoCount).toBe(1);
    expect(stats.totalStars).toBe(5);
  });

  it('returns null last-push and zeroes for an empty set (degradation)', () => {
    const stats = deriveStats([]);
    expect(stats.repoCount).toBe(0);
    expect(stats.totalStars).toBe(0);
    expect(stats.topLanguages).toEqual([]);
    expect(stats.lastPush).toBeNull();
  });
});
