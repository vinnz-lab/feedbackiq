/** TEST ONLY: gives Acme App a webhook with a known address, for the "Send feedback" button. */
(async () => {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { hashWebhookToken } = await import("../src/lib/webhook.ts");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "Acme App"));
  await db.insert(schema.incomingWebhooks).values({ workspaceId: ws.id, tokenHash: hashWebhookToken("fiqwh_" + "Fb7".repeat(10) + "Xy"), tokenHint: "7Xy", enabled: true });
  process.exit(0);
})();
