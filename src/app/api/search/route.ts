import { getWorkspaceContext } from "@/lib/workspace";
import { searchWorkspace } from "@/lib/search";

export const dynamic = "force-dynamic";

/** Search the signed-in person's current workspace. */
export async function GET(request: Request) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return Response.json({ error: "Not signed in." }, { status: 401 });
  const q = new URL(request.url).searchParams.get("q");
  const results = await searchWorkspace(ctx.workspace.id, q ?? "");
  return Response.json(results, { headers: { "Cache-Control": "no-store" } });
}
