import { getWorkspaceContext } from "@/lib/workspace";
import { getNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** The bell's feed for the signed-in person's current workspace. */
export async function GET() {
  const ctx = await getWorkspaceContext();
  if (!ctx) return Response.json({ error: "Not signed in." }, { status: 401 });
  const feed = await getNotifications(ctx.workspace.id, ctx.user.id);
  return Response.json({ workspaceId: ctx.workspace.id, ...feed }, { headers: { "Cache-Control": "no-store" } });
}
