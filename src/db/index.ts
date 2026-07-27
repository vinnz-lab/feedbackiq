import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * One data layer, two backends:
 *  - Local/dev: in-process PGlite (a real Postgres, no server) persisted to ./.pglite
 *  - Prod:      postgres-js against DATABASE_URL (Supabase)
 * Drivers are dynamically imported so PGlite's WASM is never bundled into prod.
 */
type DB = PgliteDatabase<typeof schema>;

let _dbPromise: Promise<DB> | undefined;

async function init(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    const [{ drizzle }, postgres] = await Promise.all([
      import("drizzle-orm/postgres-js"),
      import("postgres"),
    ]);
    const client = postgres.default(process.env.DATABASE_URL, { prepare: false });
    return drizzle(client, { schema }) as unknown as DB;
  }
  const [{ drizzle }, { PGlite }] = await Promise.all([
    import("drizzle-orm/pglite"),
    import("@electric-sql/pglite"),
  ]);
  const client = new PGlite(process.env.PGLITE_DIR || "./.pglite");
  return drizzle(client, { schema });
}

// Memoize the promise (not the value) so concurrent callers share one instance.
export function getDb(): Promise<DB> {
  return (_dbPromise ??= init());
}

export { schema };
