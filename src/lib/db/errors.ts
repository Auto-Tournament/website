/**
 * A database error, safe to log: the error's name and Postgres' error code
 * (such as 23505) and constraint, never the message. Drizzle's message quotes
 * the query's parameters, which can hold email addresses, hashes or keys.
 */
export function dbError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown error';
  const cause = (err as { cause?: { code?: unknown; constraint_name?: unknown; constraint?: unknown } }).cause;
  const code = typeof cause?.code === 'string' ? ` ${cause.code}` : '';
  const constraint = cause?.constraint_name ?? cause?.constraint;
  return `${err.name}${code}${typeof constraint === 'string' ? ` ${constraint}` : ''}`;
}
