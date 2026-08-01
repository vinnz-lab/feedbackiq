/**
 * AssemblyAI transcription with speaker diarization.
 *
 * Chosen over cheaper speech-to-text because it labels WHO said each line.
 * That matters here: the splitter attributes every extracted feedback point to
 * a speaker and a timestamp, which is the citation quality that sets this apart
 * from tools that can only say "someone said this on a call somewhere".
 *
 * The API is asynchronous — upload, submit, then poll — which suits Vercel,
 * where a function cannot outlive 300s or run work in the background.
 *
 * Key lives in ASSEMBLYAI_API_KEY (env only — never in source or chat).
 */
const API = "https://api.assemblyai.com/v2";

export type TranscriptStatus = "queued" | "processing" | "completed" | "error";

export type Utterance = {
  speaker: string; // "A", "B", ... AssemblyAI does not know real names
  text: string;
  start: number; // milliseconds
  end: number; // milliseconds
};

export type TranscriptResult = {
  status: TranscriptStatus;
  error: string | null;
  text: string | null;
  utterances: Utterance[];
  audioDurationSec: number | null;
};

export class TranscriptionNotConfigured extends Error {
  constructor() {
    super("ASSEMBLYAI_API_KEY is not set");
    this.name = "TranscriptionNotConfigured";
  }
}

function key(): string {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new TranscriptionNotConfigured();
  return k;
}

export function isTranscriptionConfigured() {
  return Boolean(process.env.ASSEMBLYAI_API_KEY);
}

/** Milliseconds → H:MM:SS, matching the timestamp style of uploaded transcripts. */
export function msToTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Uploads raw audio bytes. The body must be the raw buffer — sending JSON or a
 * path yields a valid-looking URL that fails later with "Transcoding failed".
 */
export async function uploadAudio(bytes: Buffer | Uint8Array): Promise<string> {
  const res = await fetch(`${API}/upload`, {
    method: "POST",
    headers: { authorization: key() },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`AssemblyAI upload ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { upload_url?: string };
  if (!data.upload_url) throw new Error("AssemblyAI upload returned no upload_url");
  return data.upload_url;
}

/** Queues a diarized transcription. Returns the job id to poll. */
export async function submitTranscription(audioUrl: string): Promise<string> {
  const res = await fetch(`${API}/transcript`, {
    method: "POST",
    headers: { authorization: key(), "content-type": "application/json" },
    body: JSON.stringify({ audio_url: audioUrl, speaker_labels: true }),
  });
  if (!res.ok) {
    throw new Error(`AssemblyAI submit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("AssemblyAI submit returned no id");
  return data.id;
}

export async function getTranscript(id: string): Promise<TranscriptResult> {
  const res = await fetch(`${API}/transcript/${id}`, { headers: { authorization: key() } });
  if (!res.ok) {
    throw new Error(`AssemblyAI poll ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const d = (await res.json()) as {
    status?: string;
    error?: string | null;
    text?: string | null;
    audio_duration?: number | null;
    utterances?: { speaker?: string; text?: string; start?: number; end?: number }[] | null;
  };

  return {
    status: (d.status as TranscriptStatus) ?? "processing",
    error: d.error ?? null,
    text: d.text ?? null,
    audioDurationSec: typeof d.audio_duration === "number" ? d.audio_duration : null,
    utterances: (d.utterances ?? [])
      .filter((u) => typeof u.text === "string" && u.text.trim())
      .map((u) => ({
        speaker: u.speaker ?? "?",
        text: (u.text ?? "").trim(),
        start: typeof u.start === "number" ? u.start : 0,
        end: typeof u.end === "number" ? u.end : 0,
      })),
  };
}

/**
 * Renders diarized utterances into the timestamped, speaker-prefixed layout the
 * feedback extractor already understands:
 *
 *   [00:00:19] Speaker A: The board takes nearly ten seconds to load.
 *
 * Falls back to the plain transcript when diarization produced nothing, so a
 * mono recording still yields usable text rather than an empty source.
 */
export function formatTranscript(result: TranscriptResult): string {
  if (!result.utterances.length) return (result.text ?? "").trim();
  return result.utterances
    .map((u) => `[${msToTimestamp(u.start)}] Speaker ${u.speaker}: ${u.text}`)
    .join("\n");
}

/** Distinct speakers detected, for the source note. */
export function speakerCount(result: TranscriptResult): number {
  return new Set(result.utterances.map((u) => u.speaker)).size;
}
