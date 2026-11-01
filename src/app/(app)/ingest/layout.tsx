import Link from "next/link";
import { currentCan } from "@/lib/permissions";

/** Viewers can't add feedback, so they get an explanation instead of the upload page. */
export default async function IngestLayout({ children }: { children: React.ReactNode }) {
  if (await currentCan("edit")) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-7 text-center shadow-[var(--shadow)]">
      <div className="text-[16px] font-semibold">👁 View only</div>
      <p className="mt-1.5 text-[13px] text-muted">
        Your role in this workspace lets you look at everything but not add feedback. Ask the workspace owner if
        you need more access.
      </p>
      <Link href="/dashboard" className="mt-4 inline-block text-[13px] font-semibold text-indigo">
        ← Back to the dashboard
      </Link>
    </div>
  );
}
