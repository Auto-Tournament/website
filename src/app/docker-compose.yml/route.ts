import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Served as https://autotournament.gg/docker-compose.yml so the homepage can
// offer a one-line download. Keep it identical to the compose file in the
// docs install guide (docs repo: content/docs/getting-started/install.mdx).
export const dynamic = 'force-static';

export async function GET() {
  const body = await readFile(path.join(process.cwd(), 'src/content/docker-compose.yml'), 'utf8');
  return new Response(body, {
    headers: { 'content-type': 'text/yaml; charset=utf-8', 'content-disposition': 'inline; filename="docker-compose.yml"' },
  });
}
