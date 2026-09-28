import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * The shared database handle, from DATABASE_URL (set by docker-compose.yml).
 * Created on first use. Tests hand in their own (PGlite) with setDb.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let shared: Db | null = null;

export function databaseUrl(env: Record<string, string | undefined> = process.env): string | null {
  return env.DATABASE_URL?.trim() || null;
}

export function db(): Db {
  if (shared) return shared;
  const url = databaseUrl();
  if (!url) throw new Error('DATABASE_URL is not set');
  const client = postgres(url, { max: 10, idle_timeout: 60, connect_timeout: 10, onnotice: () => {} });
  shared = drizzle(client, { schema }) as unknown as Db;
  return shared;
}

/** Tests only. */
export function setDb(next: Db | null): void {
  shared = next;
}
