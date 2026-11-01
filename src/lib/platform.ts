/**
 * The platform owner: the person who runs Insight Hub and may create workspaces.
 *
 * Set by environment variable, not in the database, so it can't be granted
 * through the app itself. PLATFORM_ADMIN_EMAILS is a comma-separated list; if it
 * isn't set, the bootstrap owner (BOOTSTRAP_OWNER_EMAIL) is the platform owner.
 * If neither is set, nobody can create workspaces (fails closed).
 *
 * Being the platform owner does NOT grant access to other people's workspaces.
 * It only allows creating new ones, of which you become the owner.
 */
export function platformAdminEmails(): string[] {
  const raw = process.env.PLATFORM_ADMIN_EMAILS || process.env.BOOTSTRAP_OWNER_EMAIL || "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return platformAdminEmails().includes(email.trim().toLowerCase());
}
