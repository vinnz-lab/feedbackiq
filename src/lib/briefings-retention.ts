import { lt } from "drizzle-orm";
import { getDb, schema } from "@/db";

/** Daily clean-up, across all workspaces: deletes briefings (and their audio) past their 30-day expiry. */
export async function deleteExpiredBriefings(): Promise<number> {
  const db = await getDb();
  const gone = await db.delete(schema.audioBriefings).where(lt(schema.audioBriefings.expiresAt, new Date())).returning({ id: schema.audioBriefings.id });
  return gone.length;
}
