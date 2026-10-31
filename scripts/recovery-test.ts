// Run: npx tsx scripts/recovery-test.ts
import { readFileSync } from "node:fs";
async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean) => { console.log(`${ok ? "✓" : "✗"} ${n}`); if (!ok) fail++; };
  delete process.env.RECOVERY_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_SECRET_KEY;
  const r = await import("../src/lib/recovery.ts");
  check("no server secret configured → no proof can be issued (fails closed)", r.issueRecoveryToken("u1") === null);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "server-secret";
  const t = r.issueRecoveryToken("user-a")!;
  check("a genuine proof is accepted for its own user", r.verifyRecoveryToken(t, "user-a"));
  check("…but not for anyone else", !r.verifyRecoveryToken(t, "user-b"));
  check("…and not once expired (15 minutes)", !r.verifyRecoveryToken(t, "user-a", Date.now() + 16 * 60 * 1000));
  const [uid, exp, mac] = t.split(".");
  check("changing the expiry breaks it", !r.verifyRecoveryToken(`${uid}.${Number(exp) + 99999}.${mac}`, "user-a"));
  check("changing the signature breaks it", !r.verifyRecoveryToken(`${uid}.${exp}.${"0".repeat(mac.length)}`, "user-a"));
  check("garbage is rejected", !r.verifyRecoveryToken("not.a.token.at.all", "user-a") && !r.verifyRecoveryToken(undefined, "user-a"));
  process.env.SUPABASE_SERVICE_ROLE_KEY = "a-different-secret";
  check("a proof made with another secret is rejected", !r.verifyRecoveryToken(t, "user-a"));
  check("only our own reset page is ever a destination", r.safeRecoveryNext("https://evil.example") === "/reset-password" && r.safeRecoveryNext(null) === "/reset-password");

  const act = readFileSync("src/app/reset-password/actions.ts", "utf8");
  check("reset checks the proof BEFORE changing the password", act.indexOf("verifyRecoveryToken(") < act.indexOf("updateUser("));
  check("reset uses up the proof afterwards", /jar\.delete\(RECOVERY_COOKIE\)/.test(act));
  const fp = readFileSync("src/app/forgot-password/actions.ts", "utf8");
  check("the request page never looks up whether the email exists", !/schema\.users|getDb/.test(fp));
  const route = readFileSync("src/app/auth/confirm/route.ts", "utf8");
  check("the proof is only issued after Supabase has verified the link", route.indexOf("verifyOtp(") < route.indexOf("issueRecoveryToken(") && route.indexOf("exchangeCodeForSession(") < route.indexOf("issueRecoveryToken("));
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
