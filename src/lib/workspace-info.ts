import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getWorkspaceContext } from "@/lib/workspace";

/** Names shown around the app, for the CURRENT workspace. */
export const getWorkspaceInfo = cache(async () => {
  const fallback = { tenantName: "", workspaceName: "Workspace", workspaceSub: "" };
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return fallback;
    const ws = ctx.workspace;
    const db = await getDb();
    const [tenant] = await db
      .select({ name: schema.tenants.name })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, ws.tenantId))
      .limit(1);
    return { tenantName: tenant?.name ?? "", workspaceName: ws.name, workspaceSub: ws.description ?? "" };
  } catch {
    // A failed lookup should never take a page down over a label.
    return fallback;
  }
});
