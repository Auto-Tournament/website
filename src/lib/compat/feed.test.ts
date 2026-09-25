import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { COMPAT_MAX_BYTES } from './document';
import { fetchCompatFeed } from './feed';
import { compatDoc } from './testDoc';

// Ported from the platform's COMPAT_FEED_URL tests: a local server that
// answers, lags, 304s, oversizes and lies.

let server: http.Server;
let origin = '';
const body = JSON.stringify(compatDoc());

beforeAll(async () => {
  server = http.createServer((req, res) => {
    switch (req.url) {
      case '/ok.json':
        if (req.headers['if-none-match'] === '"v1"') {
          res.writeHead(304).end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', ETag: '"v1"' }).end(body);
        return;
      case '/slow.json':
        setTimeout(() => res.writeHead(200).end(body), 2_000).unref();
        return;
      case '/big.json':
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('x'.repeat(COMPAT_MAX_BYTES + 1));
        return;
      case '/big-chunked.json':
        // No Content-Length: the cap has to hold while streaming.
        res.writeHead(200, { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' });
        for (let i = 0; i < 40; i++) res.write('x'.repeat(8 * 1024));
        res.end();
        return;
      case '/html':
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html></html>');
        return;
      case '/invalid.json':
        res.writeHead(200).end(JSON.stringify({ ...JSON.parse(body), overall: 'great' }));
        return;
      default:
        res.writeHead(404).end('404: Not Found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('compat feed', () => {
  it('reads a valid document and honours its ETag', async () => {
    const first = await fetchCompatFeed(`${origin}/ok.json`);
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') return;
    expect(first.etag).toBe('"v1"');
    expect(first.document.overall).toBe('pass');
    expect(await fetchCompatFeed(`${origin}/ok.json`, { etag: first.etag })).toEqual({ status: 'not_modified' });
  });

  it('fails cleanly on a timeout, an oversized, non-JSON or invalid file, or an error status', async () => {
    expect(await fetchCompatFeed(`${origin}/slow.json`, { timeoutMs: 200 })).toEqual({ status: 'error', error: 'it did not answer in time' });
    expect(await fetchCompatFeed(`${origin}/big.json`)).toEqual({ status: 'error', error: `it is larger than ${COMPAT_MAX_BYTES} bytes` });
    expect(await fetchCompatFeed(`${origin}/big-chunked.json`)).toEqual({ status: 'error', error: `it is larger than ${COMPAT_MAX_BYTES} bytes` });
    expect(await fetchCompatFeed(`${origin}/html`)).toEqual({ status: 'error', error: 'the response is not JSON' });
    const invalid = await fetchCompatFeed(`${origin}/invalid.json`);
    expect(invalid.status).toBe('error');
    if (invalid.status === 'error') expect(invalid.error).toContain('overall');
    expect(await fetchCompatFeed(`${origin}/missing.json`)).toEqual({ status: 'error', error: 'HTTP 404' });
  });
});
