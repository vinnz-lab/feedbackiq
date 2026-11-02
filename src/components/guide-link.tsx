/** Download link for the getting-started PDF (served from /public, so it works without signing in). */
export function GuideLink({ className = "" }: { className?: string }) {
  return (
    <a
      href="/insight-hub-guide.pdf"
      download="Insight-Hub-Getting-Started.pdf"
      className={`inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo hover:underline ${className}`}
    >
      📄 Download the getting started guide (PDF)
    </a>
  );
}
