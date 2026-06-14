import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  fromGitHub,
  mergeOverride,
  buildProjects,
  sortByUpdatedDesc,
  assertFeaturedInvariant,
  selectFeatured,
  type ProjectOverride,
} from './projects';
import type { GitHubRepo } from './github';

function ghRepo(partial: Partial<GitHubRepo>): GitHubRepo {
  return {
    name: 'r',
    full_name: 'u/r',
    description: 'api description',
    html_url: 'https://github.com/u/r',
    homepage: null,
    language: 'TypeScript',
    stargazers_count: 1,
    topics: ['testing'],
    pushed_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    fork: false,
    archived: false,
    ...partial,
  };
}

describe('validateUrl — scheme validation (D-5)', () => {
  it('accepts http and https URLs', () => {
    expect(validateUrl('https://example.com/demo')).toBe('https://example.com/demo');
    expect(validateUrl('http://example.com')).toBe('http://example.com/');
  });

  it('rejects javascript: and data: schemes', () => {
    expect(validateUrl('javascript:alert(1)')).toBeNull();
    expect(validateUrl('data:text/html,<script>x</script>')).toBeNull();
  });

  it('rejects empty / malformed / non-http(s) values', () => {
    expect(validateUrl('')).toBeNull();
    expect(validateUrl(null)).toBeNull();
    expect(validateUrl('not a url')).toBeNull();
    expect(validateUrl('ftp://example.com')).toBeNull();
  });
});

describe('mergeOverride — manual fields win (F-03.2)', () => {
  it('uses the collection title/description/demoUrl/tags over API data', () => {
    const base = fromGitHub(ghRepo({ name: 'proj', homepage: 'https://api-demo.com' }));
    const override: ProjectOverride = {
      repo: 'proj',
      featured: true,
      title: 'Manual Title',
      description: 'manual description',
      demoUrl: 'https://manual-demo.com',
      tags: ['manual-tag'],
    };
    const merged = mergeOverride(base, override);
    expect(merged.name).toBe('Manual Title');
    expect(merged.description).toBe('manual description');
    expect(merged.demoUrl).toBe('https://manual-demo.com/');
    expect(merged.topics).toEqual(['manual-tag']);
  });

  it('falls back to API values when an override field is absent', () => {
    const base = fromGitHub(ghRepo({ name: 'proj', description: 'api description' }));
    const override: ProjectOverride = { repo: 'proj', featured: false };
    const merged = mergeOverride(base, override);
    expect(merged.description).toBe('api description');
  });

  it('rejects a javascript: demoUrl override (D-5) and keeps the safe base', () => {
    const base = fromGitHub(ghRepo({ name: 'proj', homepage: 'https://safe.com' }));
    const override: ProjectOverride = {
      repo: 'proj',
      featured: false,
      demoUrl: 'javascript:alert(1)',
    };
    const merged = mergeOverride(base, override);
    expect(merged.demoUrl).toBe('https://safe.com/');
  });
});

describe('buildProjects + sort', () => {
  it('merges overrides over matching API repos and sorts by updatedAt desc', () => {
    const repos = [
      ghRepo({ name: 'a', updated_at: '2024-02-01T00:00:00Z' }),
      ghRepo({ name: 'b', updated_at: '2024-06-01T00:00:00Z', description: 'api b' }),
    ];
    const overrides: ProjectOverride[] = [
      { repo: 'b', featured: true, description: 'manual b' },
    ];
    const projects = sortByUpdatedDesc(buildProjects(repos, [], overrides));
    expect(projects[0].slug).toBe('b');
    expect(projects[0].description).toBe('manual b');
  });

  it('excludes forks/archived and synthesizes manual-only entries', () => {
    const repos = [ghRepo({ name: 'fork', fork: true })];
    const overrides: ProjectOverride[] = [
      { repo: 'manual-only', featured: true, title: 'Manual Only' },
    ];
    const projects = buildProjects(repos, [], overrides);
    expect(projects.find((p) => p.slug === 'fork')).toBeUndefined();
    const manual = projects.find((p) => p.slug === 'manual-only');
    expect(manual?.name).toBe('Manual Only');
  });
});

describe('assertFeaturedInvariant (D-6)', () => {
  const featuredSlugs = ['x', 'y', 'z'];

  it('passes when exactly 3 featured entries match site.ts slugs', () => {
    const overrides: ProjectOverride[] = [
      { repo: 'x', featured: true },
      { repo: 'y', featured: true },
      { repo: 'z', featured: true },
      { repo: 'other', featured: false },
    ];
    expect(() => assertFeaturedInvariant(overrides, featuredSlugs)).not.toThrow();
  });

  it('throws with an explicit message when count != 3', () => {
    const overrides: ProjectOverride[] = [
      { repo: 'x', featured: true },
      { repo: 'y', featured: true },
    ];
    expect(() => assertFeaturedInvariant(overrides, featuredSlugs)).toThrow(/exactly 3/);
  });

  it('throws when featured slugs drift from site.ts', () => {
    const overrides: ProjectOverride[] = [
      { repo: 'x', featured: true },
      { repo: 'y', featured: true },
      { repo: 'DRIFT', featured: true },
    ];
    expect(() => assertFeaturedInvariant(overrides, featuredSlugs)).toThrow(/do not equal/);
  });
});

describe('selectFeatured', () => {
  it('returns featured projects in order, merged with API data', () => {
    const repos = [
      ghRepo({ name: 'x', description: 'api x' }),
      ghRepo({ name: 'y', description: 'api y' }),
      ghRepo({ name: 'z', description: 'api z' }),
    ];
    const overrides: ProjectOverride[] = [
      { repo: 'z', featured: true, order: 1 },
      { repo: 'x', featured: true, order: 2 },
      { repo: 'y', featured: true, order: 3 },
    ];
    const all = buildProjects(repos, [], overrides);
    const featured = selectFeatured(all, overrides);
    expect(featured.map((p) => p.slug)).toEqual(['z', 'x', 'y']);
  });
});
