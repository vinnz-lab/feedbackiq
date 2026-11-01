/**
 * "Send feedback": what people using the app tell the platform owner goes to
 * the owner's OWN Insight Hub workspace, through its incoming webhook.
 *
 * The address is a secret, so it lives in an environment variable
 * (INSIGHT_HUB_FEEDBACK_WEBHOOK), set in Vercel. Without it the button is hidden.
 */
export function appFeedbackUrl(): string | null {
  const raw = process.env.INSIGHT_HUB_FEEDBACK_WEBHOOK?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    if (!/\/api\/hooks\/feedback\/fiqwh_[A-Za-z0-9]{32}$/.test(u.pathname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export const FEEDBACK_KINDS = ["Idea", "Problem", "Question", "Praise"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export const MAX_FEEDBACK_CHARS = 4000;
export const MAX_PER_HOUR = 10;
