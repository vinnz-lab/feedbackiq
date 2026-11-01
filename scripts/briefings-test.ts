/**
 * Audio briefings: audio handling, script rules, the voice request, retention,
 * and a full run against fake AI responses.
 * Run: PGLITE_DIR=./.pglite-x npx tsx scripts/briefings-test.ts  (after db-setup + seed-second-workspace)
 */
(async () => {
  let fail = 0;
  const check = (n: string, ok: boolean, d = "") => { console.log((ok ? "✓ " : "✗ ") + n + (d ? ` — ${d}` : "")); if (!ok) fail++; };
  process.env.AI_RPM = "6000";
  const audio = await import("../src/lib/audio.ts");
  const tts = await import("../src/lib/ai/tts.ts");
  const br = await import("../src/lib/briefings.ts");
  const { withAiKey } = await import("../src/lib/ai/ai-context.ts");

  const tone = (secs: number, rate = 24000) => { const a = new Int16Array(rate * secs); for (let i = 0; i < a.length; i++) a[i] = Math.round(Math.sin((2 * Math.PI * 300 * i) / rate) * 6000); return a; };
  const pcmBuf = (a: Int16Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
  const wav = (a: Int16Array, rate = 24000) => { const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + a.byteLength, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(a.byteLength, 40); return Buffer.concat([h, pcmBuf(a)]); };

  console.log("Audio:");
  const t1 = tone(1);
  let p = audio.decodeSpeech(pcmBuf(t1), "audio/L16;codec=pcm;rate=24000");
  check("reads raw 16-bit PCM with its sample rate", p.rate === 24000 && p.samples.length === 24000 && p.samples[100] === t1[100]);
  p = audio.decodeSpeech(wav(tone(1, 16000), 16000));
  check("reads a WAV, skipping its header", p.rate === 16000 && p.samples.length === 16000);
  const j = audio.joinPcm([{ samples: tone(1), rate: 24000 }, { samples: tone(2), rate: 24000 }], 500);
  check("joins pieces with a pause between", j.samples.length === 24000 * 3 + 12000 && audio.durationSec(j) === 4);
  check("refuses to join different sample rates", (() => { try { audio.joinPcm([{ samples: tone(1), rate: 24000 }, { samples: tone(1, 16000), rate: 16000 }]); return false; } catch { return true; } })());
  const mp3 = await audio.encodeMp3({ samples: tone(60), rate: 24000 });
  check("encodes to MP3 (valid frame header)", mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0);
  check("a minute is about 360 KB at 48 kbps — so 5 minutes ≈ 1.8 MB", mp3.length > 300_000 && mp3.length < 420_000, `${(mp3.length / 1000).toFixed(0)} KB`);

  console.log("\nScript rules:");
  const names = ["Kestrel Health", "Dr. Alan Reeve", "Maya Patel"];
  check("names: initials, said, or left out", br.nameFor("Kestrel Health", "mask") === "K. H." && br.nameFor("Kestrel Health", "include") === "Kestrel Health" && br.nameFor("Kestrel Health", "remove") === null);
  check("“leave out” reads as “a customer”, not “[name]”", br.scrubForAudio("Maya Patel said it's slow", names, "remove") === "a customer said it's slow");
  const raw = { title: "Boards **and** exports", turns: [
    { speaker: "Ava", text: "So, Kestrel Health says boards are slow. [laughs]" },
    { speaker: "Bob", text: "And Maya Patel wants Excel export." },
    { speaker: "Leo", text: "Right." }, { speaker: "Ava", text: "Let's recap." }, { speaker: "Leo", text: "Bye." } ] };
  let sc = br.cleanScript(raw, names, "mask");
  check("adds the “we're AI voices” disclosure when the AI forgot", sc.turns[0].speaker === "Ava" && /AI voices/.test(sc.turns[0].text));
  check("no full names slip through when masking", !JSON.stringify(sc).match(/Kestrel Health|Maya Patel/) && /K\. H\./.test(sc.turns[1].text) && /M\. P\./.test(sc.turns[2].text));
  check("unknown speakers become a host; stage directions and markdown are removed", ["Ava", "Leo"].includes(sc.turns[2].speaker) && !/\[laughs\]|\*\*/.test(JSON.stringify(sc)));
  sc = br.cleanScript({ ...raw, turns: [{ speaker: "Ava", text: "This is an AI briefing." }, ...raw.turns] }, names, "include");
  check("keeps its own disclosure and names when “say names” is chosen", !/AI voices/.test(sc.turns[1].text) && /Kestrel Health/.test(JSON.stringify(sc)));
  check("a too-short answer is an error", (() => { try { br.cleanScript({ turns: [{ speaker: "Ava", text: "hi" }] }, [], "mask"); return false; } catch { return true; } })());
  const prompt = br.scriptPrompt([{ id: "x", title: "Slow Boards", summary: "s", mentions: 4, sentiment: { Positive: 0, Neutral: 1, Negative: 3 }, trend: "up 50%", emerging: true, roadmap: "in progress", quotes: [{ text: "too slow", who: "K. H.", type: "Bug", severity: "High" }] }], "mask", "balanced");
  check("the prompt holds the real numbers, forbids inventing, and asks for 650–800 words", /Mentions \(approved feedback\): 4/.test(prompt) && /Never invent/.test(prompt) && /650 to 800/.test(prompt) && /initials/.test(prompt));

  console.log("\nVoices request:");
  const turns = Array.from({ length: 12 }, (_, i) => ({ speaker: i % 2 ? "Leo" : "Ava", text: "word ".repeat(120).trim() }));
  const chunks = tts.chunkTurns(turns, 3200);
  check("long conversations are sent in chunks, keeping every turn", chunks.length >= 2 && chunks.flat().length === 12 && chunks.every((c) => c.reduce((n, t) => n + t.text.length, 0) <= 3200 + 600));
  type Call = { url: string; body: any; key: string };
  let calls: Call[] = [];
  let reply: (c: Call, n: number) => Response = () => new Response("{}");
  globalThis.fetch = (async (url: string, init: RequestInit) => { const c = { url: String(url), body: JSON.parse(String(init.body)), key: (init.headers as any)["x-goog-api-key"] }; calls.push(c); return reply(c, calls.length); }) as typeof fetch;
  const audioReply = (secs = 1) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcmBuf(tone(secs)).toString("base64") } }] } }] }));
  reply = () => audioReply(1);
  let out = await tts.speakConversation(turns.slice(0, 2), { key: "AIza-voice-key", source: "platform" });
  let c = calls[0];
  check("asks the TTS model for audio with two named voices", /gemini-3\.8-flash-lite-tts:generateContent$/.test(c.url) && c.body.generationConfig.responseModalities[0] === "AUDIO" && c.body.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs.map((v: any) => v.speaker).join() === "Ava,Leo");
  check("each turn is sent with its speaker", c.body.contents[0].parts.length === 2 && c.body.contents[0].parts[1].speech_metadata.speaker === "Leo");
  check("key in a header, never in the address", c.key === "AIza-voice-key" && !c.url.includes("AIza"));
  check("returns the audio", out.samples.length === 24000);
  calls = []; tts._resetTtsShape();
  reply = (cc) => (cc.url.includes("3.8") ? new Response(JSON.stringify({ error: { message: "Unknown name speech_metadata" } }), { status: 400 }) : audioReply(2));
  out = await tts.speakConversation(turns.slice(0, 2), { key: "k", source: "platform" });
  check("if Google refuses the new request shape, falls back to the older model and “Ava: …” format", calls.length === 2 && /gemini-2\.5-flash-preview-tts/.test(calls[1].url) && /Ava: word/.test(calls[1].body.contents[0].parts[0].text) && out.samples.length === 48000);
  calls = [];
  await tts.speakConversation(turns.slice(0, 2), { key: "k", source: "platform" });
  check("…and remembers, so later requests go straight to the fallback", calls.length === 1);
  calls = []; tts._resetTtsShape();
  reply = (_c, n) => (n === 1 ? new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "per minute", details: [{ retryDelay: "0s" }] } }), { status: 429 }) : audioReply(1));
  out = await tts.speakConversation(turns.slice(0, 2), { key: "k", source: "platform" });
  check("a per-minute limit is waited out and retried", calls.length === 2 && out.samples.length === 24000);

  console.log("\nA full run (fake AI):");
  const { getDb, schema } = await import("../src/db/index.ts");
  const { eq, and } = await import("drizzle-orm");
  const db = await getDb();
  const [acme] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "Acme App"));
  const [zebra] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.name, "ZEBRA Space"));
  const themes = await db.select().from(schema.themes).where(eq(schema.themes.workspaceId, acme.id));
  const pick = themes.slice(0, 2).map((t) => t.id);
  const g = await br.gatherBriefing(acme.id, pick, "mask");
  check("gathers only approved feedback for the chosen themes", g.themes.length === 2 && g.themes.every((t) => t.mentions > 0 && t.quotes.length > 0));
  check("quotes carry initials, not names, when masking", g.themes.flatMap((t) => t.quotes).every((q) => !q.who || /^([A-Z]\. ?)+$/.test(q.who)));
  const zg = await br.gatherBriefing(zebra.id, pick, "mask");
  check("another workspace's theme ids give nothing", zg.themes.length === 0);
  const scriptJson = JSON.stringify({ title: "Boards and exports", turns: Array.from({ length: 8 }, (_, i) => ({ speaker: i % 2 ? "Leo" : "Ava", text: i === 0 ? "This is an AI briefing about boards." : `Point number ${i}.` })) });
  calls = []; tts._resetTtsShape();
  reply = (cc) => (cc.url.includes("tts") ? audioReply(3) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: scriptJson }] } }] })));
  const mk = async (voice: boolean) => {
    const [row] = await db.insert(schema.audioBriefings).values({ workspaceId: acme.id, title: "t", themeIds: pick, themeTitles: ["a", "b"], nameMode: "mask", expiresAt: new Date(Date.now() + 30 * 86400000) }).returning();
    await withAiKey({ key: "AIza-script-key", source: "platform", provider: "gemini", model: "gemini-3.1-flash-lite" }, () => br.produceBriefing(row.id, acme.id, voice ? { key: "AIza-voice-key", source: "platform" } : null));
    return (await db.select().from(schema.audioBriefings).where(eq(schema.audioBriefings.id, row.id)))[0];
  };
  let done = await mk(true);
  const file = (await db.select().from(schema.audioFiles).where(eq(schema.audioFiles.briefingId, done.id)))[0];
  check("writes the script, records the voices and saves an MP3", done.status === "ready" && done.hasAudio && done.title === "Boards and exports" && file?.mp3[0] === 0xff && done.sizeBytes === file.mp3.length && (done.durationSec ?? 0) >= 3, `${done.durationSec}s, ${done.sizeBytes} bytes`);
  check("the script went to the workspace's AI, the voices to the voice key", calls.some((x) => !x.url.includes("tts") && x.key === "AIza-script-key") && calls.some((x) => x.url.includes("tts") && x.key === "AIza-voice-key"));
  done = await mk(false);
  check("with no voice key it's saved as script only", done.status === "ready" && !done.hasAudio && (done.script as any)?.turns.length === 8);
  reply = () => new Response(JSON.stringify({ error: { message: "Quota exceeded … PerDay" } }), { status: 429 });
  done = await mk(true);
  check("a failure is saved with a plain message", done.status === "failed" && /daily/.test(done.error ?? ""), done.error ?? "");

  console.log("\nKeeping only 10, for 30 days:");
  const b = schema.audioBriefings;
  for (let i = 0; i < 12; i++) await db.insert(b).values({ workspaceId: acme.id, title: `n${i}`, themeIds: [], themeTitles: [], status: "ready", createdAt: new Date(Date.now() - (i + 1) * 60000), expiresAt: new Date(Date.now() + 86400000) });
  await db.insert(b).values({ workspaceId: acme.id, title: "old", themeIds: [], themeTitles: [], status: "ready", createdAt: new Date(Date.now() - 31 * 86400000), expiresAt: new Date(Date.now() - 86400000) });
  await db.insert(b).values({ workspaceId: zebra.id, title: "zebra-keep", themeIds: [], themeTitles: [], status: "ready", expiresAt: new Date(Date.now() + 86400000) });
  await br.pruneBriefings(acme.id);
  const left = await db.select().from(b).where(eq(b.workspaceId, acme.id));
  check("only the 10 newest are kept, the expired one is gone", left.length === 10 && !left.some((x) => x.title === "old"), `${left.length} left`);
  check("…and their audio goes with them", (await db.select().from(schema.audioFiles).where(eq(schema.audioFiles.workspaceId, acme.id))).every((f) => left.some((l) => l.id === f.briefingId)));
  check("another workspace is untouched", (await db.select().from(b).where(eq(b.workspaceId, zebra.id))).length === 1);
  const { deleteExpiredBriefings } = await import("../src/lib/briefings-retention.ts");
  await db.insert(b).values({ workspaceId: zebra.id, title: "zebra-old", themeIds: [], themeTitles: [], expiresAt: new Date(Date.now() - 1000) });
  const n = await deleteExpiredBriefings();
  check("the daily sweep deletes expired briefings in every workspace", n === 1 && (await db.select().from(b).where(and(eq(b.workspaceId, zebra.id)))).map((x) => x.title).join() === "zebra-keep");
  check("a briefing stuck for over 8 minutes counts as failed", br.isStuck({ status: "voicing", createdAt: new Date(Date.now() - 9 * 60000) }) && !br.isStuck({ status: "voicing", createdAt: new Date() }) && !br.isStuck({ status: "ready", createdAt: new Date(0) }));
  process.exit(fail ? 1 : 0);
})();
