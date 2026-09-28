import { defineConfig } from 'drizzle-kit';

// `yarn db:generate` writes a new SQL migration to ./drizzle after a change to
// the schema. The app runs pending migrations itself at startup.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
});
