"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-loads the page's data every few seconds while something is still being made. */
export function RefreshWhilePending({ pending, everyMs = 4000 }: { pending: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(t);
  }, [pending, everyMs, router]);
  return null;
}
