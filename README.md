# portfolio-web

Faqih's personal portfolio site — a static-first **Astro 6 + TypeScript (strict) + Tailwind CSS 4** application deployed on **Cloudflare Pages**. It serves three pages — Dashboard (`/`), Projects (`/projects`), About (`/about`) — built from GitHub/GitLab public-repo data fetched **at build time only**, plus a single serverless **Cloudflare Pages Function** (`functions/api/contact.ts`) that handles a privacy-preserving contact form behind Cloudflare Turnstile and Resend.

Hard constraints: Lighthouse ≥ 95 (all four categories, mobile run), initial JS < 50 KB gzipped, exactly three interactive islands, and the owner's email address never appears anywhere in the repo, client bundle, DOM, or git history.

## Stack

- **Astro 6** (`output: 'static'`, no SSR adapter) — the contact endpoint uses Cloudflare Pages' native `functions/` convention.
- **TypeScript strict**, **Tailwind CSS 4** (class-strategy dark mode, single token file in `src/styles/global.css`).
- **Vanilla-TS islands** (no Preact): `ThemeToggle`, `ProjectsFilter`, `ContactModal` — exactly three.
- **Inter Variable** self-hosted via `@fontsource-variable/inter` (no font CDN).

## Commands

| Command | Action |
| :-- | :-- |
| `npm install` | Install dependencies |
| `npm run dev` | Astro dev server with HMR (http://localhost:4321) |
| `npm run build` | Production static build to `dist/` (runs build-time data fetchers) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src/` and `functions/` |
| `npm run typecheck` | `astro check && tsc --noEmit` (TypeScript strict) |
| `npm run test` | `vitest run` — unit tests (lib fetchers/stats/merge, contact pipeline) |
| `npx wrangler pages dev dist` | Local Cloudflare Pages emulation — required to exercise `functions/api/contact.ts` |

CI build command: `npm ci && npm run build`. Node 22 LTS, npm only.

## Environment variables

Secrets live **only** in the Cloudflare Pages project (never in the repo). The build and the
contact function read them from the environment at the appropriate time.

| Variable | Where | Scope | Purpose |
| :-- | :-- | :-- | :-- |
| `CONTACT_TO_EMAIL` | Cloudflare Pages env (secret) | Function (request-time) | Destination address for contact emails. Never bundled, never logged. |
| `CONTACT_FROM_EMAIL` | Cloudflare Pages env (secret) | Function (request-time) | Resend `from` address. Introduced so no email literal ever sits in the repo. |
| `RESEND_API_KEY` | Cloudflare Pages env (secret) | Function (request-time) | Resend API key (plain `fetch`, no SDK). |
| `TURNSTILE_SECRET_KEY` | Cloudflare Pages env (secret) | Function (request-time) | Server-side Turnstile siteverify secret. |
| `PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Pages env / repo | Client (public) | The **only** client-safe key — the Turnstile widget site key. |
| `GITHUB_TOKEN` | Cloudflare Pages **build** env (optional) | Build-time only | Fine-grained, read-only public-repo token to raise GitHub API rate limits. The site builds fine without it (graceful degradation). Never `PUBLIC_`-prefixed, never shipped to the client. |

GitLab is read **unauthenticated** from `gitlab.com` only (the personal account), read-only via the public API — no token, no remote, no self-hosted/company host.

### Local function testing

Cloudflare's official always-passing Turnstile **test** keys let you exercise the contact
contract locally without solving a real challenge:

```sh
npm run build
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA npx wrangler pages dev dist --port 8788
# client pair (always-passing site key): 1x00000000000000000000AA
```

POST `/api/contact` then returns the byte-exact contract responses:
`200 {"ok":true}`, `400 invalid_input`, `403 verification_failed`, `429 rate_limited`,
`500 internal`. A filled honeypot `website` field returns `200 {"ok":true}` with no email sent.

## Local pre-push secret scan (gitleaks)

A `gitleaks` secret scan also runs in CI (pinned by SHA), but catching a leak **before** it
reaches the remote is cheaper. Install [gitleaks](https://github.com/gitleaks/gitleaks) and
add a local pre-push hook:

```sh
# 1. install gitleaks (macOS): brew install gitleaks
# 2. create .git/hooks/pre-push (chmod +x) with:
#!/bin/sh
gitleaks protect --staged --redact --verbose || {
  echo "gitleaks: potential secret detected — push aborted." >&2
  exit 1
}
```

The hook is local (not committed); the CI gitleaks job is the enforced backstop. Never commit
`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, or the
deploy-hook URL.

## Launch checklist (owner, outside the repo)

1. Create the Cloudflare Pages project (build `npm ci && npm run build`, output `dist/`); pin the resulting production URL into `astro.config.mjs` `site` (currently a placeholder — affects sitemap/canonical/OG absolute URLs) and into `public/robots.txt` `Sitemap:`.
2. Set the Cloudflare env vars from the table above (`CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` as secrets; `PUBLIC_TURNSTILE_SITE_KEY`; optional build `GITHUB_TOKEN`).
3. Create a Cloudflare Deploy Hook and store it as the GitHub Actions secret `CLOUDFLARE_DEPLOY_HOOK` (consumed by the pre-existing daily data-refresh workflow).
4. Enable branch protection on `main` (PRs required; status checks: build + audit) and Dependabot alerts.
5. Confirm the personal values in `src/config/site.ts` and set this repo's git identity to the personal GitHub username + GitHub noreply email.

## CI

`.github/workflows/ci.yml` (on push/PR to `main`, `permissions: contents: read`): `npm ci` →
lint → typecheck → test → `npm audit --audit-level=high` → build → dist guards (email-leak,
email-protocol-link, inline-script, third-party-script, GitLab-host, islands-count, initial-JS
budget) → gitleaks (pinned by SHA) → Lighthouse CI (categories ≥ 0.95, LCP < 2000 ms, CLS < 0.1).
`.github/dependabot.yml` keeps npm + github-actions deps current weekly.
