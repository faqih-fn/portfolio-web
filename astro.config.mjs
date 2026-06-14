// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Fully static output, no SSR adapter (D-1, F-09.7). The contact endpoint is a
  // Cloudflare Pages Function under functions/, deployed alongside the static build.
  output: 'static',
  // OQ-006: production URL is unknown until the Cloudflare Pages project exists.
  // Placeholder absolute origin used for sitemap / canonical / OG absolute URLs;
  // owner pins the real URL at launch (Launch checklist item 1).
  site: 'https://portfolio-web.pages.dev',
  integrations: [sitemap()],
  build: {
    // Emit `projects.html` rather than `projects/index.html` so Cloudflare Pages serves
    // `/projects` and `/about` with a direct 200 (no trailing-slash 308 redirect). This
    // matches the phase_1r route cases in mock/vibe-test.yaml (GET /projects, /about → 200).
    format: 'file',
    // D-3 / CSP: the shipped CSP is `script-src 'self' https://challenges.cloudflare.com`
    // with NO 'unsafe-inline'. Astro inlines small island <script> bodies into the HTML by
    // default (build threshold = assetsInlineLimit, 4KB), which would be BLOCKED by that CSP.
    // Forcing inlineStylesheets:'never' keeps styles external too; the script externalization
    // is driven by vite.build.assetsInlineLimit:0 below (Astro's plugin-scripts inlines a
    // script only when it is under assetsInlineLimit — 0 makes that never true).
    inlineStylesheets: 'never',
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // 0 → never inline island scripts as <script> bodies; emit external src= modules only
      // (CSP-clean, D-3). Verified by the dist inline-script guard in Verification Commands.
      assetsInlineLimit: 0,
    },
  },
});
