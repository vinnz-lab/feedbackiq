// Run: npx tsx scripts/jira-test.ts
async function main() {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); if (!ok) fail++; };
  const j = await import("../src/lib/jira.ts");

  console.log("Only real Jira Cloud addresses:");
  for (const [inp, out] of [["acme.atlassian.net", "https://acme.atlassian.net"], ["https://Acme.atlassian.net/jira/software/projects/FIQ/boards/1", "https://acme.atlassian.net"], ["  my-team.atlassian.net/  ", "https://my-team.atlassian.net"]] as const) {
    const r = j.normalizeJiraSite(inp);
    check(`accepts “${inp.trim()}”`, r.ok && r.site === out, r.ok ? r.site : r.error);
  }
  for (const bad of ["evil.com", "acme.atlassian.net.evil.com", "evil.com/acme.atlassian.net", "http://acme.atlassian.net", "https://acme.atlassian.net:8443", "https://user:pw@acme.atlassian.net", "atlassian.net", "https://169.254.169.254", "localhost", "jira.mycompany.com", ""]) {
    check(`refuses “${bad}”`, !j.normalizeJiraSite(bad).ok);
  }

  console.log("\nJira status → roadmap status:");
  check("To Do → Planned", j.mapJiraStatus("new", null) === "planned");
  check("In Progress / In Review → In progress", j.mapJiraStatus("indeterminate", null) === "progress");
  check("Done → Shipped", j.mapJiraStatus("done", "Done") === "shipped");
  check("Done as Won't Do → Won't do", j.mapJiraStatus("done", "Won't Do") === "wontdo" && j.mapJiraStatus("done", "Duplicate") === "wontdo" && j.mapJiraStatus("done", "Declined") === "wontdo");

  console.log("\nCustomer names:");
  check("initials", j.initials("Raj Patel") === "R. P." && j.initials("Northgate Logistics") === "N. L." && j.initials("Mary-Jane Ode") === "M. J. O.");
  const q = "Raj Patel said Northgate can't filter. raj patel again.";
  check("mask replaces known names in the text, any capitals", j.scrubNames(q, ["Raj Patel", "Northgate"], "mask") === "R. P. said N. can't filter. R. P. again.", j.scrubNames(q, ["Raj Patel", "Northgate"], "mask"));
  check("remove replaces them with [name]", !/Raj|Northgate/i.test(j.scrubNames(q, ["Raj Patel", "Northgate"], "remove")));
  check("doesn't touch parts of other words", j.scrubNames("Rajasthan office", ["Raj"], "remove") === "Rajasthan office");
  const item = { quote: "Raj Patel here — Northgate Logistics boards load in 9s.", customer: "Northgate Logistics", submitter: null, speaker: "Raj Patel", sourceKind: "recording", sourceName: "call-with-raj.mp4", timestampLabel: "00:12:04", rowRef: null };
  const base = { title: "Slow board loading\nfor big boards", summary: "Boards with hundreds of items take seconds to load.", mentions: 8, score: 8.6, benefit: 9, effort: 4, items: [item], link: "https://app.example/themes/1" };
  const inc = j.buildJiraTicket({ ...base, nameMode: "include" });
  const mask = j.buildJiraTicket({ ...base, nameMode: "mask" });
  const rem = j.buildJiraTicket({ ...base, nameMode: "remove" });
  const all = (t: { preview: string; description: unknown }) => t.preview + JSON.stringify(t.description);
  check("include: names and file name are in the ticket", /Raj Patel/.test(all(inc)) && /Northgate Logistics/.test(all(inc)) && /call-with-raj\.mp4/.test(all(inc)));
  check("mask: no name, no file name — initials instead", !/Raj|Patel|Northgate|call-with-raj/i.test(all(mask)) && /R\. P\./.test(mask.preview), mask.preview.split("\n").find((l) => l.startsWith("•“") || l.startsWith("• “")));
  check("remove: no name, no file name, no initials", !/Raj|Patel|Northgate|call-with-raj|R\. P\./i.test(all(rem)));
  check("every mode keeps the source type and timestamp", [inc, mask, rem].every((t) => /\(Call recording · [^)]*00:12:04\)/.test(t.preview)));
  check("the preview matches what's sent (same quote in both)", mask.preview.includes("boards load in 9s") && JSON.stringify(mask.description).includes("boards load in 9s"));
  check("title has no line breaks", !/\n/.test(inc.summary) && inc.summary === "Slow board loading for big boards");
  check("very long titles are cut to fit Jira", j.buildJiraTicket({ ...base, title: "x ".repeat(400), nameMode: "include" }).summary.length <= 251);
  const noEmpty = (n: unknown): boolean => Array.isArray(n) ? n.every(noEmpty) : n && typeof n === "object" ? ((n as { type?: string; text?: string }).type !== "text" || Boolean((n as { text?: string }).text)) && Object.values(n).every(noEmpty) : true;
  check("no empty text pieces (Jira rejects them)", noEmpty(j.buildJiraTicket({ ...base, summary: null, items: [], nameMode: "remove" }).description));
  check("the ticket links back to FeedbackIQ", JSON.stringify(inc.description).includes('"href":"https://app.example/themes/1"'));

  console.log("\nTalking to Jira (stubbed):");
  const calls: { url: string; init: RequestInit }[] = [];
  let handler: (url: string, init: RequestInit) => Response = () => new Response("{}", { status: 200 });
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url: String(url), init }); return handler(String(url), init); }) as typeof fetch;
  const auth = { site: "https://acme.atlassian.net", email: "me@acme.test", token: "tok-1234567890" };
  const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s });

  handler = (u) => (u.endsWith("/myself") ? json({ displayName: "Jamie" }) : json({ key: "FIQ", name: "FeedbackIQ", issueTypes: [{ id: "1", name: "Story" }, { id: "2", name: "Bug" }, { id: "3", name: "Sub-task", subtask: true }] }));
  let c = await j.checkJiraConnection(auth, "FIQ", "story");
  check("a good connection passes, using Jira's own spelling of the issue type", c.ok && c.issueType === "Story" && c.who === "Jamie");
  const h = calls[0].init.headers as Record<string, string>;
  check("it authenticates with the email and token (basic auth)", h.Authorization === `Basic ${Buffer.from("me@acme.test:tok-1234567890").toString("base64")}`);
  check("it refuses to follow redirects (the token can't be bounced elsewhere)", calls[0].init.redirect === "error");
  check("requests go only to the Jira site", calls.every((x) => x.url.startsWith("https://acme.atlassian.net/rest/api/3/")));
  c = await j.checkJiraConnection(auth, "FIQ", "Sub-task");
  check("a sub-task type is refused, listing the usable ones", !c.ok && /Story, Bug/.test(c.ok ? "" : c.error), c.ok ? "" : c.error);
  handler = () => json({}, 401);
  c = await j.checkJiraConnection(auth, "FIQ", "Story");
  check("a wrong token says so plainly", !c.ok && /didn't accept the email and API token/.test(c.ok ? "" : c.error));
  handler = (u) => (u.endsWith("/myself") ? json({ displayName: "J" }) : json({ errorMessages: ["No project"] }, 404));
  c = await j.checkJiraConnection(auth, "NOPE", "Story");
  check("a missing project says so", !c.ok && /no project with the key NOPE/.test(c.ok ? "" : c.error));
  let threw = ""; try { await j.jiraRequest({ ...auth, site: "https://evil.com" }, "/rest/api/3/myself", "x"); } catch (e) { threw = (e as Error).message; }
  check("even called directly, the client won't talk to a non-Jira address", /Jira Cloud/.test(threw));

  calls.length = 0;
  handler = (_u, init) => {
    const body = JSON.parse(String(init.body));
    return body.fields.labels ? json({ errorMessages: [], errors: { labels: "Field 'labels' cannot be set." } }, 400) : json({ id: "10001", key: "FIQ-7" }, 201);
  };
  const made = await j.createJiraIssue(auth, "FIQ", "Story", "Title", inc.description);
  check("if a project won't take labels, the ticket is still created without them", made.key === "FIQ-7" && calls.length === 2);
  handler = () => json({ errorMessages: [], errors: { customfield_10020: "Sprint is required." } }, 400);
  threw = ""; try { await j.createJiraIssue(auth, "FIQ", "Story", "T", inc.description); } catch (e) { threw = (e as Error).message; }
  check("Jira's own reason is shown when a ticket can't be created", /Sprint is required/.test(threw), threw);
  handler = () => json({ errorMessages: ["Issue does not exist"] }, 404);
  check("a deleted ticket reads as 'not found', not an error", (await j.getJiraIssueStatus(auth, "FIQ-9")) === null);
  handler = () => json({ fields: { status: { name: "In Review", statusCategory: { key: "indeterminate" } }, resolution: null } });
  const st = await j.getJiraIssueStatus(auth, "FIQ-9");
  check("a ticket's status is read", st?.name === "In Review" && st.category === "indeterminate");

  console.log(fail ? `\n${fail} failed` : "\nall passed");
  process.exit(fail ? 1 : 0);
}
main();
