import Link from "next/link";

/** Small "Privacy" link for page footers. */
export function PrivacyLink({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-[11.5px] text-muted ${className}`}>
      <Link href="/privacy" className="hover:text-fg hover:underline">
        Privacy
      </Link>
    </p>
  );
}
