/**
 * Per-workspace AI keys: encryption, which key each call uses, per-key pacing,
 * and the daily caps.
 * Run: PGLITE_DIR=./.pglite-aikeys npx tsx scripts/ai-keys-test.ts  (after db-setup)
 */
async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };

  console.log("Encryption:");
  delete process.env.AI_KEYS_SECRET;
  const box = await import("../src/lib/secret-box.ts");
  check("without AI_KEYS_SECRET nothing can be saved (fails closed)", !box.canEncrypt() && (() => { try { box.encryptSecret("x"); return false; } catch { return true; } })());
  process.env.AI_KEYS_SECRET = "a".repeat(20);
  check("a short secret is refused too", !box.canEncrypt());
  process.env.AI_KEYS_SECRET = "test-secret-that-is-long-enough-1234567890";
  const c1 = box.encryptSecret("AIzaSy-client-key-1234");
  const c2 = box.encryptSecret("AIzaSy-client-key-1234");
  check("stored value doesn't contain the key", !c1.includes("client-key"));
  check("the same key encrypts differently each time", c1 !== c2);
  check("it decrypts back exactly", box.decryptSecret(c1) === "AIzaSy-client-key-1234");
  const bytes = Buffer.from(c1.split(":")[1], "base64"); bytes[bytes.length - 1] ^= 1;
  check("a tampered value is rejected, not mis-read", (() => { try { box.decryptSecret("v1:" + bytes.toString("base64")); return false; } catch { return true; } })());
  process.env.AI_KEYS_SECRET = "a-completely-different-secret-0987654321";
  check("a different server secret can't read it", (() => { try { box.decryptSecret(c1); return false; } catch { return true; } })());
  process.env.AI_KEYS_SECRET = "test-secret-that-is-long-enough-1234567890";

  console.log("\nWhich key each Gemini call uses:");
  process.env.GEMINI_RPM = "60"; // 1s gap per key
  process.env.GEMINI_API_KEY = "PLATFORM-KEY";
  const { geminiJson } = await import("../src/lib/ai/gemini.ts");
  const { withAiKey } = await import("../src/lib/ai/ai-context.ts");
  const seen: { key: string | null; url: string; at: number }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ key: (init.headers as Record<string, string>)["x-goog-api-key"] ?? null, url: String(url), at: Date.now() });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }), { status: 200 });
  }) as typeof fetch;
  await withAiKey({ key: "CLIENT-A", source: "workspace" }, () => geminiJson("x"));
  check("inside a workspace's AI action, its own key is sent", seen[0].key === "CLIENT-A");
  check("…in a header, not the URL", !seen[0].url.includes("CLIENT-A") && !seen[0].url.includes("key="));
  await withAiKey({ key: "PLATFORM-KEY", source: "platform" }, () => geminiJson("x"));
  check("a platform-key workspace sends the platform key", seen[1].key === "PLATFORM-KEY");
  // Nested calls deep inside the action see the same key.
  await withAiKey({ key: "CLIENT-B", source: "workspace" }, async () => { await Promise.resolve(); await new Promise((r) => setTimeout(r, 5)); return geminiJson("deep"); });
  check("calls deep inside an action (after awaits/timers) still use that action's key", seen[2].key === "CLIENT-B");

  console.log("\nPacing is per key:");
  seen.length = 0;
  const t0 = Date.now();
  await Promise.all([
    withAiKey({ key: "SLOW-A", source: "workspace" }, async () => { await geminiJson("a1"); await geminiJson("a2"); }),
    withAiKey({ key: "FAST-B", source: "workspace" }, () => geminiJson("b1")),
  ]);
  const b = seen.find((s) => s.key === "FAST-B")!;
  const a2 = seen.filter((s) => s.key === "SLOW-A")[1];
  check("another key isn't made to wait behind this key's queue", b.at - t0 < 500, `${b.at - t0}ms`);
  check("the same key's calls are still spaced out", a2.at - seen.filter((s) => s.key === "SLOW-A")[0].at >= 900, `${a2.at - seen.filter((s) => s.key === "SLOW-A")[0].at}ms`);

  console.log("\nWhich key a workspace gets:");
  const { getDb, schema } = await import("../src/db/index.ts");
  const { resolveAiKey } = await import("../src/lib/ai/workspace-key.ts");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [tenant] = await db.insert(schema.tenants).values({ name: "AI key test" }).returning();
  const mk = async (n: string) => (await db.insert(schema.workspaces).values({ tenantId: tenant.id, name: `${n} ${Date.now()}` }).returning())[0];
  const plain = await mk("plain"), own = await mk("own"), blocked = await mk("blocked"), broken = await mk("broken");
  await db.insert(schema.workspaceAiSettings).values({ workspaceId: own.id, encryptedKey: box.encryptSecret("OWN-KEY-9876"), keyLast4: "9876" });
  await db.insert(schema.workspaceAiSettings).values({ workspaceId: blocked.id, allowPlatformKey: false });
  await db.insert(schema.workspaceAiSettings).values({ workspaceId: broken.id, encryptedKey: "v1:garbage", keyLast4: "xxxx", allowPlatformKey: true });
  const r1 = await resolveAiKey(plain.id);
  check("no settings → the platform key", r1.source === "platform" && r1.key === "PLATFORM-KEY");
  const r2 = await resolveAiKey(own.id);
  check("own key saved → its own key", r2.source === "workspace" && r2.key === "OWN-KEY-9876");
  let e3 = ""; try { await resolveAiKey(blocked.id); } catch (e) { e3 = (e as Error).message; }
  check("blocked from the platform key, no own key → refused with how to fix it", /needs its own AI key/.test(e3), e3);
  let e4 = ""; try { await resolveAiKey(broken.id); } catch (e) { e4 = (e as Error).message; }
  check("an unreadable saved key → refused, NOT quietly switched to your key", /can't be read/.test(e4), e4);

  console.log("\nDaily caps:");
  const guard = await import("../src/lib/guard.ts");
  const [u] = await db.insert(schema.users).values({ tenantId: tenant.id, email: `ai-${Date.now()}@test.test`, name: "Test" }).returning();
  const actor = { id: u.id, name: "Test" };
  const longAgo = () => new Date(Date.now() - 60 * 60 * 1000); // an hour ago: inside 24h, outside the cooldown
  for (let i = 0; i < guard.AI_DAILY_CAP; i++) {
    await db.insert(schema.auditEvents).values({ workspaceId: plain.id, action: "ai.digest", entityType: "ai_run", after: { keySource: "platform" }, createdAt: longAgo() });
  }
  const g1 = await guard.guardAiRun("ai.digest", blocked.id, actor, "platform");
  check("the shared cap still applies to platform-key runs", !g1.ok);
  const g2 = await guard.guardAiRun("ai.digest", own.id, actor, "workspace");
  check("a workspace on its own key isn't blocked by the shared cap", g2.ok);
  for (let i = 0; i < guard.OWN_KEY_DAILY_CAP; i++) {
    await db.insert(schema.auditEvents).values({ workspaceId: own.id, action: "ai.summarize", entityType: "ai_run", after: { keySource: "workspace" }, createdAt: longAgo() });
  }
  const g3 = await guard.guardAiRun("ai.summarize", own.id, actor, "workspace");
  check(`…but has its own ceiling (${guard.OWN_KEY_DAILY_CAP}/day)`, !g3.ok);
  const g4 = await guard.guardAiRun("ai.summarize", plain.id, actor, "platform");
  check("own-key runs don't use up the shared platform allowance", g4.ok);

  for (const w of [plain, own, blocked, broken]) await db.delete(schema.workspaces).where(eq(schema.workspaces.id, w.id));
  await db.delete(schema.users).where(eq(schema.users.id, u.id));
  await db.delete(schema.tenants).where(eq(schema.tenants.id, tenant.id));
  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
