import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const COOKIE = "fiq_uid";

export const ROLE_LABEL: Record<string, string> = {
  owner: "Product Owner",
  contributor: "Contributor",
  executive: "Executive",
  engineer: "Engineer",
};

export async function listUsers() {
  const db = await getDb();
  return db.select().from(schema.users).orderBy(schema.users.createdAt);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const uid = jar.get(COOKIE)?.value;
  if (!uid) return null;
  const db = await getDb();
  const [u] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, uid))
    .limit(1);
  return u ?? null;
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
}
