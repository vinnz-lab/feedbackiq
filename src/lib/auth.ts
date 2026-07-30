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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getCurrentUser() {
  const jar = await cookies();
  const uid = jar.get(COOKIE)?.value;

  // A stale or tampered cookie must fail closed (→ /login), never crash the
  // request. Postgres rejects a non-UUID literal, which would otherwise 500
  // every gated page for that browser until the cookie was cleared by hand.
  if (!uid || !UUID_RE.test(uid)) return null;

  try {
    const db = await getDb();
    const [u] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, uid))
      .limit(1);
    return u ?? null;
  } catch {
    return null;
  }
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
}
