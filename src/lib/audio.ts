
/**
 * Audio helpers for briefings: read what the voice model returns (raw 16-bit
 * PCM or a WAV file), join the pieces, and encode to a small mono MP3.
 */
export type Pcm = { samples: Int16Array; rate: number };

/** Gemini returns either raw little-endian 16-bit PCM ("audio/L16;rate=24000") or a WAV. */
export function decodeSpeech(bytes: Buffer, mimeType = ""): Pcm {
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE") {
    let rate = 24000;
    let bits = 16;
    let channels = 1;
    let off = 12;
    while (off + 8 <= bytes.length) {
      const id = bytes.toString("ascii", off, off + 4);
      const size = bytes.readUInt32LE(off + 4);
      const body = off + 8;
      if (id === "fmt ") {
        channels = bytes.readUInt16LE(body + 2);
        rate = bytes.readUInt32LE(body + 4);
        bits = bytes.readUInt16LE(body + 14);
      } else if (id === "data") {
        if (bits !== 16) throw new Error(`Unsupported audio (${bits}-bit).`);
        const end = Math.min(bytes.length, body + (size || bytes.length - body));
        const pcm = toInt16(bytes.subarray(body, end));
        return { samples: channels === 1 ? pcm : downmix(pcm, channels), rate };
      }
      off = body + size + (size % 2);
    }
    throw new Error("The audio file had no sound data.");
  }
  const m = /rate=(\d+)/i.exec(mimeType);
  return { samples: toInt16(bytes), rate: m ? Number(m[1]) : 24000 };
}

function toInt16(b: Buffer): Int16Array {
  const n = Math.floor(b.length / 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = b.readInt16LE(i * 2);
  return out;
}

function downmix(pcm: Int16Array, channels: number): Int16Array {
  const out = new Int16Array(Math.floor(pcm.length / channels));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += pcm[i * channels + c];
    out[i] = Math.round(sum / channels);
  }
  return out;
}

/** Joins pieces with a short pause between them. All pieces must share a sample rate. */
export function joinPcm(parts: Pcm[], pauseMs = 350): Pcm {
  if (!parts.length) throw new Error("No audio to join.");
  const rate = parts[0].rate;
  if (parts.some((p) => p.rate !== rate)) throw new Error("Audio pieces came back at different sample rates.");
  const gap = Math.round((rate * pauseMs) / 1000);
  const total = parts.reduce((n, p) => n + p.samples.length, 0) + gap * (parts.length - 1);
  const out = new Int16Array(total);
  let at = 0;
  parts.forEach((p, i) => {
    out.set(p.samples, at);
    at += p.samples.length + (i < parts.length - 1 ? gap : 0);
  });
  return { samples: out, rate };
}

/** Mono MP3; 48 kbps is plenty for speech (≈1.8 MB for 5 minutes). */
export async function encodeMp3(pcm: Pcm, kbps = 48): Promise<Buffer> {
  // Loaded as an ES module: its CommonJS build doesn't export the encoder.
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, pcm.rate, kbps);
  const chunks: Buffer[] = [];
  const BLOCK = 1152;
  for (let i = 0; i < pcm.samples.length; i += BLOCK) {
    const b = enc.encodeBuffer(pcm.samples.subarray(i, i + BLOCK));
    if (b.length) chunks.push(Buffer.from(b.buffer, b.byteOffset, b.length));
  }
  const end = enc.flush();
  if (end.length) chunks.push(Buffer.from(end.buffer, end.byteOffset, end.length));
  return Buffer.concat(chunks);
}

export const durationSec = (pcm: Pcm) => Math.round(pcm.samples.length / pcm.rate);
