import { redirect } from "next/navigation";
import { eq, count } from "drizzle-orm";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { getCurrentUser, initials, ROLE_LABEL } from "@/lib/auth";
import { getDb, schema } from "@/db";

/**
 * Never prerender anything behind the auth gate.
 *
 * Without this, whether the layout counts as dynamic depends on which auth
 * environment variables happen to exist at BUILD time: with none set, the gate
 * returns early before reading cookies, Next.js decides the page is static and
 * prerenders it — then a real request reads cookies and the page 500s with
 * DYNAMIC_SERVER_USAGE. The gate must run on every request, always.
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.feedbackItems)
    .where(eq(schema.feedbackItems.reviewStatus, "needs_review"));

  return (
    <div className="flex min-h-screen">
      <Sidebar reviewCount={n} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ name: user.name, role: ROLE_LABEL[user.role], initials: initials(user.name) }}
        />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-8 py-7 pb-20">
          {children}
        </main>
      </div>
    </div>
  );
}
