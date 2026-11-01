import { receiveWebhook, webhookHelp } from "@/lib/webhook-receive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same as /api/hooks/feedback/<secret>, for apps that prefer "Authorization: Bearer <secret>". */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(auth)?.[1] ?? null;
  return receiveWebhook(token, request);
}
export const GET = webhookHelp;
