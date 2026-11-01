import { createHash, randomBytes } from "node:crypto";

/**
 * Incoming webhook: other apps (Zapier, Make, Typeform, Google Forms, Intercom…)
 * send feedback to a workspace's private address.
 *
 * The address contains a secret. Only its SHA-256 hash is stored, so the
 * address is shown once, like a password; a leaked database can't be used to
 * send feedback in.
 */
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TOKEN_PREFIX = "fiqwh_";

export function generateWebhookToken(): string {
  const bytes = randomBytes(32);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return TOKEN_PREFIX + out;
}

export function hashWebhookToken(token: string): string {
  return createHash("sha256").update(`fiq-webhook:${token}`).digest("hex");
}

export function looksLikeWebhookToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^fiqwh_[A-Za-z0-9]{32}$/.test(token);
}

/* ---------------------------------------------------------------- payloads */

export const MAX_BODY_BYTES = 256 * 1024;
export const MAX_ITEMS = 50;
export const MAX_TEXT = 20_000;
export const MAX_PER_MINUTE = 60;

export type WebhookItem = {
  quote: string;
  customer: string | null;
  submitter: string | null;
  occurredAt: Date | null;
};

// Field names other apps commonly use, matched case-insensitively.
const TEXT_KEYS = ["feedback", "text", "message", "quote", "body", "comment", "comments", "content", "description", "review", "answer"];
const CUSTOMER_KEYS = ["customer", "company", "account", "organisation", "organization", "org", "client"];
const PERSON_KEYS = ["name", "submitter", "author", "from", "user", "email", "contact"];
const DATE_KEYS = ["date", "created_at", "createdat", "timestamp", "submitted_at", "submittedat", "occurred_at", "occurredat", "time"];
const SOURCE_KEYS = ["source", "app", "channel", "form"];
const LIST_KEYS = ["items", "feedback", "records", "entries", "responses", "data"];

type Obj = Record<string, unknown>;

/** Lower-cased copy with only own, safe keys (no __proto__ / constructor tricks). */
function normalise(o: Obj): Map<string, unknown> {
  const m = new Map<string, unknown>();
  for (const [k, v] of Object.entries(o)) {
    const key = k.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (!m.has(key)) m.set(key, v);
  }
  return m;
}

function str(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function pick(m: Map<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(m.get(k));
    if (v) return v;
  }
  return null;
}

function date(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(/^\d{10}$/.test(v) ? Number(v) * 1000 : /^\d{13}$/.test(v) ? Number(v) : v);
  if (!Number.isFinite(d.getTime())) return null;
  if (d.getTime() > Date.now() + 86_400_000) return null; // in the future: ignore
  return d;
}

function toItem(o: unknown): { item: WebhookItem; truncated: boolean } | null {
  if (typeof o === "string") {
    const t = o.trim();
    return t ? { item: { quote: t.slice(0, MAX_TEXT), customer: null, submitter: null, occurredAt: null }, truncated: t.length > MAX_TEXT } : null;
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const m = normalise(o as Obj);
  const text = pick(m, TEXT_KEYS);
  if (!text) return null;
  return {
    item: {
      quote: text.slice(0, MAX_TEXT),
      customer: pick(m, CUSTOMER_KEYS)?.slice(0, 200) ?? null,
      submitter: pick(m, PERSON_KEYS)?.slice(0, 200) ?? null,
      occurredAt: date(pick(m, DATE_KEYS)),
    },
    truncated: text.length > MAX_TEXT,
  };
}

export type ParseResult =
  | { ok: true; items: WebhookItem[]; source: string | null; truncated: number; ignored: number }
  | { ok: false; error: string };

/**
 * Accepts JSON (one item, a list, or { items: [...] }), form posts, or plain
 * text. Anything without a feedback text is ignored and counted, not fatal.
 */
export function parseWebhookBody(raw: string, contentType: string): ParseResult {
  const ct = contentType.toLowerCase();
  let data: unknown;
  if (ct.includes("application/x-www-form-urlencoded") && !raw.includes("=")) {
    // Tools (and curl -d) often label raw text as a form; with no field=value
    // pairs it can only be plain text.
    let t = raw.replace(/\+/g, " ");
    try { t = decodeURIComponent(t); } catch { /* keep as sent */ }
    data = t;
  } else if (ct.includes("application/x-www-form-urlencoded")) {
    data = Object.fromEntries(new URLSearchParams(raw));
  } else if (ct.includes("text/plain") || (!ct.includes("json") && !/^\s*[[{]/.test(raw))) {
    data = raw;
  } else {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, error: "The body isn't valid JSON." };
    }
  }

  let list: unknown[];
  let source: string | null = null;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === "object") {
    const m = normalise(data as Obj);
    source = pick(m, SOURCE_KEYS);
    const arr = LIST_KEYS.map((k) => m.get(k)).find(Array.isArray) as unknown[] | undefined;
    list = arr ?? [data];
  } else list = [data];

  if (list.length > MAX_ITEMS) return { ok: false, error: `Send at most ${MAX_ITEMS} items per request (this had ${list.length}).` };
  const items: WebhookItem[] = [];
  let truncated = 0;
  let ignored = 0;
  for (const entry of list) {
    const r = toItem(entry);
    if (!r) {
      ignored++;
      continue;
    }
    if (r.truncated) truncated++;
    items.push(r.item);
  }
  if (!items.length) {
    return { ok: false, error: `No feedback text found. Send it in a field called one of: ${TEXT_KEYS.slice(0, 4).join(", ")}.` };
  }
  return { ok: true, items, source: source?.slice(0, 80) ?? null, truncated, ignored };
}
