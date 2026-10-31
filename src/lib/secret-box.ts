import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts small secrets (workspace API keys) for storage in the database.
 *
 * AES-256-GCM: confidential AND tamper-evident — a modified value fails to
 * decrypt rather than decrypting to something else. The key comes from the
 * AI_KEYS_SECRET environment variable (any long random string; it's hashed to
 * 32 bytes). Without it, nothing can be saved or read: fails closed.
 *
 * Changing AI_KEYS_SECRET makes existing saved keys unreadable; owners would
 * need to add their keys again.
 */
const VERSION = "v1";

function masterKey(): Buffer | null {
  const s = process.env.AI_KEYS_SECRET;
  if (!s || s.length < 32) return null;
  return createHash("sha256").update(`fiq-ai-keys:${s}`).digest();
}

export function canEncrypt(): boolean {
  return masterKey() !== null;
}

export function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key) throw new Error("AI_KEYS_SECRET isn't set (or is shorter than 32 characters), so keys can't be stored safely.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString("base64")}`;
}

/** Returns the secret, or throws if it can't be read (wrong secret, tampered, or malformed). */
export function decryptSecret(stored: string): string {
  const key = masterKey();
  if (!key) throw new Error("AI_KEYS_SECRET isn't set, so saved keys can't be read.");
  const [ver, b64] = stored.split(":");
  if (ver !== VERSION || !b64) throw new Error("Unrecognised key format.");
  const raw = Buffer.from(b64, "base64");
  if (raw.length < 29) throw new Error("Unrecognised key format.");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
