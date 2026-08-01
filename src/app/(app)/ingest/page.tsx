"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { UploadCloud, X, FileText } from "lucide-react";

type Summary = {
  totalItems: number;
  sources: { filename: string; kind: string; status: string; items: number; note?: string }[];
};

const ACCEPT = ".eml,.txt,.vtt,.docx,.csv,.xlsx,.xls,.mp3,.mp4,.m4a,.wav";

/** The host rejects request bodies over 4.5MB before any of our code runs, so
 *  we stop oversized files here rather than letting them die with an opaque
 *  413 that explains nothing. Kept under the ceiling for multipart overhead. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export default function IngestPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = incoming.filter((f) => f.size <= MAX_FILE_BYTES);

    setError(
      tooBig.length
        ? `${tooBig.map((f) => `“${f.name}” (${(f.size / 1024 / 1024).toFixed(1)}MB)`).join(", ")} exceeds the ${(
            MAX_FILE_BYTES /
            1024 /
            1024
          ).toFixed(0)}MB upload limit. For a long recording, upload a shorter clip or an exported transcript for now.`
        : null,
    );
    if (ok.length) setFiles((prev) => [...prev, ...ok]);
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, k) => k !== i));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      if (paste.trim()) fd.append("paste", paste);
      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ingestion failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setPaste("");
    setResult(null);
    setError(null);
  };

  const canSubmit = (files.length > 0 || paste.trim().length > 0) && !busy;

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-[30px] font-bold leading-9 tracking-tight">Ingested ✓</h1>
        <p className="mt-1 mb-6 text-[13px] text-muted">
          {result.totalItems} feedback item{result.totalItems === 1 ? "" : "s"} captured from{" "}
          {result.sources.length} source{result.sources.length === 1 ? "" : "s"} — now in the
          Needs-review queue, awaiting AI classification (M2).
        </p>
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow)]">
          {result.sources.map((s, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <FileText size={16} className="text-muted" />
              <div className="flex-1">
                <div className="text-[13px] font-semibold">{s.filename}</div>
                {s.note && <div className="text-[11.5px] text-muted">{s.note}</div>}
              </div>
              <span
                className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[11.5px] font-semibold"
                style={
                  s.status === "processed"
                    ? { background: "var(--emerald-soft)", color: "var(--emerald)" }
                    : s.status === "failed"
                      ? { background: "var(--rose-soft)", color: "var(--rose)" }
                      : { background: "var(--amber-soft)", color: "var(--amber)" }
                }
              >
                {s.items} item{s.items === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2.5">
          <Link
            href="/register?tab=review"
            className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
          >
            View in Register →
          </Link>
          <button
            onClick={reset}
            className="rounded-[var(--radius-btn)] border border-border bg-surface px-4 py-2 text-[13px] font-semibold hover:bg-hover"
          >
            Ingest more
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[30px] font-bold leading-9 tracking-tight">Ingest feedback</h1>
      <p className="mt-1 mb-6 text-[13px] text-muted">
        Drop files or paste text. We detect the source type and extract feedback items. Audio and
        video are transcribed with speaker labels, then split into individual points. Max 4MB per
        file.
      </p>

      {/* dropzone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed p-8 text-center transition ${
          dragOver ? "border-indigo bg-[var(--indigo-soft)]" : "border-border bg-surface"
        }`}
      >
        <UploadCloud className="text-indigo" />
        <div className="text-[15px] font-semibold">Drop files here or click to browse</div>
        <div className="text-[12px] text-muted">
          📧 .eml · 📊 .csv .xlsx · 🎙 .vtt .txt .docx · 🎬 .mp3 .mp4 .m4a .wav
        </div>
        <div className="text-[11px] text-muted opacity-75">
          Recordings are stored now and transcribed in M2.
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* staged files */}
      {files.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-[var(--radius-btn)] border border-border bg-surface px-3 py-2 text-[13px]"
            >
              <FileText size={15} className="text-muted" />
              <span className="flex-1 font-medium">{f.name}</span>
              <span className="text-[11.5px] text-muted">{(f.size / 1024).toFixed(0)} KB</span>
              <button
                onClick={() => removeFile(i)}
                className="rounded-[6px] p-1 text-muted hover:bg-[var(--rose-soft)] hover:text-rose"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* paste */}
      <div className="my-4 flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-border" /> or paste content <span className="h-px flex-1 bg-border" />
      </div>
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        rows={4}
        placeholder="Paste an email, meeting notes, or any feedback text…"
        className="w-full rounded-[var(--radius-btn)] border border-border bg-surface p-3 text-[13px] outline-none focus:border-indigo"
      />

      {error && (
        <div className="mt-3 rounded-[var(--radius-btn)] border border-[var(--rose)] bg-[var(--rose-soft)] px-3 py-2 text-[13px] text-rose">
          {error}
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="rounded-[var(--radius-btn)] bg-indigo px-4 py-2 text-[13px] font-semibold text-white transition enabled:hover:brightness-110 disabled:opacity-45"
        >
          {busy ? "Extracting…" : "✨ Extract & save"}
        </button>
        {(files.length > 0 || paste.trim()) && !busy && (
          <button onClick={reset} className="text-[13px] font-semibold text-muted hover:text-fg">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
