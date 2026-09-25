/**
 * Reads a request or response body as UTF-8 text, at most `limit` bytes.
 * Returns null when it is larger (by its Content-Length, or once more than
 * `limit` bytes have arrived), without reading the rest. Throws on a broken
 * stream or invalid UTF-8.
 */
export async function readCapped(message: Pick<Request, 'headers' | 'body'>, limit: number): Promise<string | null> {
  const declared = Number(message.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!message.body) return '';
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
