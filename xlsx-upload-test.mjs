/** Uploads real .xlsx/.xls/.csv files through the import route, as a user would. */
import * as XLSX from "xlsx";
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4000";
let fail = 0;
const check = (ok, n, d = "") => { console.log(`${ok ? "  ✓" : "  ✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
const b = await chromium.launch(); const ctx = await b.newContext(); const page = await ctx.newPage();
await page.goto(base + "/login", { waitUntil: "networkidle" }); await page.click("text=Jamie Lee"); await page.waitForURL("**/dashboard");
const cookie = (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const stamp = Date.now();
const rows = [["Feedback", "Customer"], [`Search ignores archived projects ${stamp}`, "Acme"], [`Mobile app logs me out daily ${stamp}`, "Globex"]];
async function upload(name, bytes, type) {
  const fd = new FormData(); fd.append("files", new File([bytes], name, { type }));
  const r = await fetch(base + "/api/ingest", { method: "POST", headers: { Cookie: cookie }, body: fd });
  return { status: r.status, body: await r.json() };
}
const wb = (r) => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(r), "S"); return w; };
let r = await upload(`modern-${stamp}.xlsx`, XLSX.write(wb(rows), { type: "buffer", bookType: "xlsx" }), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
check(r.status === 200 && r.body.totalItems === 2, "a modern .xlsx imports both rows", JSON.stringify(r.body.totalItems));
r = await upload(`old-${stamp}.xls`, XLSX.write(wb([["Feedback"], [`Old Excel format works ${stamp}`]]), { type: "buffer", bookType: "biff8" }), "application/vnd.ms-excel");
check(r.status === 200 && r.body.totalItems === 1, "an old-style .xls imports", JSON.stringify(r.body.totalItems));
r = await upload(`plain-${stamp}.csv`, `Feedback,Customer\n"CSV still fine ${stamp}","Initech"\n`, "text/csv");
check(r.status === 200 && r.body.totalItems === 1, "a .csv imports", JSON.stringify(r.body.totalItems));
r = await upload(`evil-${stamp}.xlsx`, XLSX.write(wb([["__proto__", "Feedback"], ['{"isAdmin":true}', `Normal text ${stamp}`]]), { type: "buffer", bookType: "xlsx" }), "application/octet-stream");
check(r.status === 200, "a file with a __proto__ column is handled, not crashed on", `HTTP ${r.status}`);
r = await upload(`junk-${stamp}.xlsx`, Buffer.from("PK\u0003\u0004" + "x".repeat(3000)), "application/octet-stream");
check(r.status === 200 && r.body.totalItems === 0, "a corrupt spreadsheet imports nothing and doesn't crash the server", `HTTP ${r.status}, ${r.body.totalItems} items`);
await page.goto(base + "/register?tab=review", { waitUntil: "networkidle" });
check((await page.locator("body").innerText()).includes(`Search ignores archived projects ${stamp}`), "the imported rows appear in Register");
await b.close();
console.log(fail ? `\n${fail} FAILED` : "\nall passed"); process.exit(fail ? 1 : 0);
