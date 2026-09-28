import { describe, expect, it } from 'vitest';
import { sameOrigin, siteUrl } from './site';

const h = (init: Record<string, string>) => new Headers(init);

describe('siteUrl', () => {
  it('defaults to autotournament.gg and keeps only the origin', () => {
    expect(siteUrl('')).toBe('https://autotournament.gg');
    expect(siteUrl('http://localhost:4611/x')).toBe('http://localhost:4611');
    expect(siteUrl('ftp://example.com')).toBeNull();
    expect(siteUrl('not a url')).toBeNull();
  });
});

describe('sameOrigin', () => {
  const site = 'https://autotournament.gg';
  it('allows our own pages', () => {
    expect(sameOrigin(h({ origin: site, 'sec-fetch-site': 'same-origin' }), site)).toBe(true);
    expect(sameOrigin(h({ origin: 'http://localhost:4611', host: 'localhost:4611' }), site)).toBe(true);
    expect(sameOrigin(h({}), site)).toBe(true);
  });
  it('refuses other sites', () => {
    expect(sameOrigin(h({ origin: 'https://evil.example', host: 'autotournament.gg' }), site)).toBe(false);
    expect(sameOrigin(h({ 'sec-fetch-site': 'cross-site' }), site)).toBe(false);
    expect(sameOrigin(h({ 'sec-fetch-site': 'same-site', origin: 'https://docs.autotournament.gg' }), site)).toBe(false);
    expect(sameOrigin(h({ origin: 'null' }), site)).toBe(false);
  });
});
