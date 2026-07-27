import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { rmSync } from "node:fs";
import * as schema from "../src/db/schema";
import { seed } from "../src/db/seed";

async function main() {
  const dir = process.env.PGLITE_DIR || "./.pglite";
  rmSync(dir, { recursive: true, force: true }); // fresh dev DB each run
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const res = await seed(db);
  await client.close();
  console.log("DB SETUP OK", res);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
