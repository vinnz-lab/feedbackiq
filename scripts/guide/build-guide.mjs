/**
 * Builds the "Getting started with Insight Hub" PDF from the screenshots in
 * /tmp/guide-shots (scripts/guide/shots.mjs). Output: OUT_PDF (default public/insight-hub-guide.pdf).
 *   node scripts/guide/build-guide.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const shots = process.env.SHOTS || "/tmp/guide-shots";
const outPdf = process.env.OUT_PDF || "public/insight-hub-guide.pdf";
const icon = readFileSync("src/app/icon.svg", "utf8");
const img = (n) => `data:image/jpeg;base64,${readFileSync(`${shots}/${n}.jpg`).toString("base64")}`;
const hub = `<svg viewBox="0 0 64 64" width="38" height="38">${[...Array(6)].map((_, i) => { const a = ((-90 + 60 * i) * Math.PI) / 180; return `<line x1="32" y1="32" x2="${32 + 22 * Math.cos(a)}" y2="${32 + 22 * Math.sin(a)}" stroke="#4F46E5" stroke-width="3"/><circle cx="${32 + 24 * Math.cos(a)}" cy="${32 + 24 * Math.sin(a)}" r="5.5" fill="#4F46E5"/>`; }).join("")}<circle cx="32" cy="32" r="14" fill="#4F46E5"/><path d="M22.5 32c2.6-4.4 5.8-6.4 9.5-6.4s6.9 2 9.5 6.4c-2.6 4.4-5.8 6.4-9.5 6.4s-6.9-2-9.5-6.4z" fill="#fff"/><circle cx="32" cy="32" r="3.6" fill="#8B5CF6"/></svg>`;
const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** A screenshot; with h (mm) it's cropped from the top to that height so pages never overflow. */
const shot = (n, caption, h = 0) => `<figure>${h ? `<div class="crop" style="height:${h}mm"><img src="${img(n)}"/></div>` : `<img src="${img(n)}"/>`}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
const step = (num, title, body) => `<div class="step"><div class="num">${num}</div><div><h3>${title}</h3>${body}</div></div>`;
const footer = (n) => `<div class="foot"><span>${icon.replace("<svg ", '<svg width="14" height="14" ')} Insight Hub · Getting started</span><span>${n}</span></div>`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #111827; font-size: 10.5pt; line-height: 1.5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 18mm 18mm 16mm; position: relative; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }
h1 { font-size: 30pt; line-height: 1.1; letter-spacing: -0.02em; margin: 0; }
h2 { font-size: 17pt; letter-spacing: -0.01em; margin: 0 0 3mm; }
h3 { font-size: 11.5pt; margin: 0 0 1mm; }
p { margin: 0 0 2.5mm; }
.kicker { color: #4F46E5; font-weight: 700; font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; margin-bottom: 2mm; }
.muted { color: #6B7280; }
figure { margin: 3mm 0 4mm; }
figure img { width: 100%; display: block; border: 1px solid #E5E7EB; border-radius: 3mm; box-shadow: 0 2px 10px rgba(17,24,39,.08); }
figcaption { font-size: 8.5pt; color: #6B7280; margin-top: 1.5mm; }
.step { display: flex; gap: 4mm; margin: 4mm 0 1mm; }
.num { flex: 0 0 9mm; height: 9mm; border-radius: 50%; background: #4F46E5; color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 11pt; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
.card { border: 1px solid #E5E7EB; border-radius: 3mm; padding: 4mm; background: #fff; }
.card h3 { margin-bottom: 1mm; }
.tip { background: #EEF2FF; border-left: 3px solid #4F46E5; border-radius: 0 2mm 2mm 0; padding: 3mm 4mm; font-size: 9.5pt; margin: 3mm 0; }
.foot { position: absolute; left: 18mm; right: 18mm; bottom: 8mm; display: flex; justify-content: space-between; font-size: 8pt; color: #9CA3AF; border-top: 1px solid #F3F4F6; padding-top: 2mm; }
.foot span { display: flex; align-items: center; gap: 1.5mm; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
th, td { text-align: left; padding: 2mm 2.5mm; border-bottom: 1px solid #E5E7EB; vertical-align: top; }
th { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #6B7280; }
td.y { color: #059669; font-weight: 700; } td.n { color: #D1D5DB; }
.flow { display: flex; gap: 2mm; margin: 5mm 0; }
.flow div { flex: 1; text-align: center; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 2.5mm; padding: 3mm 1mm; font-size: 8.5pt; font-weight: 600; }
.flow div b { display: block; font-size: 14pt; margin-bottom: 1mm; }
.cover { background: linear-gradient(160deg, #EEF2FF 0%, #fff 55%); }
.qa h3 { margin-top: 4mm; }
ul { margin: 1mm 0 2.5mm 5mm; padding: 0; } li { margin-bottom: 1mm; }
.crop { overflow: hidden; border: 1px solid #E5E7EB; border-radius: 3mm; box-shadow: 0 2px 10px rgba(17,24,39,.08); } .crop img { border: 0; border-radius: 0; box-shadow: none; }
</style></head><body>

<section class="page cover">
  <div style="display:flex;align-items:center;gap:3mm;margin-top:6mm">${hub}<span style="font-size:20pt;color:#4F46E5;letter-spacing:-.01em"><b style="font-weight:800">Insight</b> Hub</span></div>
  <div style="margin-top:34mm" class="kicker">Getting started guide</div>
  <h1>Every customer voice.<br/>One clear roadmap.</h1>
  <p style="font-size:13pt;color:#4B5563;margin-top:6mm;max-width:150mm">Insight Hub collects customer feedback from wherever it lives — surveys, emails, call transcripts, support tools — and uses AI to turn it into clear themes, a prioritised roadmap and a one-page digest your whole team can act on.</p>
  <div class="flow" style="margin-top:12mm">
    <div><b>📥</b>Collect</div><div><b>✨</b>Analyse</div><div><b>✓</b>Review</div><div><b>🏷️</b>Themes</div><div><b>🗺️</b>Roadmap</div><div><b>📰</b>Share</div>
  </div>
  <div class="card" style="margin-top:8mm">
    <h3>What's inside</h3>
    <div class="grid2" style="gap:2mm 8mm;font-size:10pt">
      <div>1. What Insight Hub does</div><div>5. Sharing your results</div>
      <div>2. Your first ten minutes</div><div>6. Bringing feedback in automatically</div>
      <div>3. The six steps, with screenshots</div><div>7. Who can do what</div>
      <div>4. Finding anything with search</div><div>8. Questions people ask</div>
    </div>
  </div>
  <p class="muted" style="position:absolute;bottom:18mm;font-size:9pt">Screenshots show a demo workspace with sample data for a made-up project-management app. · ${today}</p>
</section>

<section class="page">
  <div class="kicker">1 · What Insight Hub does</div>
  <h2>From scattered feedback to confident decisions</h2>
  <p>Product teams hear from customers everywhere — and most of it ends up buried in inboxes, spreadsheets and meeting notes. Insight Hub brings it into one place and does the heavy lifting:</p>
  <ul>
    <li><b>Reads every piece of feedback</b> and sorts it by type (bug, feature, UX, question, praise), sentiment and severity.</li>
    <li><b>Groups similar feedback into themes</b>, so “the board takes forever” and “filtering freezes” become one clear problem with the evidence behind it.</li>
    <li><b>Scores a roadmap</b> by customer demand, benefit and effort — so priorities are backed by evidence, not opinion.</li>
    <li><b>Writes a weekly digest</b> for people who won't read every item, ready to post to Slack or Teams or share by link.</li>
  </ul>
  <div class="tip">Nothing counts until a person approves it. The AI suggests; your team decides. Every theme and roadmap item links back to the exact quotes it came from.</div>
  ${shot("03-dashboard", "The dashboard: headline numbers and the top themes, with trend and sentiment at a glance.")}
  ${footer(2)}
</section>

<section class="page">
  <div class="kicker">2 · Your first ten minutes</div>
  <h2>A guide that walks you through it</h2>
  <p>When you open a new workspace, the <b>Getting started</b> checklist on the dashboard shows the six steps. Each one has a button that takes you to the right place, and ticks itself off when it's done. You can hide it at any time and bring it back from the small “Getting started” link.</p>
  ${shot("01-welcome", "The Getting started guide in a brand-new workspace.")}
  <div class="tip"><b>No feedback of your own to hand?</b> Click <b>Load sample data</b> to fill the workspace with realistic survey answers, emails and a call transcript for a made-up product. A banner reminds you it's sample data, and <b>Remove sample data</b> clears it all with one click — any feedback you've added yourself is kept.</div>
  <p class="muted" style="font-size:9.5pt">People with view-only access see a short tour instead of the checklist — what to look at, rather than things they can't change.</p>
  ${footer(3)}
</section>

<section class="page">
  <div class="kicker">3 · The six steps</div>
  ${step(1, "Add some feedback", `<p>Go to <b>Ingest feedback</b> and drop in a file — spreadsheet (.csv, .xlsx), email (.eml), transcript (.vtt, .txt) or document — or paste text straight in. Long transcripts are split into individual points automatically, keeping who said it and when. Duplicates are skipped.</p>`)}
  ${shot("04-ingest", "", 52)}
  ${step(2, "Run AI analysis", `<p>New feedback waits in <b>Register → Needs review</b>. Click <b>Run AI analysis</b> (or tick a few items and run it on just those). The AI suggests a type, sentiment, severity and theme for each.</p>`)}
  ${step(3, "Review and approve", `<p>Check each suggestion: <b>Approve</b> it, <b>Correct</b> it, or <b>Discard</b> it. Only approved feedback counts in themes, the roadmap and digests.</p>`)}
  ${shot("05-review", "Needs review: every item shows where it came from — the file, the row, or the speaker and timestamp.", 92)}
  ${footer(4)}
</section>

<section class="page">
  ${step(4, "See your themes", `<p><b>Themes</b> groups similar feedback together, with an AI summary, the mix of sentiment, and a trend showing whether it's rising. Open a theme to see every quote behind it and where each came from. You can rename a theme, and <b>Review &amp; consolidate</b> suggests themes that should be merged.</p>`)}
  ${shot("06-themes", "Themes, ranked by how often they come up.", 92)}
  ${shot("07-theme", "Inside a theme: the evidence, with sentiment and type breakdowns.", 100)}
  ${footer(5)}
</section>

<section class="page">
  ${step(5, "Add a theme to the roadmap", `<p>On a theme, click <b>Add to roadmap</b>. Insight Hub estimates benefit and effort from the feedback and scores it — you can adjust both. The <b>Roadmap</b> shows a ranked backlog, a benefit/effort matrix to spot quick wins, and a board to move items from Under review to Shipped.</p>`)}
  ${shot("08-roadmap", "The prioritised backlog and benefit/effort matrix.", 78)}
  ${step(6, "Generate a digest", `<p>On <b>Digest</b>, click <b>Generate weekly digest</b> for a one-page briefing: the headline, top themes, what's rising, what to prioritise and notable quotes.</p>`)}
  ${shot("09-digest", "The digest — ready to post to Slack or Teams, or share by link.", 98)}
  ${footer(6)}
</section>

<section class="page">
  <div class="kicker">4 · Finding anything</div>
  <div class="grid2" style="align-items:start">
    <div>
      <h2>Search</h2>
      <p>Type in the search box at the top — or press <b>Ctrl K</b> (<b>⌘ K</b> on a Mac) or <b>/</b> — to find themes, feedback, roadmap items and sources as you type. The matching words are highlighted; <b>See all</b> opens the full list in the Register.</p>
      <p>The <b>🔔 bell</b> shows what's new in the workspace: feedback arriving, new themes, Jira tickets changing status, new digests.</p>
    </div>
    ${shot("12-search", "")}
  </div>
  <div class="kicker" style="margin-top:4mm">5 · Sharing your results</div>
  <div class="grid2">
    <div class="card"><h3>💬 Slack &amp; Microsoft Teams</h3><p>Connect a channel once in <b>Integrations</b>, then post the latest digest with one click from the Digest page.</p></div>
    <div class="card"><h3>🔗 Share links</h3><p>Send a read-only link to the digest or roadmap to people without an account. Turn it off any time.</p></div>
    <div class="card"><h3>🎫 Jira</h3><p>Send a roadmap item to Jira Cloud as a ticket with the customer evidence attached. Names can be masked or left out.</p></div>
    <div class="card"><h3>📤 Backups</h3><p>Download everything in a workspace as one file from Settings, whenever you like.</p></div>
  </div>
  ${shot("11-shared-roadmap", "What someone sees when you share the roadmap: status and scores only — no quotes, customer names or ticket details.")}
  ${footer(7)}
</section>

<section class="page">
  <div class="kicker">6 · Bringing feedback in automatically</div>
  <h2>Let feedback arrive on its own</h2>
  <div class="grid2" style="align-items:start">
    <div>
      <p><b>Incoming webhook.</b> In <b>Integrations</b>, create the workspace's private webhook address and use it in Zapier or Make. New answers from Typeform, Google Forms, Intercom, Zendesk, HubSpot or a spreadsheet then flow straight into Needs review, labelled with the app they came from.</p>
      <p><b>Feedback button.</b> Anyone using Insight Hub can click <b>💬 Feedback</b> in the top bar to send an idea, problem, question or praise to the Insight Hub team.</p>
      <div class="tip">The webhook address works like a password: only the workspace owner can see it, and it can be replaced or switched off at any time.</div>
    </div>
    ${shot("13-feedback", "")}
  </div>
  ${shot("10-integrations", "Integrations: everything that brings feedback in, sends work out, and powers the AI — in one place.", 110)}
  ${footer(8)}
</section>

<section class="page">
  <div class="kicker">7 · Who can do what</div>
  <h2>Roles</h2>
  <table>
    <tr><th></th><th>Owner</th><th>Contributor · Executive · Engineer</th><th>Viewer</th></tr>
    <tr><td>See the dashboard, themes, register, roadmap, trends and digest</td><td class="y">✓</td><td class="y">✓</td><td class="y">✓</td></tr>
    <tr><td>Search, notifications, send feedback</td><td class="y">✓</td><td class="y">✓</td><td class="y">✓</td></tr>
    <tr><td>Add feedback, run AI analysis, approve and correct</td><td class="y">✓</td><td class="y">✓</td><td class="n">—</td></tr>
    <tr><td>Rename and merge themes, manage the roadmap, generate digests</td><td class="y">✓</td><td class="y">✓</td><td class="n">—</td></tr>
    <tr><td>Send to Jira, post digests to Slack or Teams</td><td class="y">✓</td><td class="y">✓</td><td class="n">—</td></tr>
    <tr><td>Connect apps (AI key, Jira, webhook, Slack, Teams), create share links</td><td class="y">✓</td><td class="n">—</td><td class="n">—</td></tr>
    <tr><td>Add people, change roles, reset passwords, clear or delete the workspace</td><td class="y">✓</td><td class="n">—</td><td class="n">—</td></tr>
  </table>
  <div class="kicker" style="margin-top:8mm">8 · Questions people ask</div>
  <div class="qa grid2" style="gap:0 8mm">
    <div>
      <h3>Do I need my own AI subscription?</h3>
      <p>No. Insight Hub can run on the platform's AI. If you'd rather use your own, the workspace owner can add an API key from <b>Google Gemini</b>, <b>OpenAI</b> or <b>Anthropic (Claude)</b> in Integrations → AI. Note that a ChatGPT Plus or Claude Pro subscription doesn't include API use — API keys are billed separately by the provider, usually pennies for a small team.</p>
      <h3>Is our data private?</h3>
      <p>Each workspace is completely separate — people only see the workspaces they've been added to. Keys and connection details are stored encrypted and never shown again after saving.</p>
    </div>
    <div>
      <h3>Does the AI change anything on its own?</h3>
      <p>No. It suggests, and a person approves. Merging themes and sending tickets also always need a person to confirm.</p>
      <h3>How do I get rid of the sample data?</h3>
      <p>Click <b>Remove sample data</b> in the yellow banner. Everything it created goes; anything you added yourself stays.</p>
      <h3>Something's not working, or I have an idea</h3>
      <p>Click <b>💬 Feedback</b> in the top bar — it comes straight to us.</p>
    </div>
  </div>
  ${footer(9)}
</section>
</body></html>`;

mkdirSync("/tmp/guide", { recursive: true });
writeFileSync("/tmp/guide/guide.html", html);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file:///tmp/guide/guide.html", { waitUntil: "networkidle" });
await p.pdf({ path: outPdf, format: "A4", printBackground: true, preferCSSPageSize: true });
await b.close();
console.log("wrote", outPdf);
