import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * Writes `body` to dir/fileName atomically: a temporary file (mode 600,
 * synced to disk) renamed over the old one. The directory is created mode 700.
 */
export async function writeFileAtomic(dir: string, fileName: string, body: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, fileName);
  const tmp = path.join(dir, `.${fileName}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    const handle = await open(tmp, 'w', 0o600);
    try {
      await handle.writeFile(body, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, file);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
