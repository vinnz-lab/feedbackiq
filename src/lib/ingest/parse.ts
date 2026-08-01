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

/** Header words that suggest free-text feedback. */
const NAME_POSITIVE =
  /feedback|comment|verbatim|quote|response|remark|note|text|message|description|detail|issue|request/i;
/** Header words that mark a column as an identifier — never the feedback body. */
const NAME_NEGATIVE =
  /(^|[^a-z])(id|ids|no|num|number|index|idx|ref|row|code|key|seq|rank|score|rating|count|qty)([^a-z]|$)|#/i;

type ColStat = {
  header: string;
  avgLen: number;
  /** Share of values that are purely a number. */
  numericFrac: number;
  /** Share of values with 3+ words — the signature of real prose. */
  wordyFrac: number;
};

function statsFor(rows: Record<string, unknown>[], header: string): ColStat {
  const sample = rows.slice(0, 100);
  const vals = sample.map((r) => String(r[header] ?? "").trim()).filter(Boolean);
  const n = vals.length || 1;
  return {
    header,
    avgLen: vals.reduce((s, v) => s + v.length, 0) / n,
    numericFrac: vals.filter((v) => /^-?\d+(?:[.,]\d+)?$/.test(v)).length / n,
    wordyFrac: vals.filter((v) => v.split(/\s+/).length >= 3).length / n,
  };
}

/**
 * Scores how likely a column is to hold the actual feedback text.
 *
 * Content is deliberately weighted above the header name. The previous version
 * took the FIRST header matching /feedback|.../, so a "Feedback ID" column beat
 * the real feedback column and every row imported as a bare row number. A
 * column of numbers is never feedback, whatever it happens to be called.
 */
function textScore(s: ColStat): number {
  let score = 0;
  if (NAME_POSITIVE.test(s.header)) score += 3;
  if (NAME_NEGATIVE.test(s.header)) score -= 6;
  score += Math.min(s.avgLen / 20, 4); // longer values look more like prose
  score += s.wordyFrac * 4; // multi-word values are the strongest signal
  score -= s.numericFrac * 10; // numeric columns are disqualifying
  return score;
}

export function pickColumns(rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] ?? {});
  const stats = headers.map((h) => statsFor(rows, h));
  const ranked = [...stats].sort((a, b) => textScore(b) - textScore(a));
  const best = ranked[0];
  const textCol = best?.header ?? headers[0] ?? "";

  // Metadata columns: matched by name, but never steal the text column and
  // never grab something that is itself prose.
  const findMeta = (re: RegExp) =>
    stats.find((s) => s.header !== textCol && re.test(s.header) && s.wordyFrac < 0.5)?.header;

  return {
    textCol,
    customerCol: findMeta(/customer|account|company|client|organi[sz]ation|org/i),
    dateCol: findMeta(/date|when|created|timestamp/i),
    submitterCol: findMeta(/submitter|author|user|name|reporter|from|contact/i),
    /** True when nothing in the sheet really looks like prose. */
    uncertain: !best || (best.wordyFrac < 0.3 && best.avgLen < 25),
  };
}

export function rowsToItems(rows: Record<string, unknown>[]): {
  items: ParsedItem[];
  mapping: string;
  uncertain: boolean;
} {
  if (!rows.length) return { items: [], mapping: "", uncertain: false };
  const { textCol, customerCol, dateCol, submitterCol, uncertain } = pickColumns(rows);
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
  return { items, mapping: textCol, uncertain };
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
      const { items, mapping, uncertain } = rowsToItems(rows);
      return {
        kind,
        filename,
        status: "processed",
        items,
        // Always state which column was read as the feedback text. A silent bad
        // mapping is how a whole sheet imported as row numbers went unnoticed.
        note: `${items.length} row${items.length === 1 ? "" : "s"} imported${
          rows.length - items.length > 0 ? ` · ${rows.length - items.length} empty skipped` : ""
        }${mapping ? ` · read "${mapping}" as the feedback text` : ""}${
          uncertain ? " · ⚠ no clear text column — please check" : ""
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
