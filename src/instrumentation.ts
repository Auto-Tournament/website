// Runs once when the server starts, before it takes requests: database
// migrations and the licenses.json import (src/lib/db/startup.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startDatabase } = await import('./lib/db/startup');
  await startDatabase();
}
