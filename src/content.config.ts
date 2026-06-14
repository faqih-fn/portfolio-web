// src/content.config.ts
// Content-collection schema (F-03). The `projects` collection uses a glob loader over
// src/content/projects/*.md. Manual overrides/pins are merged over API data in
// src/lib/projects.ts (manual fields win — F-03.2). The collection (featured + order) is
// the behavioral authority for featured selection/ordering (D-6); src/config/site.ts
// carries the same 3 slugs to satisfy the SiteConfig contract, asserted at build time.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/projects' }),
  schema: z.object({
    // Match key against API repo slugs (repo name). Required.
    repo: z.string(),
    featured: z.boolean(),
    order: z.number().optional(),
    // Optional manual override fields (win over API data, F-03.2).
    title: z.string().optional(),
    description: z.string().optional(),
    demoUrl: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = { projects };
