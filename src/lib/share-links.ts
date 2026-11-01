import { createHash, randomBytes } from "node:crypto";

/** Read-only share links: "ihs_" + 32 letters/digits. Only a hash is used to find them. */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export type ShareKind = "digest" | "roadmap";
export const SHARE_KINDS: ShareKind[] = ["digest", "roadmap"];

export function generateShareToken(): string {
  let out = "";
  for (const b of randomBytes(32)) out += ALPHABET[b % ALPHABET.length];
  return "ihs_" + out;
}
export function hashShareToken(token: string): string {
  return createHash("sha256").update(`ih-share:${token}`).digest("hex");
}
export function looksLikeShareToken(t: unknown): t is string {
  return typeof t === "string" && /^ihs_[A-Za-z0-9]{32}$/.test(t);
}
export const sharePath = (token: string) => `/share/${token}`;
