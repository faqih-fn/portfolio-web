import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { onRequestPost, __resetRateLimit } from './contact';

interface ContactEnv {
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO_EMAIL?: string;
  CONTACT_FROM_EMAIL?: string;
}

const PASS_ENV: ContactEnv = {
  TURNSTILE_SECRET_KEY: 'test-secret',
  RESEND_API_KEY: 'test-resend-key',
  // RFC-2606 fixture domains only — never the owner's address.
  CONTACT_TO_EMAIL: 'owner@example.com',
  CONTACT_FROM_EMAIL: 'noreply@example.com',
};

function makeRequest(body: unknown, ip = '203.0.113.10'): Request {
  return new Request('https://site.example/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const validBody = {
  name: 'Jane Tester',
  email: 'jane@example.com',
  message: 'This is a valid contact message of sufficient length.',
  turnstileToken: 'tok-123',
  website: '',
};

// Configurable global fetch stub: routes Turnstile siteverify and Resend by URL.
function stubFetch(opts: {
  turnstileSuccess?: boolean;
  turnstileOk?: boolean;
  resendOk?: boolean;
}): ReturnType<typeof vi.fn> {
  const { turnstileSuccess = true, turnstileOk = true, resendOk = true } = opts;
  const fn = vi.fn(async (url: string) => {
    if (String(url).includes('siteverify')) {
      return {
        ok: turnstileOk,
        status: turnstileOk ? 200 : 500,
        json: async () => ({ success: turnstileSuccess }),
      } as unknown as Response;
    }
    if (String(url).includes('api.resend.com')) {
      return {
        ok: resendOk,
        status: resendOk ? 200 : 500,
        json: async () => ({}),
      } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function bodyOf(res: Response): Promise<string> {
  return await res.text();
}

describe('onRequestPost — contact pipeline contract', () => {
  beforeEach(() => {
    __resetRateLimit();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('empty body -> 400 invalid_input', async () => {
    stubFetch({});
    const res = await onRequestPost({ request: makeRequest('{}'), env: PASS_ENV });
    expect(res.status).toBe(400);
    expect(await bodyOf(res)).toBe('{"ok":false,"error":"invalid_input"}');
  });

  it('invalid body (short message) -> 400 invalid_input', async () => {
    stubFetch({});
    const res = await onRequestPost({
      request: makeRequest({ ...validBody, message: 'short' }),
      env: PASS_ENV,
    });
    expect(res.status).toBe(400);
    expect(await bodyOf(res)).toBe('{"ok":false,"error":"invalid_input"}');
  });

  it('failing Turnstile siteverify -> 403 verification_failed', async () => {
    stubFetch({ turnstileSuccess: false });
    const res = await onRequestPost({ request: makeRequest(validBody), env: PASS_ENV });
    expect(res.status).toBe(403);
    expect(await bodyOf(res)).toBe('{"ok":false,"error":"verification_failed"}');
  });

  it('filled honeypot -> 200 {ok:true} with NO Resend send (F-04.8)', async () => {
    const fn = stubFetch({});
    const res = await onRequestPost({
      request: makeRequest({ ...validBody, website: 'filled-by-bot' }),
      env: PASS_ENV,
    });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toBe('{"ok":true}');
    const resendCalls = fn.mock.calls.filter((c) =>
      String(c[0]).includes('api.resend.com'),
    );
    expect(resendCalls).toHaveLength(0);
  });

  it('6th POST from the same IP within the window -> 429 rate_limited (D-8)', async () => {
    stubFetch({});
    const ip = '198.51.100.7';
    for (let i = 0; i < 5; i++) {
      const ok = await onRequestPost({ request: makeRequest(validBody, ip), env: PASS_ENV });
      expect(ok.status).toBe(200);
    }
    const sixth = await onRequestPost({ request: makeRequest(validBody, ip), env: PASS_ENV });
    expect(sixth.status).toBe(429);
    expect(await bodyOf(sixth)).toBe('{"ok":false,"error":"rate_limited"}');
  });

  it('Resend send failure -> 500 internal (generic, no detail)', async () => {
    stubFetch({ resendOk: false });
    const res = await onRequestPost({ request: makeRequest(validBody), env: PASS_ENV });
    expect(res.status).toBe(500);
    expect(await bodyOf(res)).toBe('{"ok":false,"error":"internal"}');
  });

  it('happy path -> 200 {ok:true} with a Resend send', async () => {
    const fn = stubFetch({});
    const res = await onRequestPost({ request: makeRequest(validBody), env: PASS_ENV });
    expect(res.status).toBe(200);
    expect(await bodyOf(res)).toBe('{"ok":true}');
    const resendCalls = fn.mock.calls.filter((c) =>
      String(c[0]).includes('api.resend.com'),
    );
    expect(resendCalls).toHaveLength(1);
  });
});
