// src/lib/projects.ts
// Normalize GitHub + GitLab repo shapes into one Project type, merge content-collection
// overrides over API data (manual fields win — F-03.2), validate homepage/demo URLs to
// http(s):// only (reject javascript:/data: — D-5), and assert at build time the D-6
// featured-projects invariant.

import type { GitHubRepo } from './github';
import type { GitLabProject } from './gitlab';

/** Unified project shape consumed by ProjectCard / FeaturedProjects / pages. */
export interface Project {
  /** Slug = repo name; the merge/match key against the content collection. */
  slug: string;
  name: string;
  description: string | null;
  /** Canonical repository URL (GitHub html_url / GitLab web_url). */
  repoUrl: string;
  /** Scheme-validated http(s) demo URL, or null. */
  demoUrl: string | null;
  language: string | null;
  stars: number;
  topics: string[];
  /** ISO timestamp used for the default descending sort (F-02). */
  updatedAt: string;
  source: 'github' | 'gitlab';
}

/** Override fields from the content collection (a subset of the zod schema, F-03). */
export interface ProjectOverride {
  repo: string;
  featured: boolean;
  order?: number;
  title?: string;
  description?: string;
  demoUrl?: string;
  tags?: string[];
}

/**
 * Validate a URL string to the http(s) scheme ONLY (D-5). Rejects javascript:, data:,
 * and any non-http(s) scheme; returns the normalized URL string or null.
 */
export function validateUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return parsed.toString();
}

/** Normalize a GitHub repo into a Project. */
export function fromGitHub(repo: GitHubRepo): Project {
  return {
    slug: repo.name,
    name: repo.name,
    description: repo.description,
    repoUrl: repo.html_url,
    demoUrl: validateUrl(repo.homepage),
    language: repo.language,
    stars: repo.stargazers_count ?? 0,
    topics: repo.topics ?? [],
    updatedAt: repo.updated_at ?? repo.pushed_at,
    source: 'github',
  };
}

/** Normalize a GitLab project into a Project. */
export function fromGitLab(project: GitLabProject): Project {
  const slug = project.web_url.split('/').filter(Boolean).pop() ?? project.name;
  return {
    slug,
    name: project.name,
    description: project.description,
    repoUrl: project.web_url,
    demoUrl: null,
    language: null,
    stars: project.star_count ?? 0,
    topics: project.topics ?? project.tag_list ?? [],
    updatedAt: project.last_activity_at,
    source: 'gitlab',
  };
}

/**
 * Merge a content-collection override onto a base Project. Manual fields WIN over API
 * data for matching repos (F-03.2). demoUrl from the override is also scheme-validated.
 */
export function mergeOverride(base: Project, override: ProjectOverride): Project {
  const overrideDemo = validateUrl(override.demoUrl);
  return {
    ...base,
    name: override.title ?? base.name,
    description: override.description ?? base.description,
    demoUrl: overrideDemo ?? base.demoUrl,
    topics: override.tags ?? base.topics,
  };
}

/**
 * Build the full list of Projects from API data + collection overrides.
 * - Projects present in the API are normalized and have overrides merged on.
 * - Overrides whose repo has NO matching API entry still render (manual fields alone,
 *   F-03.2 graceful-degradation path) as a minimal Project.
 */
export function buildProjects(
  githubRepos: GitHubRepo[],
  gitlabProjects: GitLabProject[],
  overrides: ProjectOverride[],
): Project[] {
  const overrideMap = new Map(overrides.map((o) => [o.repo, o]));

  const base: Project[] = [
    ...githubRepos.filter((r) => !r.fork && !r.archived).map(fromGitHub),
    ...gitlabProjects.map(fromGitLab),
  ];

  const baseSlugs = new Set(base.map((p) => p.slug));
  const merged = base.map((p) => {
    const o = overrideMap.get(p.slug);
    return o ? mergeOverride(p, o) : p;
  });

  // Overrides with no matching API repo: synthesize from manual fields (F-03.2).
  for (const o of overrides) {
    if (baseSlugs.has(o.repo)) continue;
    merged.push({
      slug: o.repo,
      name: o.title ?? o.repo,
      description: o.description ?? null,
      repoUrl: '',
      demoUrl: validateUrl(o.demoUrl),
      language: null,
      stars: 0,
      topics: o.tags ?? [],
      updatedAt: '',
      source: 'github',
    });
  }

  return merged;
}

/** Default sort: most-recently-updated first (F-02). */
export function sortByUpdatedDesc(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bt - at;
  });
}

/**
 * D-6 build-time invariant. Throws (failing the build) with an explicit message unless:
 *   (i)  exactly 3 collection entries have featured:true, AND
 *   (ii) their slugs equal site.ts featuredProjects (as a set).
 */
export function assertFeaturedInvariant(
  overrides: ProjectOverride[],
  featuredSlugs: string[],
): void {
  const featured = overrides.filter((o) => o.featured);
  if (featured.length !== 3) {
    throw new Error(
      `[projects] D-6 violation: expected exactly 3 content entries with featured:true, ` +
        `found ${featured.length}. Fix src/content/projects/*.md.`,
    );
  }
  const featuredSet = new Set(featured.map((o) => o.repo));
  const configSet = new Set(featuredSlugs);
  if (configSet.size !== 3) {
    throw new Error(
      `[projects] D-6 violation: site.ts featuredProjects must list exactly 3 slugs, ` +
        `found ${configSet.size}.`,
    );
  }
  const sameSize = featuredSet.size === configSet.size;
  const sameMembers = [...featuredSet].every((s) => configSet.has(s));
  if (!sameSize || !sameMembers) {
    throw new Error(
      `[projects] D-6 violation: featured slugs in content collection ` +
        `[${[...featuredSet].sort().join(', ')}] do not equal site.ts featuredProjects ` +
        `[${[...configSet].sort().join(', ')}].`,
    );
  }
}

/**
 * Select the featured projects in collection-defined order (by `order`, then slug),
 * merging API data when available (F-01.3, F-03.3). Returns exactly the featured set;
 * caller should have run assertFeaturedInvariant first.
 */
export function selectFeatured(
  allProjects: Project[],
  overrides: ProjectOverride[],
): Project[] {
  const featured = overrides
    .filter((o) => o.featured)
    .sort((a, b) => {
      const ao = a.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.repo.localeCompare(b.repo);
    });

  const bySlug = new Map(allProjects.map((p) => [p.slug, p]));
  return featured.map((o) => {
    const existing = bySlug.get(o.repo);
    if (existing) return existing;
    // Should not happen post-buildProjects (synthesizes manual entries), but stay safe.
    return {
      slug: o.repo,
      name: o.title ?? o.repo,
      description: o.description ?? null,
      repoUrl: '',
      demoUrl: validateUrl(o.demoUrl),
      language: null,
      stars: 0,
      topics: o.tags ?? [],
      updatedAt: '',
      source: 'github' as const,
    };
  });
}
