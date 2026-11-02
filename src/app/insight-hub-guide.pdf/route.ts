import { GUIDE_PDF_BASE64 } from "@/lib/guide-pdf-data";

export const dynamic = "force-static";

/** The getting-started guide. Public on purpose: it's meant for sharing (e.g. from LinkedIn). */
export function GET() {
  return new Response(new Uint8Array(Buffer.from(GUIDE_PDF_BASE64, "base64")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="Insight-Hub-Getting-Started.pdf"',
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
