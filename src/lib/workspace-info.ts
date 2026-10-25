import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Names shown around the app, read from the database so each deployment shows
 * its own workspace instead of the demo's hardcoded "Acme App".
 */
export const getWorkspaceInfo = cache(async () => {
  try {
    const db = await getDb();
    const [ws] = await db.select().from(schema.workspaces).limit(1);
    if (!ws) return { tenantName: "", workspaceName: "Workspace", workspaceSub: "" };
    const [tenant] = await db
      .select({ name: schema.tenants.name })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, ws.tenantId))
      .limit(1);
    return {
      tenantName: tenant?.name ?? "",
      workspaceName: ws.name,
      workspaceSub: ws.description ?? "",
    };
  } catch {
    // A failed lookup should never take a page down over a label.
    return { tenantName: "", workspaceName: "Workspace", workspaceSub: "" };
  }
});
