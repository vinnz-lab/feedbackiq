"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { generateDigestAi } from "@/lib/ai/digest";
import { guardAiRun } from "@/lib/guard";
import { requireWorkspace } from "@/lib/workspace";

export async function generateDigest(): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireWorkspace();
    const user = ctx.user;
    const ws = ctx.workspace;
    const db = await getDb();
    const fi = schema.feedbackItems;

    const gate = await guardAiRun("ai.digest", ws.id, user);
    if (!gate.ok) return { ok: false, error: gate.error };

    // theme mention counts (approved) + sentiment
    const themeRows = await db.select().from(schema.themes).where(eq(schema.themes.workspaceId, ws.id));
    const itemRows = await db
      .select({ themeId: fi.themeId, sentiment: fi.sentiment, quote: fi.quote, type: fi.type, severity: fi.severity, customer: fi.customer, submitter: fi.submitter })
      .from(fi)
      .where(and(eq(fi.workspaceId, ws.id), eq(fi.reviewStatus, "approved")));

    const mentions = new Map<string, number>();
    const sent = { Positive: 0, Neutral: 0, Negative: 0 };
    for (const it of itemRows) {
      if (it.themeId) mentions.set(it.themeId, (mentions.get(it.themeId) ?? 0) + 1);
      if (it.sentiment) sent[it.sentiment as keyof typeof sent]++;
    }
    const topThemes = themeRows
      .map((t) => ({ title: t.title, sentiment: t.sentiment, n: mentions.get(t.id) ?? 0 }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
    const emerging = themeRows.filter((t) => t.isEmerging).map((t) => t.title);

    // roadmap status counts
    const enh = await db
      .select({ status: schema.enhancements.status })
      .from(schema.enhancements)
      .where(eq(schema.enhancements.workspaceId, ws.id));
    const roadmap = { review: 0, planned: 0, progress: 0, shipped: 0 };
    for (const e of enh) if (e.status in roadmap) roadmap[e.status as keyof typeof roadmap]++;

    // notable quotes: a couple of negatives + a praise
    const negs = itemRows.filter((i) => i.sentiment === "Negative").slice(0, 2);
    const praise = itemRows.find((i) => i.sentiment === "Positive");
    const quotes = [...negs, ...(praise ? [praise] : [])].map((i) => ({
      text: i.quote.slice(0, 220),
      by: i.customer ?? i.submitter ?? "customer",
    }));

    const dataBlock = [
      `Top themes (title · mentions · sentiment):`,
      ...topThemes.map((t) => `- ${t.title} · ${t.n} · ${t.sentiment ?? "?"}`),
      `Sentiment totals: Positive ${sent.Positive} / Neutral ${sent.Neutral} / Negative ${sent.Negative}`,
      `Emerging themes: ${emerging.join(", ") || "none"}`,
      `Roadmap: under review ${roadmap.review}, planned ${roadmap.planned}, in progress ${roadmap.progress}, shipped ${roadmap.shipped}`,
    ].join("\n");

    const ai = await generateDigestAi(dataBlock);

    const content = { ...ai, quotes, roadmap };
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    await db.insert(schema.digests).values({
      workspaceId: ws.id,
      periodStart: weekAgo,
      periodEnd: now,
      content,
    });

    revalidatePath("/digest");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
