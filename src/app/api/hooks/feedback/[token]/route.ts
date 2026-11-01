import { receiveWebhook, webhookHelp } from "@/lib/webhook-receive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST feedback to /api/hooks/feedback/<secret>. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return receiveWebhook((await params).token, request);
}
export const GET = webhookHelp;
