import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const MAX_THEME_TITLE = 100;

export type RenameOutcome =
  | { ok: true; changed: false; title: string }
  | { ok: true; changed: true; oldTitle: string; title: string; roadmapUpdated: number }
  | { ok: false; error: string };

/** Trims and collapses inner whitespace, so "  Slow   boards " is "Slow boards". */
export function normaliseTitle(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Checks a proposed name. Returns an error message, or null when it is fine. */
export function validateTitle(title: string): string | null {
  if (!title) return "The theme needs a name.";
  if (title.length > MAX_THEME_TITLE) return `Keep the name under ${MAX_THEME_TITLE} characters.`;
  return null;
}

/**
 * Renames a theme and every roadmap item built from it, in one transaction.
 *
 * Feedback is never touched: items point at the theme by id, not by name, so a
 * rename cannot move or lose a single point.
 *
 * Names must be unique within the workspace (ignoring case). Two themes with the
 * same name would look like one, and the AI matches new feedback to existing
 * themes by name, so it could not tell them apart either.
 */
export async function renameTheme(
  workspaceId: string,
  themeId: string,
  rawTitle: string,
): Promise<RenameOutcome> {
  const title = normaliseTitle(rawTitle);
  const invalid = validateTitle(title);
  if (invalid) return { ok: false, error: invalid };

  const db = await getDb();
  const [theme] = await db
    .select({ id: schema.themes.id, title: schema.themes.title })
    .from(schema.themes)
    .where(and(eq(schema.themes.id, themeId), eq(schema.themes.workspaceId, workspaceId)))
    .limit(1);
  if (!theme) return { ok: false, error: "That theme no longer exists." };

  if (theme.title === title) return { ok: true, changed: false, title };

  const [clash] = await db
    .select({ title: schema.themes.title })
    .from(schema.themes)
    .where(
      and(
        eq(schema.themes.workspaceId, workspaceId),
        ne(schema.themes.id, themeId),
        sql`lower(${schema.themes.title}) = lower(${title})`,
      ),
    )
    .limit(1);
  if (clash) {
    return {
      ok: false,
      error: `Another theme is already called “${clash.title}”. If they are the same thing, merge them on the Themes page instead.`,
    };
  }

  let roadmapUpdated = 0;
  await db.transaction(async (tx) => {
    await tx.update(schema.themes).set({ title }).where(eq(schema.themes.id, themeId));
    const moved = await tx
      .update(schema.enhancements)
      .set({ title })
      .where(and(eq(schema.enhancements.themeId, themeId), eq(schema.enhancements.workspaceId, workspaceId)))
      .returning({ id: schema.enhancements.id });
    roadmapUpdated = moved.length;
  });

  return { ok: true, changed: true, oldTitle: theme.title, title, roadmapUpdated };
}
