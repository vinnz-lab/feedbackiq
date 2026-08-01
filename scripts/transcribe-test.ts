/**
 * Tests the AssemblyAI client against the documented request/response shapes.
 * Stubs global fetch, so it needs no API key and spends no credits.
 *
 * Run: npx tsx scripts/transcribe-test.ts
 */
async function main() {
  const mod = await import("../src/lib/ai/transcribe.ts");
  const {
    uploadAudio,
    submitTranscription,
    getTranscript,
    formatTranscript,
    msToTimestamp,
    speakerCount,
    isTranscriptionConfigured,
  } = mod;

  const pass: string[] = [];
  const fail: string[] = [];
  const check = (n: string, ok: boolean, d = "") => (ok ? pass : fail).push(`${n}${d ? " — " + d : ""}`);

  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

  // --- configuration gate -------------------------------------------------
  delete process.env.ASSEMBLYAI_API_KEY;
  check("reports unconfigured without a key", isTranscriptionConfigured() === false);
  try {
    await uploadAudio(Buffer.from("x"));
    check("throws a clear error when unconfigured", false, "did not throw");
  } catch (e) {
    check("throws a clear error when unconfigured", (e as Error).name === "TranscriptionNotConfigured");
  }

  process.env.ASSEMBLYAI_API_KEY = "test-key";
  check("reports configured with a key", isTranscriptionConfigured() === true);

  // --- upload -------------------------------------------------------------
  let seen: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), init };
    return json({ upload_url: "https://cdn.assemblyai.com/upload/abc123" });
  }) as unknown as typeof globalThis.fetch;

  const bytes = Buffer.from([1, 2, 3, 4]);
  const uploadUrl = await uploadAudio(bytes);
  const s = seen! as { url: string; init: RequestInit };
  check("upload hits the documented endpoint", s.url === "https://api.assemblyai.com/v2/upload", s.url);
  check("upload uses POST", s.init.method === "POST");
  check(
    "auth header is bare key, no Bearer prefix",
    (s.init.headers as Record<string, string>).authorization === "test-key",
    JSON.stringify(s.init.headers),
  );
  check("upload body is raw bytes, not JSON", Buffer.isBuffer(s.init.body) || s.init.body instanceof Uint8Array);
  check("returns the upload_url", uploadUrl === "https://cdn.assemblyai.com/upload/abc123");

  // --- submit -------------------------------------------------------------
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), init };
    return json({ id: "job-1", status: "processing" });
  }) as unknown as typeof globalThis.fetch;

  const jobId = await submitTranscription(uploadUrl);
  const s2 = seen! as { url: string; init: RequestInit };
  const body = JSON.parse(String(s2.init.body));
  check("submit hits the transcript endpoint", s2.url === "https://api.assemblyai.com/v2/transcript");
  check("submit enables speaker diarization", body.speaker_labels === true, JSON.stringify(body));
  check("submit passes the audio url", body.audio_url === uploadUrl);
  check("returns the job id", jobId === "job-1");

  // --- poll: still running ------------------------------------------------
  globalThis.fetch = (async () => json({ status: "processing", utterances: null })) as typeof globalThis.fetch;
  const running = await getTranscript("job-1");
  check("in-progress status passes through", running.status === "processing");
  check("no utterances yet is an empty array, not null", Array.isArray(running.utterances));

  // --- poll: failed -------------------------------------------------------
  globalThis.fetch = (async () =>
    json({ status: "error", error: "Unsupported file format" })) as typeof globalThis.fetch;
  const errored = await getTranscript("job-1");
  check("error status passes through", errored.status === "error");
  check("error message is surfaced", errored.error === "Unsupported file format");

  // --- poll: completed with diarization -----------------------------------
  globalThis.fetch = (async () =>
    json({
      status: "completed",
      text: "plain fallback text",
      audio_duration: 430, // seconds per the docs
      utterances: [
        { speaker: "A", text: "The board takes ten seconds to load.", start: 19000, end: 24000, confidence: 0.97 },
        { speaker: "B", text: "Same for us on big boards.", start: 80000, end: 86000, confidence: 0.95 },
        { speaker: "A", text: "Exporting to CSV times out too.", start: 3_671_000, end: 3_675_000, confidence: 0.9 },
        { speaker: "B", text: "   ", start: 90000, end: 91000, confidence: 0.4 }, // blank, must drop
      ],
    })) as typeof globalThis.fetch;

  const done = await getTranscript("job-1");
  check("completed status passes through", done.status === "completed");
  check("blank utterances are dropped", done.utterances.length === 3, `${done.utterances.length}`);
  check("audio duration in seconds", done.audioDurationSec === 430);
  check("distinct speakers counted", speakerCount(done) === 2, `${speakerCount(done)}`);

  // --- timestamp conversion (ms → H:MM:SS) --------------------------------
  check("ms → timestamp: zero", msToTimestamp(0) === "00:00:00", msToTimestamp(0));
  check("ms → timestamp: 19s", msToTimestamp(19000) === "00:00:19", msToTimestamp(19000));
  check("ms → timestamp: 1m20s", msToTimestamp(80000) === "00:01:20", msToTimestamp(80000));
  check("ms → timestamp: past an hour", msToTimestamp(3_671_000) === "01:01:11", msToTimestamp(3_671_000));

  // --- formatting for the splitter ----------------------------------------
  const text = formatTranscript(done);
  const firstLine = text.split("\n")[0];
  check(
    "formats as [timestamp] Speaker X: text",
    firstLine === "[00:00:19] Speaker A: The board takes ten seconds to load.",
    firstLine,
  );
  check("one line per utterance", text.split("\n").length === 3);
  check("speaker labels preserved", text.includes("Speaker B:"));

  // --- fallback when diarization returns nothing --------------------------
  const mono = formatTranscript({
    status: "completed",
    error: null,
    text: "a mono recording with no speaker split",
    utterances: [],
    audioDurationSec: 60,
  });
  check("falls back to plain text when no utterances", mono === "a mono recording with no speaker split");

  // --- HTTP failure surfaces ----------------------------------------------
  globalThis.fetch = (async () => new Response("nope", { status: 401 })) as typeof globalThis.fetch;
  try {
    await getTranscript("job-1");
    check("HTTP errors throw", false, "did not throw");
  } catch (e) {
    check("HTTP errors throw with status", /401/.test((e as Error).message), (e as Error).message);
  }

  console.log("\nPASS:");
  pass.forEach((p) => console.log("  ✓ " + p));
  if (fail.length) {
    console.log("\nFAIL:");
    fail.forEach((f) => console.log("  ✗ " + f));
  }
  console.log(`\n${pass.length}/${pass.length + fail.length} checks passed`);
  process.exit(fail.length ? 1 : 0);
}
main();
