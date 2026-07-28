"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateDigest } from "@/app/(app)/digest/actions";

export function GenerateDigestButton() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await generateDigest();
            if (r.ok) router.refresh();
            else setErr(r.error ?? "Failed");
          })
        }
        className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-50"
      >
        {pending ? "✨ Writing digest…" : "✨ Generate weekly digest"}
      </button>
      {err && <span className="text-[12px] text-rose">⚠ {err}</span>}
    </div>
  );
}
