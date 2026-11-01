import { AiRateLimitError, parseThrottle } from "./client";
import { decodeSpeech, joinPcm, type Pcm } from "@/lib/audio";

/**
 * Two-voice speech from Google Gemini's text-to-speech models.
 * Turns are sent in a few chunks (each well inside the model's limits) and
 * joined. If the current model or request shape is refused, it falls back once
 * to the long-standing "Speaker: line" format and model.
 */
export type Turn = { speaker: string; text: string };
export type VoiceKey = { key: string; source: "workspace" | "platform" };

const MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";
const FALLBACK_MODEL = process.env.GEMINI_TTS_FALLBACK_MODEL || "gemini-2.5-flash-preview-tts";
const CHUNK_CHARS = 3200;
const TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS) || 150_000;
export const VOICES: Record<string, string> = { Ava: "Kore", Leo: "Puck" };
const STYLE: Record<string, string> = { Ava: "warm, clear and curious, like a podcast host", Leo: "relaxed, friendly and thoughtful" };

export function chunkTurns(turns: Turn[], max = CHUNK_CHARS): Turn[][] {
  const out: Turn[][] = [];
  let cur: Turn[] = [];
  let n = 0;
  for (const t of turns) {
    if (cur.length && n + t.text.length > max) {
      out.push(cur);
      cur = [];
      n = 0;
    }
    cur.push(t);
    n += t.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

class ShapeRefused extends Error {}

async function request(model: string, body: unknown, key: string): Promise<Pcm> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429 || res.status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(text)) {
      const { scope, retryAfterSeconds } = parseThrottle(text);
      throw new AiRateLimitError(`Gemini TTS ${res.status}: ${text.slice(0, 200)}`, scope, retryAfterSeconds, "gemini");
    }
    if (res.status === 400 || res.status === 404) throw new ShapeRefused(`Gemini TTS ${res.status}: ${text.slice(0, 200)}`);
    if (res.status === 401 || res.status === 403) throw new Error("Google didn't accept the AI key for voices. Check it in Integrations → AI.");
    throw new Error(`Gemini TTS ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[] };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const pieces = parts.filter((p) => p.inlineData?.data).map((p) => decodeSpeech(Buffer.from(p.inlineData!.data!, "base64"), p.inlineData!.mimeType));
  if (!pieces.length) throw new Error("The voice model returned no audio.");
  return pieces.length === 1 ? pieces[0] : joinPcm(pieces, 0);
}

const speakers = () =>
  Object.entries(VOICES).map(([speaker, voiceName]) => ({ speaker, voiceConfig: { prebuiltVoiceConfig: { voiceName } } }));

function currentShape(turns: Turn[]) {
  return {
    contents: [{ role: "user", parts: turns.map((t) => ({ text: t.text, speech_metadata: { speaker: t.speaker, style: STYLE[t.speaker] } })) }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakers() } } },
  };
}

function legacyShape(turns: Turn[]) {
  const script = turns.map((t) => `${t.speaker}: ${t.text}`).join("\n");
  return {
    contents: [{ parts: [{ text: `Read this podcast conversation between Ava and Leo naturally, warm and conversational:\n${script}` }] }],
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakers() } } },
  };
}

let useLegacy = false;

async function speakChunk(turns: Turn[], key: string): Promise<Pcm> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (!useLegacy) {
        try {
          return await request(MODEL, currentShape(turns), key);
        } catch (e) {
          if (!(e instanceof ShapeRefused)) throw e;
          useLegacy = true; // remember for the rest of this server's life
        }
      }
      return await request(FALLBACK_MODEL, legacyShape(turns), key);
    } catch (e) {
      if (e instanceof AiRateLimitError && e.scope !== "day" && attempt === 1) {
        await new Promise((r) => setTimeout(r, Math.min(20_000, (e.retryAfterSeconds ?? 8) * 1000)));
        continue;
      }
      if (e instanceof ShapeRefused) throw new Error("Google's voice model refused the request. Try again later.");
      throw e;
    }
  }
  throw new Error("Couldn't make the audio.");
}

/** Speaks the whole conversation and returns one joined recording. */
export async function speakConversation(turns: Turn[], voice: VoiceKey): Promise<Pcm> {
  const pieces: Pcm[] = [];
  for (const chunk of chunkTurns(turns)) pieces.push(await speakChunk(chunk, voice.key));
  return joinPcm(pieces);
}

/** For tests. */
export function _resetTtsShape() {
  useLegacy = false;
}
