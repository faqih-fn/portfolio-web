// functions/api/contact.ts
// Cloudflare Pages Function — privacy-preserving contact pipeline (F-04, D-7/D-8/D-9).
//
// onRequestPost executes in THIS EXACT order:
//   1. zod validation                         -> 400 invalid_input
//   2. server-side Turnstile siteverify       -> 403 verification_failed
//   3. honeypot check (non-empty website)     -> 200 {"ok":true} with NO Resend call (F-04.8)
//   4. per-IP sliding-window rate limit        -> 429 rate_limited (max 5 / 10 min, D-8)
//   5. Resend send (plain fetch, no SDK)       -> 500 internal on failure (D-9)
//   6. generic success                         -> 200 {"ok":true}
//
// Secrets are read from env AT REQUEST TIME ONLY (never module scope, never logged).
// No email-like literal appears in this file — the `from`/`to` addresses come from env
// (CONTACT_FROM_EMAIL / CONTACT_TO_EMAIL), keeping the email-pattern grep clean (D-9, §7).
//
// IMPLEMENTATION TRAP (D-7): `website` is typed as a plain bounded string, NOT enforced
// to equal '' — otherwise a bot-filled honeypot would 400 at step 1 and never reach the
// silent-accept path. The "must be empty" rule is enforced at step 3 (silent 200).

import { z } from 'zod';

interface ContactEnv {
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
}

// Minimal Pages Function context shape (no @cloudflare/workers-types dependency needed).
interface PagesContext {
  request: Request;
  env: ContactEnv;
}

const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const RESEND_API_URL = 'https://api.resend.com/emails';

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes (D-8)

// In-memory per-isolate sliding window keyed by CF-Connecting-IP (D-8). Best-effort:
// resets on cold start, not shared across isolates — accepted for v1 (Resend 100/day cap).
const ipHits = new Map<string, number[]>();

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  // RFC-valid email, <= 254 chars.
  email: z.string().email().max(254),
  message: z.string().min(10).max(3000),
  turnstileToken: z.string().min(1),
  // Honeypot: a plain bounded string, NOT enforced === '' (D-7 trap). Optional/defaulted
  // so a missing field is treated as empty.
  website: z.string().max(200).optional().default(''),
});

const headers = { 'Content-Type': 'application/json' } as const;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const OK = { ok: true } as const;
const ERR_INVALID = { ok: false, error: 'invalid_input' } as const;
const ERR_VERIFY = { ok: false, error: 'verification_failed' } as const;
const ERR_RATE = { ok: false, error: 'rate_limited' } as const;
const ERR_INTERNAL = { ok: false, error: 'internal' } as const;

function coarseIp(ip: string): string {
  // Log only a coarse IP (drop the last octet for IPv4) — never the full address.
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  return v4 ? `${v4[1]}.x` : 'ip';
}

function log(outcome: number, ip: string): void {
  // Logging limited to timestamp + outcome code + coarse IP (baseline §3b). No PII, no secrets.
  console.log(`[contact] ${new Date().toISOString()} status=${outcome} ip=${coarseIp(ip)}`);
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  return false;
}

async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (ip) body.set('remoteip', ip);
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

async function sendEmail(
  env: ContactEnv,
  input: { name: string; email: string; message: string },
  fetchImpl: typeof fetch,
): Promise<boolean> {
  // Addresses come from env — never literals (D-9). Throws/false on any failure.
  const to = env.CONTACT_TO_EMAIL;
  const from = env.CONTACT_FROM_EMAIL;
  const apiKey = env.RESEND_API_KEY;
  if (!to || !from || !apiKey) return false;

  try {
    const res = await fetchImpl(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: [to],
        from,
        reply_to: input.email,
        subject: `Portfolio contact from ${input.name}`,
        text: input.message,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  const doFetch: typeof fetch = fetch;

  // ---- Step 1: zod validation -> 400 ----
  let parsed: z.infer<typeof contactSchema>;
  try {
    const raw = (await request.json()) as unknown;
    const result = contactSchema.safeParse(raw);
    if (!result.success) {
      log(400, ip);
      return json(400, ERR_INVALID);
    }
    parsed = result.data;
  } catch {
    // Malformed/empty JSON body.
    log(400, ip);
    return json(400, ERR_INVALID);
  }

  // ---- Step 2: server-side Turnstile siteverify -> 403 ----
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Misconfiguration: never accept unverified input. Generic verification failure.
    log(403, ip);
    return json(403, ERR_VERIFY);
  }
  const verified = await verifyTurnstile(parsed.turnstileToken, secret, ip, doFetch);
  if (!verified) {
    log(403, ip);
    return json(403, ERR_VERIFY);
  }

  // ---- Step 3: honeypot -> silent 200, NO send (F-04.8, D-7) ----
  if (parsed.website.trim() !== '') {
    log(200, ip);
    return json(200, OK);
  }

  // ---- Step 4: per-IP rate limit -> 429 (D-8) ----
  if (rateLimited(ip)) {
    log(429, ip);
    return json(429, ERR_RATE);
  }

  // ---- Step 5: Resend send -> 500 on failure (D-9) ----
  const sent = await sendEmail(
    env,
    { name: parsed.name, email: parsed.email, message: parsed.message },
    doFetch,
  );
  if (!sent) {
    log(500, ip);
    return json(500, ERR_INTERNAL);
  }

  // ---- Step 6: generic success -> 200 ----
  log(200, ip);
  return json(200, OK);
}

// Test-only hook: reset the in-memory rate-limit map between unit tests.
export function __resetRateLimit(): void {
  ipHits.clear();
}
