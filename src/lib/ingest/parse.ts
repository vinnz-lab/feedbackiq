import Papa from "papaparse";
import * as XLSX from "xlsx";
import { simpleParser } from "mailparser";
import mammoth from "mammoth";

export type SourceKind =
  | "email"
  | "recording"
  | "transcript"
  | "spreadsheet"
  | "note"
  | "paste";

export type ParsedItem = {
  quote: string;
  customer?: string | null;
  submitter?: string | null;
  speaker?: string | null;
  timestampLabel?: string | null;
  rowRef?: string | null;
  occurredAt?: Date | null;
};

export type ParsedSource = {
  kind: SourceKind;
  filename: string;
  status: "processed" | "queued" | "failed";
  items: ParsedItem[];
  note?: string;
  rawText?: string;
};

const EXT = (name: string) => (name.split(".").pop() || "").toLowerCase();

export function detectKind(filename: string): SourceKind {
  const e = EXT(filename);
  if (["eml", "msg"].includes(e)) return "email";
  if (["mp3", "mp4", "m4a", "wav"].includes(e)) return "recording";
  if (["vtt", "docx", "txt"].includes(e)) return "transcript";
  if (["xlsx", "xls", "csv"].includes(e)) return "spreadsheet";
  return "note";
}

/* ---------------- spreadsheet column heuristics ---------------- */
function pickColumns(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  const find = (re: RegExp) => headers.find((h) => re.test(h));
  let textCol = find(/feedback|comment|verbatim|quote|response|remark|note|text|message/i);
  if (!textCol) {
    // fall back to the column with the longest average text
    let best = "";
    let bestLen = -1;
    for (const h of headers) {
      const avg =
        rows.reduce((s, r) => s + String(r[h] ?? "").length, 0) / (rows.length || 1);
      if (avg > bestLen) {
        bestLen = avg;
        best = h;
      }
    }
    textCol = best;
  }
  return {
    textCol,
    customerCol: find(/customer|account|company|client|organi[sz]ation|org/i),
    dateCol: find(/date|when|created|timestamp/i),
    submitterCol: find(/submitter|author|user|name|reporter|from/i),
  };
}

function rowsToItems(rows: Record<string, unknown>[]): ParsedItem[] {
  if (!rows.length) return [];
  const { textCol, customerCol, dateCol, submitterCol } = pickColumns(rows);
  const items: ParsedItem[] = [];
  rows.forEach((r, i) => {
    const quote = String(r[textCol] ?? "").trim();
    if (!quote) return;
    const dateRaw = dateCol ? r[dateCol] : null;
    const d = dateRaw ? new Date(String(dateRaw)) : null;
    items.push({
      quote,
      customer: customerCol ? String(r[customerCol] ?? "").trim() || null : null,
      submitter: submitterCol ? String(r[submitterCol] ?? "").trim() || null : null,
      rowRef: `row ${i + 2}`, // +2: header row + 1-index
      occurredAt: d && !isNaN(d.getTime()) ? d : null,
    });
  });
  return items;
}

/* ---------------- transcript / text cleaners ---------------- */
function cleanVtt(text: string): string {
  return text
    .split(/\r?\n/)
    .filter(
      (l) =>
        l.trim() &&
        l.trim() !== "WEBVTT" &&
        !l.includes("-->") &&
        !/^\d+$/.test(l.trim()),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------- main entry ---------------- */
export async function parseFile(
  filename: string,
  buffer: Buffer,
): Promise<ParsedSource> {
  const kind = detectKind(filename);
  try {
    if (kind === "recording") {
      return {
        kind,
        filename,
        status: "queued",
        items: [],
        note: "Awaiting transcription — enabled in M2 (AI pipeline).",
      };
    }

    if (kind === "email") {
      if (EXT(filename) === "msg") {
        return {
          kind,
          filename,
          status: "failed",
          items: [],
          note: "Outlook .msg isn't supported yet — export as .eml or paste the text.",
        };
      }
      const mail = await simpleParser(buffer);
      const body = (mail.text || mail.subject || "").trim();
      return {
        kind,
        filename,
        status: "processed",
        rawText: body,
        items: body
          ? [
              {
                quote: body,
                submitter: mail.from?.text || null,
                occurredAt: mail.date || null,
              },
            ]
          : [],
        note: mail.subject ? `Subject: ${mail.subject}` : undefined,
      };
    }

    if (kind === "spreadsheet") {
      let rows: Record<string, unknown>[] = [];
      if (EXT(filename) === "csv") {
        const parsed = Papa.parse<Record<string, unknown>>(buffer.toString("utf8"), {
          header: true,
          skipEmptyLines: true,
        });
        rows = parsed.data;
      } else {
        const wb = XLSX.read(buffer, { type: "buffer" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      }
      const items = rowsToItems(rows);
      return {
        kind,
        filename,
        status: "processed",
        items,
        note: `${items.length} row${items.length === 1 ? "" : "s"} imported${
          rows.length - items.length > 0 ? ` · ${rows.length - items.length} empty skipped` : ""
        }`,
      };
    }

    // transcript / note (txt, vtt, docx)
    const e = EXT(filename);
    let text = "";
    if (e === "docx") {
      const res = await mammoth.extractRawText({ buffer });
      text = res.value;
    } else if (e === "vtt") {
      text = cleanVtt(buffer.toString("utf8"));
    } else {
      text = buffer.toString("utf8");
    }
    text = text.trim();
    return {
      kind: e === "txt" ? "note" : kind,
      filename,
      status: "processed",
      rawText: text,
      items: text ? [{ quote: text }] : [],
      note: text ? undefined : "No text found.",
    };
  } catch (err) {
    return {
      kind,
      filename,
      status: "failed",
      items: [],
      note: `Could not parse: ${(err as Error).message}`,
    };
  }
}

/* paste → single note item */
export function parsePaste(text: string): ParsedSource {
  const t = text.trim();
  return {
    kind: "paste",
    filename: "Pasted content",
    status: "processed",
    rawText: t,
    items: t ? [{ quote: t }] : [],
  };
}
