// src/config/site.ts
// SINGLE source of truth for site configuration (AGENTS.md §5, F-03.4).
// Implements the SiteConfig interface from AGENTS.md §5 EXACTLY (no email field, by design)
// plus a small set of additive fields (siteName, valueProposition, role, techStack).
//
// KT-pinned values (tech_spec OQ-002, AGENTS.md §5/§7):
//   githubUsername  : "faqih-fn"
//   gitlabUsername  : "faqihmuhammad111" (personal account, gitlab.com only, baseline §3d)
//   linkedinUrl     : "https://www.linkedin.com/in/muhammad-faqih-622131173/"

export interface NavItem {
  /** Visible label */
  label: string;
  /** Internal route (file-routed). "Hire me" is NOT here — it is a button that opens ContactModal. */
  href: string;
}

export interface SiteConfig {
  githubUsername: string;
  gitlabUsername?: string;
  linkedinUrl: string;
  navItems: NavItem[];
  /** Repo slugs pinned on the Dashboard (exactly 3 shown — D-6). */
  featuredProjects: string[];
  /** Sourced from import.meta.env.PUBLIC_TURNSTILE_SITE_KEY (the only PUBLIC_ var in client code). */
  turnstileSiteKey: string;
}

// Additive (non-contract) fields used by the static shell/Dashboard.
export interface SiteMeta {
  siteName: string;
  /** Hero headline name. */
  ownerName: string;
  /** Hero role line (F-01.1). */
  role: string;
  /** Hero value proposition copy (F-01.1). */
  valueProposition: string;
  /** Tech-stack strip entries (F-01.4) — config-driven, not hardcoded in markup. */
  techStack: string[];
}

// NOTE: no email field exists in SiteConfig or SiteMeta, by design (AGENTS.md §5/§7).

export const site: SiteConfig & SiteMeta = {
  // --- SiteConfig (AGENTS.md §5 contract) ---
  githubUsername: 'faqih-fn',
  gitlabUsername: 'faqihmuhammad111',
  linkedinUrl: 'https://www.linkedin.com/in/muhammad-faqih-622131173/',
  navItems: [
    // Exact order per AGENTS.md §5: Dashboard, Projects, About.
    { label: 'Dashboard', href: '/' },
    { label: 'Projects', href: '/projects' },
    { label: 'About', href: '/about' },
  ],
  // Exactly 3 featured slugs (D-6). These MUST equal the featured:true entries in
  // src/content/projects/*.md; src/lib/projects.ts asserts this at build time.
  featuredProjects: ['katalon-web-suite', 'appium-mobile-framework', 'api-contract-tests'],
  // The only PUBLIC_-prefixed env var that reaches client code (F-03, F-04).
  turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? '',

  // --- Additive meta ---
  siteName: 'Muhammad Faqih — QA Engineer / SDET',
  ownerName: 'Muhammad Faqih',
  role: 'QA Engineer / SDET',
  valueProposition:
    'I build resilient test automation and CI quality gates — web, mobile, and API — so teams ship faster with fewer regressions.',
  techStack: ['Katalon', 'Appium', 'API testing', 'TypeScript', 'CI/CD'],
};

export default site;
