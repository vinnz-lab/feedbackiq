// Run: npx tsx scripts/password-test.ts
import { readFileSync } from "node:fs";
import { checkNewPassword, performPasswordChange, type AuthLike } from "../src/lib/password.ts";
let fail = 0;
const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };

// A pretend Supabase that records what it was asked to do.
function fakeAuth(realPassword: string) {
  const calls: string[] = [];
  let pw = realPassword;
  const auth: AuthLike = {
    async signInWithPassword({ password }) { calls.push("verify"); return { error: password === pw ? null : { message: "Invalid login credentials" } }; },
    async updateUser({ password }) { calls.push("update"); pw = password; return { error: null }; },
    async signOut() { calls.push("signout-others"); return {}; },
  };
  return { auth, calls, current: () => pw };
}

async function main() {
  check("too short refused", checkNewPassword("old-password-1", "short", "short") !== null);
  check("mismatch refused", /don't match/.test(checkNewPassword("old-password-1", "new-password-1", "new-password-2") ?? ""));
  check("same as current refused", /different/.test(checkNewPassword("same-password-1", "same-password-1", "same-password-1") ?? ""));
  check("leading space refused", checkNewPassword("old-password-1", " new-password-1", " new-password-1") !== null);
  check("a good one passes", checkNewPassword("old-password-1", "brand-new-pass-9", "brand-new-pass-9") === null);

  let f = fakeAuth("old-password-1");
  let r = await performPasswordChange(f.auth, "a@b.c", "WRONG-password", "brand-new-pass-9", "brand-new-pass-9");
  check("wrong current password is refused", !r.ok && /isn't right/.test(r.ok ? "" : r.error));
  check("…and the password was NOT changed", f.current() === "old-password-1" && !f.calls.includes("update"), f.calls.join(","));

  f = fakeAuth("old-password-1");
  r = await performPasswordChange(f.auth, "a@b.c", "old-password-1", "short", "short");
  check("a rule failure sends nothing to Supabase at all", !r.ok && f.calls.length === 0, f.calls.join(","));

  f = fakeAuth("old-password-1");
  r = await performPasswordChange(f.auth, "a@b.c", "old-password-1", "brand-new-pass-9", "brand-new-pass-9");
  check("the right current password changes it", r.ok && f.current() === "brand-new-pass-9");
  check("order: verify → update → sign out other devices", f.calls.join(",") === "verify,update,signout-others", f.calls.join(","));

  const act = readFileSync("src/app/(app)/settings/account-actions.ts", "utf8");
  check("the action uses this tested function", /performPasswordChange\(/.test(act));
  check("the action only changes the SIGNED-IN person's password (no email from the form)", /const email = ctx\.user\.email/.test(act) && !/formData\.get\("email"\)/.test(act));

  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
