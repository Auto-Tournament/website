import { describe, expect, it } from 'vitest';
import { consoleBase, consoleHref, consoleOnOwnHost, consoleUrl, routeRequest } from './urls';

const prod = { AUTH_URL: 'https://console.autotournament.gg' };
const dev = { AUTH_URL: 'http://localhost:4611' };

describe('console urls', () => {
  it('has its own host in production and /console in development', () => {
    expect(consoleOnOwnHost(prod)).toBe(true);
    expect(consoleOnOwnHost({})).toBe(true);
    expect(consoleOnOwnHost(dev)).toBe(false);
    expect(consoleBase(prod)).toBe('');
    expect(consoleBase(dev)).toBe('/console');
    expect(consoleHref('/', prod)).toBe('/');
    expect(consoleHref('/members', dev)).toBe('/console/members');
    expect(consoleUrl('/invite', prod)).toBe('https://console.autotournament.gg/invite');
    expect(consoleUrl('/', dev)).toBe('http://localhost:4611/console');
    expect(consoleBase({ AUTH_URL: 'javascript:alert(1)' })).toBe('');
  });
});

describe('host routing', () => {
  const route = (host: string, path: string, env = prod, search = '') => routeRequest(host, path, search, env);

  it('maps the console host onto /console', () => {
    expect(route('console.autotournament.gg', '/')).toEqual({ kind: 'rewrite', path: '/console' });
    expect(route('Console.AutoTournament.gg', '/members', prod, '?x=1')).toEqual({ kind: 'rewrite', path: '/console/members?x=1' });
    expect(route('console.autotournament.gg', '/console/members')).toEqual({ kind: 'redirect', location: 'https://console.autotournament.gg/members' });
    expect(route('console.autotournament.gg', '/api/auth/callback/google')).toEqual({ kind: 'next', console: true });
    expect(route('console.autotournament.gg', '/api/checkout')).toEqual({ kind: 'next', console: true });
    expect(route('console.autotournament.gg', '/api/stripe/webhook')).toEqual({ kind: 'not-found' });
    expect(route('console.autotournament.gg', '/at-icon.svg')).toEqual({ kind: 'next', console: true });
    expect(route('console.autotournament.gg', '/robots.txt')).toEqual({ kind: 'robots' });
  });

  it('sends /account and /console on the main site to the console, and keeps sign-in off it', () => {
    expect(route('autotournament.gg', '/account')).toEqual({ kind: 'redirect', location: 'https://console.autotournament.gg/' });
    expect(route('autotournament.gg', '/account/signin')).toEqual({ kind: 'redirect', location: 'https://console.autotournament.gg/' });
    expect(route('autotournament.gg', '/accounting')).toEqual({ kind: 'next', console: false });
    expect(route('autotournament.gg', '/console/licenses')).toEqual({ kind: 'redirect', location: 'https://console.autotournament.gg/licenses' });
    expect(route('autotournament.gg', '/api/auth/signin/email')).toEqual({ kind: 'not-found' });
    expect(route('autotournament.gg', '/pricing')).toEqual({ kind: 'next', console: false });
  });

  it('serves the console at /console in development', () => {
    expect(route('localhost:4611', '/console/members', dev)).toEqual({ kind: 'next', console: true });
    expect(route('localhost:4611', '/api/auth/session', dev)).toEqual({ kind: 'next', console: true });
    expect(route('localhost:4611', '/account', dev)).toEqual({ kind: 'redirect', location: 'http://localhost:4611/console' });
    expect(route('localhost:4611', '/', dev)).toEqual({ kind: 'next', console: false });
  });
});

describe('checkout from the console', () => {
  it('guests get checkout as before; console buyers get their org and customer or email', async () => {
    const { checkoutCustomerParams } = await import('./prefill');
    expect(checkoutCustomerParams(null)).toEqual({ customer_creation: 'always', metadata: {} });
    expect(checkoutCustomerParams({ orgId: 'o1', customer: 'cus_1', email: null })).toEqual({
      customer: 'cus_1',
      customer_update: { name: 'auto', address: 'auto' },
      metadata: { org_id: 'o1' },
    });
    expect(checkoutCustomerParams({ orgId: 'o1', customer: null, email: 'a@b.example' })).toEqual({
      customer_creation: 'always',
      customer_email: 'a@b.example',
      metadata: { org_id: 'o1' },
    });
  });
});
