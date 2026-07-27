import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

async function main() {
  const client = new PGlite(); // in-memory, throwaway
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: "./drizzle" });

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: "Acme Group" })
    .returning();

  const [ws] = await db
    .insert(schema.workspaces)
    .values({ tenantId: tenant.id, name: "Acme App", description: "Customer platform" })
    .returning();

  await db.insert(schema.users).values([
    { tenantId: tenant.id, email: "jamie@acme.test", name: "Jamie Lee", role: "owner" },
    { tenantId: tenant.id, email: "riya@acme.test", name: "Riya Shah", role: "executive" },
  ]);

  const tables = await db.execute(
    sql`select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const users = await db.select().from(schema.users);

  console.log("workspace:", ws.name, "(" + ws.id.slice(0, 8) + ")");
  console.log(
    "users seeded:",
    users.length,
    "→",
    users.map((u) => `${u.name}/${u.role}`).join(", "),
  );
  console.log("public tables created:", (tables as unknown as { rows: { n: number }[] }).rows[0].n);
  console.log("DB SMOKE OK");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
