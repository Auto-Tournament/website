import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

let ipCounter = 0;
const nextIp = () => `10.9.0.${(ipCounter += 1) % 250}`;

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('http://localhost/api/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': nextIp(), ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const valid = {
  name: 'Jane Doe',
  email: 'jane@example.com',
  organization: 'Example LAN',
  topic: 'quote',
  numServers: '50',
  eventDates: '',
  message: 'We are planning a 50-server event, what would that cost?',
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/contact: without POSTMARK_SERVER_TOKEN', () => {
  it('answers 503, without reading or validating the body', async () => {
    vi.stubEnv('POSTMARK_SERVER_TOKEN', '');
    const res = await post(valid);
    expect(res.status).toBe(503);
  });
});

describe('POST /api/contact: same-origin', () => {
  beforeEach(() => vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token'));

  it('rejects a cross-site request', async () => {
    const res = await post(valid, { 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/contact: validation', () => {
  beforeEach(() => vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token'));

  it('rejects a missing name', async () => {
    const res = await post({ ...valid, name: '' });
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeTruthy();
  });

  it('rejects an invalid email', async () => {
    const res = await post({ ...valid, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('rejects an unknown topic', async () => {
    const res = await post({ ...valid, topic: 'bogus' });
    expect(res.status).toBe(400);
  });

  it('rejects a message over the length limit', async () => {
    const res = await post({ ...valid, message: 'x'.repeat(5001) });
    expect(res.status).toBe(400);
  });

  it('rejects a non-JSON content type', async () => {
    const res = await POST(
      new Request('http://localhost/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': nextIp() },
        body: 'hello',
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/contact: honeypot', () => {
  beforeEach(() => vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token'));

  it('pretends success and never tries to send when the honeypot is filled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await post({ ...valid, website: 'http://spam.example' });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { message: string };
    expect(data.message).toMatch(/2 working days/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('pretends success even when the rest of the body is invalid', async () => {
    const res = await post({ website: 'yes' });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/contact: rate limit', () => {
  beforeEach(() => vi.stubEnv('POSTMARK_SERVER_TOKEN', 'test-token'));

  it('allows 5 attempts per IP in the window, then answers 429', async () => {
    const ip = 'rate-limit-test-ip';
    const attempt = () => post({ ...valid, name: '' }, { 'x-forwarded-for': ip });
    for (let i = 0; i < 5; i += 1) {
      const res = await attempt();
      expect(res.status).toBe(400);
    }
    const res = await attempt();
    expect(res.status).toBe(429);
  });
});
