"use client";

import { useState } from "react";
import { QUOTE_PREVIEW_CHARS, previewQuote } from "@/components/review-card";

/** Table-cell quote that collapses long text (e.g. whole transcripts). */
export function ExpandableQuote({ quote }: { quote: string }) {
  const [open, setOpen] = useState(false);
  const isLong = quote.length > QUOTE_PREVIEW_CHARS;
  return (
    <div>
      <div className="whitespace-pre-line">
        “{isLong && !open ? previewQuote(quote) + "…" : quote}”
      </div>
      {isLong && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1 text-[12px] font-semibold text-indigo hover:underline"
        >
          {open ? "Show less" : `Read more (${quote.length.toLocaleString()} characters)`}
        </button>
      )}
    </div>
  );
}
