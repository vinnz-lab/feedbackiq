import { randomInt } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isPlatformAdmin } from "@/lib/platform";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Resetting someone else's password — who may, and how.
 *
 * WHY THIS IS STRICT: one account can belong to several workspaces. If any
 * workspace owner could reset anyone in their team, a tester who owns their
 * own workspace could invite (say) Tom, reset Tom's password, sign in as him,
 * and see every OTHER workspace Tom belongs to. So:
 *  - nobody resets their own password this way (Settings → Your account);
 *  - nobody can reset the platform owner's password;
 *  - the platform owner may reset anyone else in a workspace they're in;
 *  - any other workspace owner only people who belong to THEIR workspace alone.
 */
export type ResetDecision = { ok: true } | { ok: false; reason: string };

export function canResetPassword(opts: {
  actorIsPlatformAdmin: boolean;
  actorRoleHere: string;
  actorId: string;
  targetId: string;
  targetIsPlatformAdmin: boolean;
  /** How many workspaces the target belongs to in total. */
  targetWorkspaceCount: number;
}): ResetDecision {
  if (opts.targetId === opts.actorId) return { ok: false, reason: "Change your own password in Settings → Your account." };
  if (opts.targetIsPlatformAdmin) return { ok: false, reason: "The platform owner's password can only be changed by them." };
  if (opts.actorIsPlatformAdmin) return { ok: true };
  if (opts.actorRoleHere !== "owner") return { ok: false, reason: "Only the workspace owner can reset passwords." };
  if (opts.targetWorkspaceCount > 1) {
    return { ok: false, reason: "They also belong to another workspace, so only the platform owner can reset their password." };
  }
  return { ok: true };
}

export async function workspaceCountFor(userId: string): Promise<number> {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId));
  return Number(n);
}

/** Readable but strong: no look-alike characters, so it survives being typed. */
export function generateTempPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Finds the sign-in (Supabase identity) for an email. */
async function findAuthUser(email: string) {
  const admin = createSupabaseAdminClient();
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Couldn't look up the account: ${error.message}`);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Sets a temporary password and marks the account "must choose a new one".
 * The mark lives in app_metadata, which only the server can change — so the
 * person can't skip the "choose your own password" step.
 */
export async function setTemporaryPassword(email: string): Promise<string> {
  const u = await findAuthUser(email);
  if (!u) throw new Error("That person doesn't have a sign-in yet.");
  const temp = generateTempPassword();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(u.id, {
    password: temp,
    app_metadata: { ...(u.app_metadata ?? {}), must_change_password: true },
  });
  if (error) throw new Error(`Couldn't reset the password: ${error.message}`);
  return temp;
}

/** Clears the mark once they've chosen their own password. */
export async function clearMustChangePassword(authUserId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.auth.admin.getUserById(authUserId);
  const { error } = await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: { ...(data.user?.app_metadata ?? {}), must_change_password: false },
  });
  if (error) throw new Error(error.message);
}

export { isPlatformAdmin };
