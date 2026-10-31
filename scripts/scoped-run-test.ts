/**
 * Selected-rows-only AI analysis.
 * Run: PGLITE_DIR=./.pglite-test npx tsx scripts/scoped-run-test.ts
 */
import { readFileSync } from "node:fs";

async function main() {
  const { getDb, schema } = await import("../src/db/index.ts");
  const { SPLIT_THRESHOLD_CHARS } = await import("../src/lib/ai/limits.ts");
  const { and, eq, inArray, isNull, or, sql } = await import("drizzle-orm");
  const db = await getDb();
  const pass: string[] = [], fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(n + (d ? " — " + d : ""));

  const [ws] = await db.select().from(schema.workspaces).limit(1);
  const [src] = await db.insert(schema.sources)
    .values({ workspaceId: ws.id, kind: "paste", filename: "scoped-" + Date.now(), status: "processed" }).returning();
  const stamp = Date.now();
  const rows = await db.insert(schema.feedbackItems).values([
    { workspaceId: ws.id, sourceId: src.id, quote: `A ${stamp}`, reviewStatus: "needs_review" as const },
    { workspaceId: ws.id, sourceId: src.id, quote: `B ${stamp}`, reviewStatus: "needs_review" as const },
    { workspaceId: ws.id, sourceId: src.id, quote: `C ${stamp}`, reviewStatus: "needs_review" as const },
    { workspaceId: ws.id, sourceId: src.id, quote: `D done ${stamp}`, type: "Bug", reviewStatus: "needs_review" as const },
    // Approved but never analysed: the state that left the Themes page empty.
    { workspaceId: ws.id, sourceId: src.id, quote: `E approved ${stamp}`, reviewStatus: "approved" as const },
    { workspaceId: ws.id, sourceId: src.id, quote: `F approved+done ${stamp}`, type: "Bug", reviewStatus: "approved" as const },
    { workspaceId: ws.id, sourceId: src.id, quote: `G discarded ${stamp}`, reviewStatus: "discarded" as const },
  ]).returning({ id: schema.feedbackItems.id, quote: schema.feedbackItems.quote });
  const id = (p: string) => rows.find((r) => r.quote.startsWith(p))!.id;
  const mine = inArray(schema.feedbackItems.id, rows.map((r) => r.id));

  // Same shape as runAiAnalysis: optional scope AND'd with the eligibility test.
  const build = (itemIds?: string[]) => {
    const scoped = itemIds && itemIds.length > 0 ? inArray(schema.feedbackItems.id, itemIds) : undefined;
    return and(mine, scoped, or(
      and(eq(schema.feedbackItems.reviewStatus, "needs_review"),
        or(isNull(schema.feedbackItems.type), sql`length(${schema.feedbackItems.quote}) > ${SPLIT_THRESHOLD_CHARS}`)),
      and(eq(schema.feedbackItems.reviewStatus, "approved"), isNull(schema.feedbackItems.type),
        sql`length(${schema.feedbackItems.quote}) <= ${SPLIT_THRESHOLD_CHARS}`),
    ));
  };
  const pick = async (ids?: string[]) =>
    (await db.select({ q: schema.feedbackItems.quote }).from(schema.feedbackItems).where(build(ids))).map((r) => r.q[0]).sort().join("");

  check("no selection = everything eligible", (await pick()) === "ABCE");
  check("empty selection = everything eligible", (await pick([])) === "ABCE");
  check("selecting A,B runs ONLY A,B", (await pick([id("A"), id("B")])) === "AB");
  check("selecting one runs only that one", (await pick([id("C")])) === "C");
  check("already-classified selected row is skipped", (await pick([id("D")])) === "");
  check("mixed selection skips the done one", (await pick([id("A"), id("D")])) === "A");

  check("approved-but-unanalysed item is picked up", (await pick([id("E")])) === "E");
  check("approved AND analysed is left alone", (await pick([id("F")])) === "");
  check("discarded is never picked up", (await pick([id("G")])) === "");

  // The real action must actually use the scope, and the button must send it.
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const act = strip(readFileSync("src/app/(app)/register/ai-actions.ts", "utf8"));
  const btn = strip(readFileSync("src/components/run-ai-button.tsx", "utf8"));
  const q = strip(readFileSync("src/components/review-queue.tsx", "utf8"));
  check("action accepts itemIds", /runAiAnalysis\(itemIds\?: string\[\]\)/.test(act));
  check("action scopes by inArray(id, itemIds)", /inArray\(schema\.feedbackItems\.id, itemIds\)/.test(act));
  check("scope is part of needsWork (also used for 'remaining')", /needsWork = and\(\s*eq\(schema\.feedbackItems\.workspaceId, ws\.id\),\s*scoped,/.test(act));
  const acts = strip(readFileSync("src/app/(app)/register/actions.ts", "utf8"));
  check("action's query includes approved-unanalysed", /reviewStatus, "approved"\),\s*isNull\(schema\.feedbackItems\.type\)/.test(act));
  check("bulkApprove refuses un-analysed items", /isNotNull\(schema\.feedbackItems\.type\)/.test(acts.slice(acts.indexOf("bulkApprove"), acts.indexOf("bulkDiscard"))));
  check("approveItem refuses un-analysed items", /isNotNull\(schema\.feedbackItems\.type\)/.test(acts.slice(acts.indexOf("export async function approveItem"), acts.indexOf("export async function discardItem"))));
  check("button passes selection when scoped", /runAiAnalysis\(scoped \? selectedIds : undefined\)/.test(btn));
  check("queue hands the selection to the button", /selectedIds=\{ids\}/.test(q));

  await db.delete(schema.feedbackItems).where(mine);
  await db.delete(schema.sources).where(eq(schema.sources.id, src.id));

  pass.forEach((p) => console.log("  ✓ " + p));
  fail.forEach((f) => console.log("  ✗ " + f));
  console.log(`\n${pass.length}/${pass.length + fail.length} checks passed`);
  process.exit(fail.length ? 1 : 0);
}
main();
