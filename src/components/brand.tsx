/** Insight Hub brand marks (vector, so they stay sharp at any size). */

/** The app icon: "iH" with an insight spark. Used in the sidebar and as the favicon (src/app/icon.svg). */
export function BrandIcon({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" viewBox="0 0 64 64"><defs><linearGradient id="ih-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4F46E5"/><stop offset="1" stopColor="#7C3AED"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="url(#ih-g)"/><g fill="#fff"><path d="M20 9.5c.9 3.4 2.1 4.6 5.5 5.5-3.4.9-4.6 2.1-5.5 5.5-.9-3.4-2.1-4.6-5.5-5.5 3.4-.9 4.6-2.1 5.5-5.5z"/><rect x="15.5" y="24" width="9" height="28" rx="2.5"/><rect x="23" y="34" width="19" height="7.5"/><rect x="39.5" y="14" width="9" height="38" rx="2.5"/></g></svg>
  );
}

/** The hub mark: many sources feeding one insight. Used with the wordmark on sign-in pages. */
export function HubMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" viewBox="0 0 64 64"><line x1="32" y1="32" x2="32.00" y2="10.00" stroke="#4F46E5" strokeWidth="3"/><circle cx="32.00" cy="8.00" r="5.5" fill="#4F46E5"/><line x1="32" y1="32" x2="51.05" y2="21.00" stroke="#4F46E5" strokeWidth="3"/><circle cx="52.78" cy="20.00" r="5.5" fill="#4F46E5"/><line x1="32" y1="32" x2="51.05" y2="43.00" stroke="#4F46E5" strokeWidth="3"/><circle cx="52.78" cy="44.00" r="5.5" fill="#4F46E5"/><line x1="32" y1="32" x2="32.00" y2="54.00" stroke="#4F46E5" strokeWidth="3"/><circle cx="32.00" cy="56.00" r="5.5" fill="#4F46E5"/><line x1="32" y1="32" x2="12.95" y2="43.00" stroke="#4F46E5" strokeWidth="3"/><circle cx="11.22" cy="44.00" r="5.5" fill="#4F46E5"/><line x1="32" y1="32" x2="12.95" y2="21.00" stroke="#4F46E5" strokeWidth="3"/><circle cx="11.22" cy="20.00" r="5.5" fill="#4F46E5"/><circle cx="32" cy="32" r="14" fill="#4F46E5"/><path d="M22.5 32c2.6-4.4 5.8-6.4 9.5-6.4s6.9 2 9.5 6.4c-2.6 4.4-5.8 6.4-9.5 6.4s-6.9-2-9.5-6.4z" fill="#fff"/><circle cx="32" cy="32" r="3.6" fill="#8B5CF6"/></svg>
  );
}

/** Full logo: hub mark + "Insight Hub" wordmark. */
export function FullLogo({ size = 40 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center gap-2.5" aria-label="Insight Hub">
      <HubMark size={size} />
      <span className="text-[24px] tracking-tight" style={{ color: "#4F46E5" }}>
        <span className="font-extrabold">Insight</span> <span className="font-medium">Hub</span>
      </span>
    </div>
  );
}
